-- Add missing insert and update policies for channels
create policy "channels:insert"
  on public.channels
  for insert to authenticated
  with check (true);

create policy "channels:update"
  on public.channels
  for update to authenticated
  using (
    exists (
      select 1 from public.channel_members cm
      where cm.channel_id = channels.id
        and cm.user_id = auth.uid()
        and cm.role in ('owner','admin')
    )
  );