-- 1) Helper: security definer function to check membership without recursion
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

-- 2) Fix recursive policy on channel_members
drop policy if exists "channel_members:my-channels" on public.channel_members;

create policy "channel_members:member-read"
  on public.channel_members
  for select
  using (public.is_member_of_channel(channel_id));

-- Allow users to add themselves to a channel (needed after creating a channel/DM)
create policy "channel_members:self-insert"
  on public.channel_members
  for insert
  with check (user_id = auth.uid());

-- Allow users to leave a channel (delete own membership)
create policy "channel_members:self-delete"
  on public.channel_members
  for delete
  using (user_id = auth.uid());

-- 3) Channels insert/update policies for app flows
-- Allow creating normal channels (any authenticated user)
create policy "channels:anyone-insert-non-dm"
  on public.channels
  for insert to authenticated
  with check (is_dm = false);

-- Allow creating DM channels if the user is part of the pair
create policy "channels:dm-insert-by-participant"
  on public.channels
  for insert to authenticated
  with check (
    is_dm = true and (
      dm_user_a = auth.uid() or dm_user_b = auth.uid()
    )
  );

-- Allow admins/owners to update channel settings
create policy "channels:admin-update"
  on public.channels
  for update to authenticated
  using (
    exists (
      select 1 from public.channel_members cm
      where cm.channel_id = channels.id
        and cm.user_id = auth.uid()
        and cm.role in ('owner','admin')
    )
  )
  with check (
    exists (
      select 1 from public.channel_members cm
      where cm.channel_id = channels.id
        and cm.user_id = auth.uid()
        and cm.role in ('owner','admin')
    )
  );