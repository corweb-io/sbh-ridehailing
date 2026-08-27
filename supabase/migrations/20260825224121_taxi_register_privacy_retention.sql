set local lock_timeout = '5s';

create extension if not exists pg_cron with schema extensions;

-- Precise destination data is not part of the availability register.
update public.smoke_test_rides
set
  destination_lat = null,
  destination_lng = null,
  destination_address = null
where
  destination_lat is not null
  or destination_lng is not null
  or destination_address is not null;

alter table public.smoke_test_rides
  drop constraint if exists smoke_test_rides_destination_minimized_check;

alter table public.smoke_test_rides
  add constraint smoke_test_rides_destination_minimized_check
  check (
    destination_lat is null
    and destination_lng is null
    and destination_address is null
  );

create table if not exists public.taxi_dispatch_offers (
  id uuid primary key default gen_random_uuid(),
  trip_reference uuid not null,
  driver_id text not null,
  pickup_lat double precision,
  pickup_lng double precision,
  offered_at timestamptz not null,
  refused_at timestamptz,
  reported_at timestamptz,
  refusal_ground text,
  created_at timestamptz not null default now(),
  constraint taxi_dispatch_offers_refusal_ground_check
    check (
      refusal_ground is null
      or refusal_ground in (
        'work_rest_time',
        'prior_reservation',
        'simultaneous_street_request',
        'at_station_head',
        'pickup_inaccessible_or_client_absent'
      )
    )
);

create index if not exists taxi_dispatch_offers_created_at_idx
  on public.taxi_dispatch_offers (created_at desc);

alter table public.taxi_dispatch_offers enable row level security;
revoke all on table public.taxi_dispatch_offers from anon, authenticated;

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
    $cleanup$
  );
end
$$;
