set local lock_timeout = '5s';

alter table public.dispatch_staff
  add column if not exists on_duty boolean not null default true;

alter table public.dispatch_staff
  add column if not exists session_nudged_at timestamptz;
