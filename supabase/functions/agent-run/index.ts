import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AgentRequest {
  channelId: string;
  userId: string;
  command: 'summary' | 'tasks' | 'help';
  args?: {
    last?: number;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { channelId, userId, command, args = {} }: AgentRequest = await req.json();
    
    console.log(`Agent run request: ${command} for user ${userId} in channel ${channelId}`);

    // Verify user membership in channel
    const { data: membership } = await supabase
      .from('channel_members')
      .select('role')
      .eq('channel_id', channelId)
      .eq('user_id', userId)
      .single();

    if (!membership) {
      return new Response(JSON.stringify({ error: 'Not a member of this channel' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check rate limits
    const { data: channel } = await supabase
      .from('channels')
      .select('is_dm')
      .eq('id', channelId)
      .single();

    const rateType = channel?.is_dm ? 'on_demand_dm' : 'on_demand_channel';
    const rateLimit = channel?.is_dm ? { limit: 2, windowMinutes: 10 } : { limit: 3, windowMinutes: 60 };

    // Check current rate limit
    const windowStart = new Date(Date.now() - rateLimit.windowMinutes * 60000);
    const { data: rateLimitData } = await supabase
      .from('agent_rate_limits')
      .select('request_count')
      .eq('user_id', userId)
      .eq('channel_id', channelId)
      .eq('rate_type', rateType)
      .gte('window_start', windowStart.toISOString())
      .single();

    if (rateLimitData && rateLimitData.request_count >= rateLimit.limit) {
      return new Response(JSON.stringify({ error: 'Agent cooldown reached. Try later.' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle help command immediately
    if (command === 'help') {
      const helpText = `**Available Commands:**

• \`/summary [last=N]\` — Brief of recent messages (Context/Decisions/Open Qs/Owners)
• \`/tasks [last=N]\` — Checklist of action items with @owners  
• \`/help\` — Show available commands

**Arguments:**
• \`last\`: Number of recent messages to analyze (10-200, default 50)

**How it works:**
1. Commands create proposal drafts
2. Review and edit the result
3. Tap "Accept" to post to chat`;

      return new Response(JSON.stringify({
        taskId: null,
        status: 'completed',
        result: {
          markdown: helpText,
          citations: [],
          scope: channel?.is_dm ? 'dm' : 'channel'
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update rate limit
    await supabase
      .from('agent_rate_limits')
      .upsert({
        user_id: userId,
        channel_id: channelId,
        rate_type: rateType,
        request_count: (rateLimitData?.request_count || 0) + 1,
        window_start: rateLimitData ? undefined : new Date().toISOString(),
        expires_at: new Date(Date.now() + rateLimit.windowMinutes * 60000).toISOString()
      }, {
        onConflict: 'user_id,channel_id,rate_type'
      });

    // Create agent task
    const { data: task, error: taskError } = await supabase
      .from('agent_tasks')
      .insert({
        user_id: userId,
        channel_id: channelId,
        command,
        args_json: args,
        status: 'queued'
      })
      .select()
      .single();

    if (taskError) {
      console.error('Error creating task:', taskError);
      return new Response(JSON.stringify({ error: 'Failed to create task' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Process task in background
    supabase.functions.invoke('agent-process', {
      body: { taskId: task.id }
    }).catch(console.error);

    return new Response(JSON.stringify({
      taskId: task.id,
      status: 'queued'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in agent-run:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});