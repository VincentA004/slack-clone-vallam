-- Add policy for DM participants to select their DM channels
-- (Note: PostgreSQL doesn't support IF NOT EXISTS for policies)
drop policy if exists "channels:dm-select-by-participant" on public.channels;

create policy "channels:dm-select-by-participant"
  on public.channels
  for select to authenticated
  using (
    is_dm = true and (dm_user_a = auth.uid() or dm_user_b = auth.uid())
  );