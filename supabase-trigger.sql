-- Configure these two Vault secrets before enabling the dispatch trigger.
-- Replace both values with your actual repository-scoped values; never commit a PAT.
-- select vault.create_secret('REPLACE_WITH_FINE_GRAINED_GITHUB_PAT', 'github_pat');
-- select vault.create_secret('owner/repo', 'github_repo');
-- Fine-grained PAT: grant Contents: Read and write only for the target repository.
-- If these secret names already exist, update them using the Supabase Vault UI/API
-- instead of creating duplicate names.

create or replace function public.dispatch_queued_task()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, vault, pg_temp
as $$
declare
  v_pat text;
  v_repo text;
begin
  if new.status <> 'queued' then
    return new;
  end if;

  select decrypted_secret into v_pat
  from vault.decrypted_secrets
  where name = 'github_pat'
  order by created_at desc
  limit 1;

  select decrypted_secret into v_repo
  from vault.decrypted_secrets
  where name = 'github_repo'
  order by created_at desc
  limit 1;

  if coalesce(v_pat, '') = '' or coalesce(v_repo, '') = '' then
    raise warning 'GitHub dispatch secrets are missing; queued task will be picked up by scheduled polling';
    return new;
  end if;

  perform net.http_post(
    url := 'https://api.github.com/repos/' || v_repo || '/dispatches',
    headers := jsonb_build_object(
      'Accept', 'application/vnd.github+json',
      'Authorization', 'Bearer ' || v_pat,
      'X-GitHub-Api-Version', '2022-11-28',
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'event_type', 'supabase-task-queued',
      'client_payload', jsonb_build_object(
        'task_id', new.id::text,
        'batch_size', 1
      )
    )
  );

  return new;
exception when others then
  -- Do not roll back the booking/task insert if the async notification fails.
  -- The scheduled GitHub Actions run is the recovery path.
  raise warning 'GitHub dispatch enqueue failed; scheduled polling will recover the task: %', sqlerrm;
  return new;
end;
$$;

revoke all on function public.dispatch_queued_task() from public, anon, authenticated;

drop trigger if exists tasks_dispatch_github on public.tasks;
create trigger tasks_dispatch_github
after insert on public.tasks
for each row
when (new.status = 'queued')
execute function public.dispatch_queued_task();
