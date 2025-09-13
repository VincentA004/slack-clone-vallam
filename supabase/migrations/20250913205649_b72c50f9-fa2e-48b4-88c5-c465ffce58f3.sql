-- SlackLite Database Schema
-- Channels + DMs (DMs are channels with exactly two people)
create table if not exists channels (
  id uuid primary key default gen_random_uuid(),
  name text,                                 -- null for DMs
  is_private boolean not null default false,
  is_dm boolean not null default false,
  dm_user_a uuid references auth.users(id),  -- lower user id (DM only)
  dm_user_b uuid references auth.users(id),  -- higher user id (DM only)
  agent_enabled boolean not null default true,
  agent_max_posts_per_hour int not null default 3,
  created_at timestamptz not null default now(),
  check ( (is_dm = false) or (dm_user_a is not null and dm_user_b is not null) )
);

-- unique DM per user-pair (A<B)
create unique index if not exists unique_dm_pair
  on channels (dm_user_a, dm_user_b) where is_dm = true;

-- membership
create table if not exists channel_members (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references channels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','member')),
  unique(channel_id, user_id)
);

-- messages + one-level threads
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references channels(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  text text not null,
  parent_message_id uuid references messages(id) on delete cascade, -- one-level threads
  created_at timestamptz not null default now()
);

-- agent tasks (store runs + results for proposal cards)
create table if not exists agent_tasks (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references channels(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  command text not null,                  -- 'summary' | 'tasks'
  args_json jsonb,
  status text not null default 'queued',  -- 'queued'|'running'|'completed'|'failed'|'rejected'
  result_json jsonb,
  created_at timestamptz not null default now()
);

-- (Optional, demo-only) per-user auto-responder state
create table if not exists user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  agent_auto_enabled boolean not null default false,
  agent_auto_scope text not null default 'both', -- 'dms'|'channels'|'both'
  agent_auto_expires_at timestamptz
);

-- User profiles for additional user information
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- helpful indexes
create index if not exists idx_messages_channel_created on messages(channel_id, created_at desc);
create index if not exists idx_messages_parent on messages(parent_message_id);
create index if not exists idx_channel_members_user on channel_members(user_id);

-- Enable Row Level Security
alter table channels enable row level security;
alter table channel_members enable row level security;
alter table messages enable row level security;
alter table agent_tasks enable row level security;
alter table user_settings enable row level security;
alter table profiles enable row level security;

-- RLS Policies for channels
create policy "channels:public-read" on channels for select using (is_private = false and is_dm = false);
create policy "channels:member-read" on channels for select using (
  exists(select 1 from channel_members cm where cm.channel_id = id and cm.user_id = auth.uid())
);

-- RLS Policies for channel_members
create policy "channel_members:my-channels" on channel_members for select using (
  exists(select 1 from channel_members cm where cm.channel_id = channel_members.channel_id and cm.user_id = auth.uid())
);

-- RLS Policies for messages
create policy "messages:member-read" on messages for select using (
  exists(select 1 from channel_members cm where cm.channel_id = messages.channel_id and cm.user_id = auth.uid())
);
create policy "messages:member-insert" on messages for insert with check (
  exists(select 1 from channel_members cm where cm.channel_id = messages.channel_id and cm.user_id = auth.uid())
);
create policy "messages:own-update" on messages for update using (user_id = auth.uid());
create policy "messages:own-delete" on messages for delete using (user_id = auth.uid());

-- RLS Policies for agent_tasks
create policy "agent_tasks:self-select" on agent_tasks for select using (user_id = auth.uid());
create policy "agent_tasks:self-insert" on agent_tasks for insert with check (user_id = auth.uid());

-- RLS Policies for user_settings
create policy "user_settings:self" on user_settings for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- RLS Policies for profiles
create policy "profiles:public-read" on profiles for select using (true);
create policy "profiles:self-write" on profiles for all using (id = auth.uid()) with check (id = auth.uid());

-- Function to handle new user signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.email));
  return new;
end;
$$;

-- Trigger for new user creation
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Function to update updated_at timestamp
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Trigger for profiles updated_at
create trigger update_profiles_updated_at
  before update on profiles
  for each row
  execute function public.update_updated_at_column();

-- Enable realtime for messages
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table channels;
alter publication supabase_realtime add table channel_members;