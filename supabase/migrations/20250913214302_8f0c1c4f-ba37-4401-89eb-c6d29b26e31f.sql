-- Create per-user read state for channels
create table if not exists public.channel_reads (
  user_id uuid not null,
  channel_id uuid not null,
  last_read_at timestamptz not null default now(),
  constraint channel_reads_pkey primary key (user_id, channel_id)
);

alter table public.channel_reads enable row level security;

create policy "channel_reads:self-select"
  on public.channel_reads
  for select
  using (user_id = auth.uid());

create policy "channel_reads:self-insert"
  on public.channel_reads
  for insert
  with check (user_id = auth.uid());

create policy "channel_reads:self-update"
  on public.channel_reads
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Helpful indexes
create index if not exists idx_channel_reads_user on public.channel_reads(user_id);
create index if not exists idx_channel_reads_channel on public.channel_reads(channel_id);
