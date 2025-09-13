-- Check and fix all existing channel_members policies
-- Drop all existing policies to start fresh
drop policy if exists "channel_members:my-channels" on public.channel_members;
drop policy if exists "channel_members:safe-read" on public.channel_members;
drop policy if exists "channel_members:self-insert" on public.channel_members;
drop policy if exists "channel_members:self-delete" on public.channel_members;

-- Create a simple, non-recursive policy for channel_members
create policy "channel_members:simple-read"
  on public.channel_members
  for select
  using (user_id = auth.uid());

-- Allow inserting channel memberships
create policy "channel_members:insert"
  on public.channel_members
  for insert
  with check (user_id = auth.uid());

-- Allow deleting own memberships
create policy "channel_members:delete"
  on public.channel_members
  for delete
  using (user_id = auth.uid());