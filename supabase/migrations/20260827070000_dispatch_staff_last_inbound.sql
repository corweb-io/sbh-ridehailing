set local lock_timeout = '5s';

alter table public.dispatch_staff
  add column if not exists last_inbound_at timestamptz;

update public.dispatch_staff
  set last_inbound_at = bound_at
  where last_inbound_at is null;

alter table public.dispatch_staff
  alter column last_inbound_at set default now();

alter table public.dispatch_staff
  alter column last_inbound_at set not null;
