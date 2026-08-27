set local lock_timeout = '5s';

create table if not exists public.dispatch_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  channel text not null,
  name text not null,
  actor_role text not null,
  actor_hash text,
  job_id uuid,
  meta jsonb not null default '{}'::jsonb,
  constraint dispatch_events_channel_check
    check (channel in ('telegram', 'whatsapp')),
  constraint dispatch_events_actor_role_check
    check (actor_role in ('booker', 'staff', 'system')),
  constraint dispatch_events_name_check
    check (
      name in (
        'inbound',
        'outbound',
        'booking_started',
        'booking_step',
        'job_created',
        'job_status',
        'offer_accepted',
        'offer_declined',
        'staff_bound',
        'staff_unbound',
        'duty_on',
        'duty_off'
      )
    )
);

create index if not exists dispatch_events_created_channel_idx
  on public.dispatch_events (created_at desc, channel);

create index if not exists dispatch_events_name_created_idx
  on public.dispatch_events (name, created_at desc);

create index if not exists dispatch_events_job_id_idx
  on public.dispatch_events (job_id)
  where job_id is not null;

alter table public.dispatch_events enable row level security;
revoke all on table public.dispatch_events from anon, authenticated;

do $$
declare
  existing_job bigint;
begin
  select jobid
  into existing_job
  from cron.job
  where jobname = 'taxi-register-retention-daily';

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;

  perform cron.schedule(
    'taxi-register-retention-daily',
    '23 3 * * *',
    $cleanup$
      delete from public.driver_locations
      where updated_at < now() - interval '2 months';

      update public.smoke_test_rides
      set pickup_lat = null, pickup_lng = null
      where created_at < now() - interval '2 months'
        and (pickup_lat is not null or pickup_lng is not null);

      update public.taxi_dispatch_offers
      set pickup_lat = null, pickup_lng = null
      where created_at < now() - interval '2 months'
        and (pickup_lat is not null or pickup_lng is not null);

      delete from public.taxi_dispatch_offers
      where created_at < now() - interval '1 year';

      delete from public.smoke_test_events
      where created_at < now() - interval '1 year';

      delete from public.smoke_test_rides
      where created_at < now() - interval '1 year';

      delete from public.dispatch_events
      where created_at < now() - interval '1 year';
    $cleanup$
  );
end
$$;
