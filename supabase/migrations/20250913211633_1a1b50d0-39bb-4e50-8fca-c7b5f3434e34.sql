-- Check existing policies and fix the infinite recursion issue
-- First, remove the problematic policy
drop policy if exists "channel_members:my-channels" on public.channel_members;

-- Create a security definer function to check membership without recursion
create or replace function public.is_member_of_channel(_channel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.channel_members
    where channel_id = _channel_id
      and user_id = auth.uid()
  );
$$;

-- Create new safe policies for channel_members
create policy "channel_members:safe-read"
  on public.channel_members
  for select
  using (user_id = auth.uid() or public.is_member_of_channel(channel_id));

-- Allow users to add themselves to channels
create policy "channel_members:self-insert"
  on public.channel_members
  for insert
  with check (user_id = auth.uid());

-- Allow users to remove themselves from channels  
create policy "channel_members:self-delete"
  on public.channel_members
  for delete
  using (user_id = auth.uid());