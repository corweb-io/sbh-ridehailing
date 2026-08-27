set local lock_timeout = '5s';

alter table public.dispatch_jobs
  drop constraint if exists dispatch_jobs_status_check;

alter table public.dispatch_jobs
  add constraint dispatch_jobs_status_check
  check (
    status in (
      'ring_taxis',
      'ring_companies',
      'hold',
      'assigned',
      'en_route',
      'arrived',
      'completed',
      'unfilled',
      'cancelled'
    )
  );

drop index if exists public.dispatch_jobs_open_idx;

create index dispatch_jobs_open_idx
  on public.dispatch_jobs (created_at desc)
  where status in ('ring_taxis', 'ring_companies', 'hold');

create index if not exists dispatch_jobs_live_idx
  on public.dispatch_jobs (created_at desc)
  where status in ('assigned', 'en_route', 'arrived');
