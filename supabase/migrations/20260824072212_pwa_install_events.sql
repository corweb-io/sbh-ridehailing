set local lock_timeout = '5s';

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
