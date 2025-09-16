-- Fix RLS policies for channel_members to allow system functions to add users to channels
DROP POLICY IF EXISTS "channel_members:insert" ON channel_members;

-- Allow authenticated users to insert themselves AND allow system functions to add users
CREATE POLICY "channel_members:insert" 
ON channel_members 
FOR INSERT 
WITH CHECK (
  -- User can add themselves
  user_id = auth.uid() 
  OR 
  -- System functions can add users (when there's no auth.uid(), like in database functions)
  auth.uid() IS NULL
  OR
  -- Channel owners/admins can add users
  EXISTS (
    SELECT 1 FROM channel_members cm 
    WHERE cm.channel_id = channel_members.channel_id 
    AND cm.user_id = auth.uid() 
    AND cm.role IN ('owner', 'admin')
  )
);