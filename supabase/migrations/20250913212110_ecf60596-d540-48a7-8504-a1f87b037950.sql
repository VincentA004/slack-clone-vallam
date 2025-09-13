-- Allow DM participants to SELECT their DM channels (needed right after insert)
create policy if not exists "channels:dm-select-by-participant"
  on public.channels
  for select to authenticated
  using (
    is_dm = true and (dm_user_a = auth.uid() or dm_user_b = auth.uid())
  );