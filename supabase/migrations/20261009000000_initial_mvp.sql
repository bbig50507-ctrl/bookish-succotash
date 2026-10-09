-- دار MVP schema draft — not applied to any remote database.
-- Temporary product assumptions: Saudi short stays, SAR, host approval before payment.
-- Review and test against a disposable local Supabase stack before deployment.

create extension if not exists btree_gist with schema extensions;

create type public.listing_status as enum ('draft', 'published', 'paused', 'archived');
create type public.booking_status as enum ('pending', 'approved', 'rejected', 'cancelled');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles (id) on delete restrict,
  title text not null check (char_length(trim(title)) between 3 and 100),
  city text not null check (char_length(trim(city)) between 2 and 80),
  district text not null default '',
  description text not null default '',
  max_guests smallint not null check (max_guests between 1 and 30),
  bedrooms smallint not null default 1 check (bedrooms between 0 and 30),
  bathrooms numeric(3,1) not null default 1 check (bathrooms > 0 and bathrooms <= 30),
  nightly_rate_sar_halalas integer not null check (nightly_rate_sar_halalas > 0),
  status public.listing_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.listing_photos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  storage_path text not null,
  sort_order smallint not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  unique (listing_id, storage_path)
);

create table public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete restrict,
  guest_id uuid not null references public.profiles (id) on delete restrict,
  check_in date not null,
  check_out date not null,
  guests smallint not null check (guests > 0),
  status public.booking_status not null default 'pending',
  total_sar_halalas bigint not null check (total_sar_halalas > 0),
  created_at timestamptz not null default now(),
  check (check_out > check_in)
);

-- Approved reservations cannot overlap for the same listing. Pending requests may
-- overlap; the host's approval is the point at which a date range is reserved.
alter table public.booking_requests
  add constraint approved_booking_dates_do_not_overlap
  exclude using gist (
    listing_id with =,
    daterange(check_in, check_out, '[)') with &&
  ) where (status = 'approved');

create index listings_public_search_idx
  on public.listings (city, status, nightly_rate_sar_halalas);
create index listings_host_idx on public.listings (host_id);
create index listing_photos_listing_order_idx
  on public.listing_photos (listing_id, sort_order);
create index booking_requests_guest_created_idx
  on public.booking_requests (guest_id, created_at desc);
create index booking_requests_listing_dates_idx
  on public.booking_requests (listing_id, check_in, check_out);

-- Create a minimal profile automatically for new Auth users.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Backfill profiles for users that existed before this migration.
insert into public.profiles (id, display_name)
select id, coalesce(raw_user_meta_data ->> 'display_name', '')
from auth.users
on conflict (id) do nothing;

alter table public.profiles enable row level security;
alter table public.listings enable row level security;
alter table public.listing_photos enable row level security;
alter table public.booking_requests enable row level security;

-- Start from no client privileges; grant only what each workflow uses.
revoke all on table public.profiles from anon, authenticated;
revoke all on table public.listings from anon, authenticated;
revoke all on table public.listing_photos from anon, authenticated;
revoke all on table public.booking_requests from anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;
grant select on table public.listings to anon, authenticated;
grant insert, update on table public.listings to authenticated;
grant select on table public.listing_photos to anon, authenticated;
grant insert, update, delete on table public.listing_photos to authenticated;
grant select on table public.booking_requests to authenticated;
grant update (status) on table public.booking_requests to authenticated;

create policy profiles_read_self
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_update_self
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy listings_read_published_or_owned
  on public.listings for select to anon, authenticated
  using (
    status = 'published'
    or host_id = (select auth.uid())
  );

create policy listings_insert_own_draft
  on public.listings for insert to authenticated
  with check (
    host_id = (select auth.uid())
    and status = 'draft'
  );

create policy listings_update_own
  on public.listings for update to authenticated
  using (host_id = (select auth.uid()))
  with check (host_id = (select auth.uid()));

create policy listing_photos_read_visible_listing
  on public.listing_photos for select to anon, authenticated
  using (
    exists (
      select 1
      from public.listings l
      where l.id = listing_id
        and (l.status = 'published' or l.host_id = (select auth.uid()))
    )
  );

create policy listing_photos_insert_owned_listing
  on public.listing_photos for insert to authenticated
  with check (
    exists (
      select 1 from public.listings l
      where l.id = listing_id and l.host_id = (select auth.uid())
    )
  );

create policy listing_photos_update_owned_listing
  on public.listing_photos for update to authenticated
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_id and l.host_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.listings l
      where l.id = listing_id and l.host_id = (select auth.uid())
    )
  );

create policy listing_photos_delete_owned_listing
  on public.listing_photos for delete to authenticated
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_id and l.host_id = (select auth.uid())
    )
  );

create policy booking_requests_read_guest_or_host
  on public.booking_requests for select to authenticated
  using (
    guest_id = (select auth.uid())
    or exists (
      select 1 from public.listings l
      where l.id = listing_id and l.host_id = (select auth.uid())
    )
  );

-- Guests create requests only through request_booking(), which calculates the quote.
-- Hosts may only change a pending request for their own listing to approved/rejected.
create policy booking_requests_host_decision
  on public.booking_requests for update to authenticated
  using (
    status = 'pending'
    and exists (
      select 1 from public.listings l
      where l.id = listing_id and l.host_id = (select auth.uid())
    )
  )
  with check (
    status in ('approved', 'rejected')
    and exists (
      select 1 from public.listings l
      where l.id = listing_id and l.host_id = (select auth.uid())
    )
  );

create or replace function public.request_booking(
  p_listing_id uuid,
  p_check_in date,
  p_check_out date,
  p_guests smallint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_guest_id uuid := auth.uid();
  v_nightly_rate integer;
  v_max_guests smallint;
  v_booking_id uuid;
  v_nights integer;
begin
  if v_guest_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_listing_id is null
     or p_check_in is null
     or p_check_out is null
     or p_guests is null
     or p_check_in < current_date
     or p_check_out <= p_check_in then
    raise exception 'Invalid booking details' using errcode = '22023';
  end if;

  select nightly_rate_sar_halalas, max_guests
    into v_nightly_rate, v_max_guests
  from public.listings
  where id = p_listing_id and status = 'published';

  if not found then
    raise exception 'Listing is unavailable' using errcode = 'P0002';
  end if;

  if p_guests < 1 or p_guests > v_max_guests then
    raise exception 'Guest count exceeds listing capacity' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.booking_requests b
    where b.listing_id = p_listing_id
      and b.status = 'approved'
      and daterange(b.check_in, b.check_out, '[)')
          && daterange(p_check_in, p_check_out, '[)')
  ) then
    raise exception 'Selected dates are no longer available' using errcode = '23P01';
  end if;

  v_nights := p_check_out - p_check_in;

  insert into public.booking_requests (
    listing_id, guest_id, check_in, check_out, guests, status, total_sar_halalas
  ) values (
    p_listing_id, v_guest_id, p_check_in, p_check_out, p_guests, 'pending',
    v_nightly_rate::bigint * v_nights::bigint
  ) returning id into v_booking_id;

  return v_booking_id;
end;
$$;

revoke all on function public.request_booking(uuid, date, date, smallint) from public;
grant execute on function public.request_booking(uuid, date, date, smallint) to authenticated;
