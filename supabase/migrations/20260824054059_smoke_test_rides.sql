create table if not exists public.smoke_test_rides (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  created_at timestamptz not null default now(),
  pickup_lat double precision,
  pickup_lng double precision,
  pickup_address text,
  destination_lat double precision,
  destination_lng double precision,
  destination_address text,
  distance_km numeric,
  estimated_duration_minutes numeric,
  quoted_price numeric,
  pricing_variant text not null default 'B',
  status text not null default 'started',
  started_at timestamptz,
  quote_viewed_at timestamptz,
  pickup_confirmed_at timestamptz,
  search_started_at timestamptz,
  completed_at timestamptz,
  contact text,
  first_name text,
  user_type text,
  acquisition_source text,
  events jsonb not null default '[]'::jsonb,
  constraint smoke_test_rides_pricing_variant_check
    check (pricing_variant in ('A', 'B', 'C')),
  constraint smoke_test_rides_status_check
    check (status in ('started', 'quote_viewed', 'confirmed', 'searching', 'no_driver', 'cancelled')),
  constraint smoke_test_rides_user_type_check
    check (user_type is null or user_type in ('resident', 'worker', 'visitor'))
);

create table if not exists public.smoke_test_events (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  ride_id uuid references public.smoke_test_rides(id) on delete set null,
  name text not null,
  created_at timestamptz not null default now(),
  meta jsonb,
  constraint smoke_test_events_name_check
    check (name in (
      'landing_view',
      'ride_started',
      'pickup_selected',
      'destination_selected',
      'quote_generated',
      'pickup_confirmation_started',
      'pickup_confirmed',
      'driver_search_started',
      'no_driver_shown',
      'contact_submitted',
      'cancelled'
    ))
);

create index if not exists smoke_test_rides_created_at_idx
  on public.smoke_test_rides (created_at desc);
create index if not exists smoke_test_rides_status_idx
  on public.smoke_test_rides (status);
create index if not exists smoke_test_rides_pricing_variant_idx
  on public.smoke_test_rides (pricing_variant);
create index if not exists smoke_test_events_name_idx
  on public.smoke_test_events (name);
create index if not exists smoke_test_events_session_idx
  on public.smoke_test_events (session_id);
create index if not exists smoke_test_events_ride_idx
  on public.smoke_test_events (ride_id);

alter table public.smoke_test_rides enable row level security;
alter table public.smoke_test_events enable row level security;

revoke all on table public.smoke_test_rides from anon, authenticated;
revoke all on table public.smoke_test_events from anon, authenticated;
