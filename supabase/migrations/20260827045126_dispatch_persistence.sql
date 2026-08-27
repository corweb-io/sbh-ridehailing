set local lock_timeout = '5s';

create table if not exists public.dispatch_jobs (
  id uuid primary key,
  id_prefix text not null,
  channel text not null,
  booker_chat_id text not null,
  status text not null,
  ring_ends_at timestamptz not null,
  reoffer_at timestamptz,
  created_at timestamptz not null,
  payload jsonb not null,
  constraint dispatch_jobs_channel_check
    check (channel in ('telegram', 'whatsapp')),
  constraint dispatch_jobs_status_check
    check (
      status in (
        'ring_taxis',
        'ring_companies',
        'hold',
        'assigned',
        'unfilled',
        'cancelled'
      )
    ),
  constraint dispatch_jobs_id_prefix_check
    check (id_prefix = substr(id::text, 1, 8))
);

create index if not exists dispatch_jobs_id_prefix_idx
  on public.dispatch_jobs (id_prefix);

create index if not exists dispatch_jobs_open_idx
  on public.dispatch_jobs (created_at desc)
  where status in ('ring_taxis', 'ring_companies', 'hold');

create index if not exists dispatch_jobs_booker_idx
  on public.dispatch_jobs (channel, booker_chat_id, created_at desc);

alter table public.dispatch_jobs enable row level security;
revoke all on table public.dispatch_jobs from anon, authenticated;

create table if not exists public.dispatch_sessions (
  channel text not null,
  chat_id text not null,
  job_id uuid,
  updated_at timestamptz not null,
  payload jsonb not null,
  primary key (channel, chat_id),
  constraint dispatch_sessions_channel_check
    check (channel in ('telegram', 'whatsapp'))
);

create index if not exists dispatch_sessions_job_id_idx
  on public.dispatch_sessions (job_id)
  where job_id is not null;

alter table public.dispatch_sessions enable row level security;
revoke all on table public.dispatch_sessions from anon, authenticated;

create table if not exists public.dispatch_staff (
  channel text not null,
  chat_id text not null,
  kind text not null,
  supplier_id text not null,
  bound_at timestamptz not null,
  primary key (channel, chat_id),
  constraint dispatch_staff_channel_check
    check (channel in ('telegram', 'whatsapp')),
  constraint dispatch_staff_kind_check
    check (kind in ('taxi', 'company'))
);

create unique index if not exists dispatch_staff_supplier_idx
  on public.dispatch_staff (kind, supplier_id);

alter table public.dispatch_staff enable row level security;
revoke all on table public.dispatch_staff from anon, authenticated;
