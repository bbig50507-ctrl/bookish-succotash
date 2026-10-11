-- Supabase schema for booking review + Claude worker.
-- Review in a disposable Supabase project before applying to production.
-- pg_net is intentionally configured in the `extensions` schema below.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_net with schema extensions;

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  property_ref text not null,
  check_in date not null,
  check_out date not null,
  guest_count integer,
  customer_note text,
  status text not null default 'pending_review'
    check (status in ('pending_review', 'confirmed', 'cancelled')),
  created_at timestamptz not null default now(),
  constraint bookings_dates_valid check (check_out > check_in),
  constraint bookings_guest_count_valid check (guest_count is null or guest_count > 0)
);

create index if not exists bookings_user_created_idx
  on public.bookings (user_id, created_at desc);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  task_type text not null check (task_type in ('booking_review')),
  input jsonb not null default '{}'::jsonb,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'succeeded', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 10),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_queue_idx
  on public.tasks (available_at, created_at)
  where status = 'queued';
create index if not exists tasks_booking_idx on public.tasks (booking_id);

create table if not exists public.task_results (
  task_id uuid primary key references public.tasks(id) on delete cascade,
  result jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.task_events (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.tasks(id) on delete cascade,
  old_status text,
  new_status text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists task_events_task_created_idx
  on public.task_events (task_id, created_at desc);

-- RLS: a customer may create a pending booking and read only their own records.
-- There is deliberately no customer UPDATE policy, so users cannot confirm bookings.
alter table public.bookings enable row level security;
alter table public.tasks enable row level security;
alter table public.task_results enable row level security;
alter table public.task_events enable row level security;

drop policy if exists bookings_select_own on public.bookings;
create policy bookings_select_own on public.bookings
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists bookings_insert_own_pending on public.bookings;
create policy bookings_insert_own_pending on public.bookings
  for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending_review');

drop policy if exists tasks_select_own on public.tasks;
create policy tasks_select_own on public.tasks
  for select to authenticated using (owner_id = (select auth.uid()));

drop policy if exists task_results_select_own on public.task_results;
create policy task_results_select_own on public.task_results
  for select to authenticated
  using (exists (
    select 1 from public.tasks t
    where t.id = task_results.task_id and t.owner_id = (select auth.uid())
  ));

drop policy if exists task_events_select_own on public.task_events;
create policy task_events_select_own on public.task_events
  for select to authenticated
  using (exists (
    select 1 from public.tasks t
    where t.id = task_events.task_id and t.owner_id = (select auth.uid())
  ));

-- Customer inserts a booking; this SECURITY DEFINER trigger creates its private task.
create or replace function public.enqueue_booking_review()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_task_id uuid;
begin
  insert into public.tasks (booking_id, owner_id, task_type, input)
  values (
    new.id,
    new.user_id,
    'booking_review',
    jsonb_build_object(
      'booking_id', new.id,
      'property_ref', new.property_ref,
      'check_in', new.check_in,
      'check_out', new.check_out,
      'guest_count', new.guest_count,
      'customer_note', new.customer_note
    )
  )
  returning id into v_task_id;

  return new;
end;
$$;

revoke all on function public.enqueue_booking_review() from public, anon, authenticated;
drop trigger if exists bookings_enqueue_review on public.bookings;
create trigger bookings_enqueue_review
after insert on public.bookings
for each row execute function public.enqueue_booking_review();

-- Atomic claim: concurrent workers only receive rows they successfully lock.
create or replace function public.worker_claim_tasks(
  p_task_id uuid default null,
  p_batch_size integer default 10
)
returns setof public.tasks
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required';
  end if;
  if p_batch_size < 1 or p_batch_size > 50 then
    raise exception 'batch size must be between 1 and 50';
  end if;

  return query
  with candidates as (
    select t.id
    from public.tasks t
    where t.status = 'queued'
      and t.available_at <= now()
      and (p_task_id is null or t.id = p_task_id)
    order by t.available_at, t.created_at
    for update skip locked
    limit case when p_task_id is null then p_batch_size else 1 end
  ), claimed as (
    update public.tasks t
      set status = 'processing',
          attempts = t.attempts + 1,
          locked_at = now(),
          updated_at = now(),
          last_error = null
    from candidates c
    where t.id = c.id
    returning t.*
  )
  select * from claimed;
end;
$$;

create or replace function public.worker_complete_task(p_task_id uuid, p_result jsonb)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_old_status text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required';
  end if;
  if jsonb_typeof(p_result) <> 'object' then
    raise exception 'result must be a JSON object';
  end if;

  update public.tasks
    set status = 'succeeded', locked_at = null, updated_at = now(), last_error = null
    where id = p_task_id and status = 'processing'
    returning 'processing' into v_old_status;
  if not found then
    raise exception 'task not currently processing';
  end if;

  insert into public.task_results (task_id, result)
  values (p_task_id, p_result)
  on conflict (task_id) do update set result = excluded.result, created_at = now();

  insert into public.task_events (task_id, old_status, new_status, detail)
  values (p_task_id, v_old_status, 'succeeded', jsonb_build_object('result_status', p_result ->> 'status'));
end;
$$;

create or replace function public.worker_fail_task(p_task_id uuid, p_error text)
returns text
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_task public.tasks%rowtype;
  v_new_status text;
  v_delay_seconds integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required';
  end if;

  select * into v_task
  from public.tasks
  where id = p_task_id and status = 'processing'
  for update;
  if not found then
    raise exception 'task not currently processing';
  end if;

  if v_task.attempts < v_task.max_attempts then
    v_new_status := 'queued';
    v_delay_seconds := least(300, 15 * (1 << least(v_task.attempts - 1, 4)));
  else
    v_new_status := 'failed';
    v_delay_seconds := 0;
  end if;

  update public.tasks
    set status = v_new_status,
        available_at = now() + make_interval(secs => v_delay_seconds),
        locked_at = null,
        updated_at = now(),
        last_error = left(coalesce(p_error, 'worker failure'), 2000)
    where id = p_task_id;

  insert into public.task_events (task_id, old_status, new_status, detail)
  values (p_task_id, 'processing', v_new_status,
          jsonb_build_object('attempt', v_task.attempts, 'retry_in_seconds', v_delay_seconds));

  return v_new_status;
end;
$$;

revoke all on function public.worker_claim_tasks(uuid, integer) from public, anon, authenticated;
revoke all on function public.worker_complete_task(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.worker_fail_task(uuid, text) from public, anon, authenticated;
grant execute on function public.worker_claim_tasks(uuid, integer) to service_role;
grant execute on function public.worker_complete_task(uuid, jsonb) to service_role;
grant execute on function public.worker_fail_task(uuid, text) to service_role;
