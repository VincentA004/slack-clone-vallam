-- Add message indexing for better citation lookup
CREATE INDEX IF NOT EXISTS idx_messages_channel_created_at ON public.messages(channel_id, created_at DESC);

-- Add agent audit logging table
CREATE TABLE IF NOT EXISTS public.agent_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  channel_id UUID NOT NULL,
  trigger_type TEXT NOT NULL, -- 'dm', 'mention', 'command'
  confidence DECIMAL(3,2), -- 0.00 to 1.00
  action TEXT NOT NULL, -- 'auto_reply', 'draft_created', 'rate_limited', 'rejected'
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS for agent_audit
ALTER TABLE public.agent_audit ENABLE ROW LEVEL SECURITY;

-- Create policies for agent_audit
CREATE POLICY "Users can view their own audit logs" 
ON public.agent_audit 
FOR SELECT 
USING (user_id = auth.uid());

CREATE POLICY "System can insert audit logs" 
ON public.agent_audit 
FOR INSERT 
WITH CHECK (true);

-- Add agent_auto_blocked_topics column to user_settings if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_settings' AND column_name = 'agent_auto_blocked_topics') THEN
    ALTER TABLE public.user_settings ADD COLUMN agent_auto_blocked_topics TEXT[] DEFAULT '{}';
  END IF;
END $$;

-- Add rate limiting tracking table
CREATE TABLE IF NOT EXISTS public.agent_rate_limits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  channel_id UUID NOT NULL,
  rate_type TEXT NOT NULL, -- 'on_demand_channel', 'on_demand_dm', 'auto_dm', 'auto_channel'
  request_count INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  UNIQUE(user_id, channel_id, rate_type)
);

-- Enable RLS for agent_rate_limits
ALTER TABLE public.agent_rate_limits ENABLE ROW LEVEL SECURITY;

-- Create policies for agent_rate_limits
CREATE POLICY "Users can view their own rate limits" 
ON public.agent_rate_limits 
FOR SELECT 
USING (user_id = auth.uid());

CREATE POLICY "System can manage rate limits" 
ON public.agent_rate_limits 
FOR ALL 
USING (true)
WITH CHECK (true);