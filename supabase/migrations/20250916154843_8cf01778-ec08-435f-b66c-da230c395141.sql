-- Allow users to update their own agent tasks status to accepted/rejected
-- Ensures proposal cards can be dismissed by users
ALTER TABLE public.agent_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_tasks:self-update-status"
ON public.agent_tasks
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid() AND (status = ANY (ARRAY['accepted','rejected'])));
