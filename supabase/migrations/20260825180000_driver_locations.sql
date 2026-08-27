set local lock_timeout = '5s';

create table if not exists public.driver_locations (
  driver_id text primary key,
  lat double precision not null,
  lng double precision not null,
  heading double precision,
  accuracy double precision,
  updated_at timestamptz not null default now(),
  constraint driver_locations_lat_check
    check (lat >= 17.86 and lat <= 17.96),
  constraint driver_locations_lng_check
    check (lng >= -62.92 and lng <= -62.79),
  constraint driver_locations_heading_check
    check (heading is null or (heading >= 0 and heading < 360)),
  constraint driver_locations_accuracy_check
    check (accuracy is null or (accuracy >= 0 and accuracy <= 10000))
);

create index if not exists driver_locations_updated_at_idx
  on public.driver_locations (updated_at desc);

alter table public.driver_locations enable row level security;

revoke all on table public.driver_locations from anon, authenticated;
