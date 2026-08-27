set local lock_timeout = '5s';

alter table public.smoke_test_rides
  drop constraint if exists smoke_test_rides_pricing_variant_check;

alter table public.smoke_test_rides
  drop constraint if exists smoke_test_rides_status_check;

alter table public.smoke_test_rides
  alter column pricing_variant drop not null;

alter table public.smoke_test_rides
  alter column pricing_variant drop default;

alter table public.smoke_test_rides
  add column if not exists fare_zone_from text,
  add column if not exists fare_zone_to text,
  add column if not exists fare_band text,
  add column if not exists requested_at timestamptz;

alter table public.smoke_test_rides
  add constraint smoke_test_rides_status_check
  check (status in (
    'started',
    'quote_viewed',
    'requested',
    'confirmed',
    'searching',
    'no_driver',
    'cancelled'
  ));

alter table public.smoke_test_rides
  add constraint smoke_test_rides_fare_band_check
  check (fare_band is null or fare_band in ('day', 'evening', 'night'));

alter table public.smoke_test_events
  drop constraint if exists smoke_test_events_name_check;

alter table public.smoke_test_events
  add constraint smoke_test_events_name_check
  check (name in (
    'landing_view',
    'ride_started',
    'pickup_selected',
    'destination_selected',
    'quote_generated',
    'taxi_requested',
    'whatsapp_clicked',
    'stand_called',
    'pickup_confirmation_started',
    'pickup_confirmed',
    'driver_search_started',
    'no_driver_shown',
    'contact_submitted',
    'cancelled',
    'app_install_clicked',
    'pwa_install_accepted',
    'pwa_install_dismissed',
    'ios_install_instructions_shown',
    'bookmark_instructions_shown',
    'pwa_opened'
  ));
