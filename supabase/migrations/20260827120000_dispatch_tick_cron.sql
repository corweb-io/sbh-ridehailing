set local lock_timeout = '5s';

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net;

create schema if not exists internal;
revoke all on schema internal from public, anon, authenticated;

create or replace function internal.dispatch_tick()
returns void
language plpgsql
set search_path = pg_catalog
as $$
declare
  tick_url text;
  tick_secret text;
begin
  select decrypted_secret
  into tick_url
  from vault.decrypted_secrets
  where name = 'dispatch_tick_url';

  select decrypted_secret
  into tick_secret
  from vault.decrypted_secrets
  where name = 'dispatch_tick_secret';

  if tick_url is null or btrim(tick_url) = '' then
    return;
  end if;
  if tick_secret is null or btrim(tick_secret) = '' then
    return;
  end if;

  perform net.http_get(
    url := btrim(tick_url),
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || tick_secret,
      'x-dispatch-tick-secret', tick_secret
    ),
    timeout_milliseconds := 30000
  );
end;
$$;

revoke all on function internal.dispatch_tick() from public, anon, authenticated;

do $$
declare
  existing_job bigint;
begin
  select jobid
  into existing_job
  from cron.job
  where jobname = 'dispatch-tick-every-minute';

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;

  perform cron.schedule(
    'dispatch-tick-every-minute',
    '* * * * *',
    $tick$select internal.dispatch_tick();$tick$
  );
end
$$;
