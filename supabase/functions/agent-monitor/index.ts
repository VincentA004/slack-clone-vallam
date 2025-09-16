import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { messageId } = await req.json();
    
    console.log(`Monitoring message: ${messageId}`);

    // Get message details
    const { data: message, error: messageError } = await supabase
      .from('messages')
      .select(`
        id,
        text,
        user_id,
        channel_id,
        created_at,
        channels:channel_id (
          is_dm,
          dm_user_a,
          dm_user_b,
          name
        )
      `)
      .eq('id', messageId)
      .single();

    if (messageError || !message) {
      console.log('Message not found or error:', messageError);
      return new Response(JSON.stringify({ error: 'Message not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Skip old messages (>15 minutes)
    const messageAge = Date.now() - new Date(message.created_at).getTime();
    if (messageAge > 15 * 60 * 1000) {
      console.log('Message too old, skipping');
      return new Response(JSON.stringify({ skipped: 'Message too old' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Skip system messages and commands
    if (message.text.startsWith('/') || message.text.includes('Sidekick (auto for')) {
      console.log('Skipping system message or command');
      return new Response(JSON.stringify({ skipped: 'System message' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find eligible users for Agent Mode
    let eligibleUsers: string[] = [];

    if (message.channels.is_dm) {
      // For DMs, check if either participant has Agent Mode enabled
      const participants = [message.channels.dm_user_a, message.channels.dm_user_b];
      const recipient = participants.find(p => p !== message.user_id);
      
      if (recipient) {
        const { data: settings } = await supabase
          .from('user_settings')
          .select('*')
          .eq('user_id', recipient)
          .eq('agent_auto_enabled', true)
          .gte('agent_auto_expires_at', new Date().toISOString())
          .in('agent_auto_scope', ['both', 'dm'])
          .single();

        if (settings) {
          eligibleUsers.push(recipient);
        }
      }
    } else {
      // For channels, check for @mentions
      const mentionRegex = /@(\w+)/g;
      const mentions = [...message.text.matchAll(mentionRegex)].map(m => m[1]);
      
      if (mentions.length > 0) {
        // Get users with matching display names and Agent Mode enabled
        const { data: mentionedUsers } = await supabase
          .from('profiles')
          .select(`
            id,
            user_settings:id (
              agent_auto_enabled,
              agent_auto_expires_at,
              agent_auto_scope
            )
          `)
          .in('display_name', mentions);

        if (mentionedUsers) {
          eligibleUsers = mentionedUsers
            .filter(user => 
              user.user_settings?.agent_auto_enabled &&
              new Date(user.user_settings.agent_auto_expires_at) > new Date() &&
              ['both', 'channels'].includes(user.user_settings.agent_auto_scope)
            )
            .map(user => user.id);
        }
      }
    }

    if (eligibleUsers.length === 0) {
      console.log('No eligible users for Agent Mode');
      return new Response(JSON.stringify({ skipped: 'No eligible users' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Process each eligible user 
    const results = [];
    for (const userId of eligibleUsers) {
      const result = await processAgentReply(supabase, message, userId);
      results.push(result);
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in agent-monitor:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function processAgentReply(supabase: any, message: any, userId: string) {
  try {
    // Check rate limits
    const isDM = message.channels.is_dm;
    const rateType = isDM ? 'auto_dm' : 'auto_channel';
    const rateLimit = isDM ? { limit: 1, windowMinutes: 3 } : { limit: 2, windowMinutes: 10 };

    const windowStart = new Date(Date.now() - rateLimit.windowMinutes * 60000);
    const { data: rateLimitData } = await supabase
      .from('agent_rate_limits')
      .select('request_count')
      .eq('user_id', userId)
      .eq('channel_id', message.channel_id)
      .eq('rate_type', rateType)
      .gte('window_start', windowStart.toISOString())
      .single();

    if (rateLimitData && rateLimitData.request_count >= rateLimit.limit) {
      await logAudit(supabase, userId, message.channel_id, isDM ? 'dm' : 'mention', null, 'rate_limited');
      return { userId, action: 'rate_limited' };
    }

    // Get recent messages for context
    const { data: recentMessages } = await supabase
      .from('messages')
      .select(`
        id,
        text,
        created_at,
        user_id,
        profiles:user_id (display_name)
      `)
      .eq('channel_id', message.channel_id)
      .order('created_at', { ascending: false })
      .limit(20);

    // Format messages for AI
    const formattedMessages = recentMessages
      ?.reverse()
      .map(m => {
        const timestamp = new Date(m.created_at).toISOString().slice(0, 16).replace('T', ' ');
        const displayName = m.profiles?.display_name || 'Unknown';
        return `[${timestamp} | @${displayName} | ${m.id}] ${m.text}`;
      })
      .join('\n') || '';

    // Get user info for reply
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', userId)
      .single();

    // Call OpenAI for reply
    const aiResponse = await generateAgentReply(message.text, formattedMessages, userProfile?.display_name);

    if (aiResponse.error) {
      await logAudit(supabase, userId, message.channel_id, isDM ? 'dm' : 'mention', null, 'ai_error');
      return { userId, action: 'ai_error', error: aiResponse.error };
    }

    // Check confidence threshold
    const { data: settings } = await supabase
      .from('user_settings')
      .select('agent_auto_confidence')
      .eq('user_id', userId)
      .single();

    const confidenceThreshold = getConfidenceThreshold(settings?.agent_auto_confidence || 'medium');
    
    if (aiResponse.confidence < confidenceThreshold) {
      // Create draft DM instead of public reply
      await createPrivateDraft(supabase, userId, aiResponse.reply_markdown, message.channel_id);
      await logAudit(supabase, userId, message.channel_id, isDM ? 'dm' : 'mention', aiResponse.confidence, 'draft_created');
      return { userId, action: 'draft_created', confidence: aiResponse.confidence };
    }

    // Post public reply
    const replyText = formatPublicReply(aiResponse.reply_markdown, userProfile?.display_name, isDM, aiResponse.citations);
    
    const { error: replyError } = await supabase
      .from('messages')
      .insert({
        channel_id: message.channel_id,
        user_id: userId,
        text: replyText,
        parent_message_id: isDM ? null : message.id // Thread reply for channels
      });

    if (replyError) {
      console.error('Error posting reply:', replyError);
      return { userId, action: 'post_error', error: replyError.message };
    }

    // Update rate limit
    await supabase
      .from('agent_rate_limits')
      .upsert({
        user_id: userId,
        channel_id: message.channel_id,
        rate_type: rateType,
        request_count: (rateLimitData?.request_count || 0) + 1,
        window_start: rateLimitData ? undefined : new Date().toISOString(),
        expires_at: new Date(Date.now() + rateLimit.windowMinutes * 60000).toISOString()
      }, {
        onConflict: 'user_id,channel_id,rate_type'
      });

    await logAudit(supabase, userId, message.channel_id, isDM ? 'dm' : 'mention', aiResponse.confidence, 'auto_reply');
    return { userId, action: 'auto_reply', confidence: aiResponse.confidence };

  } catch (error) {
    console.error('Error processing agent reply:', error);
    return { userId, action: 'error', error: error.message };
  }
}

async function generateAgentReply(triggerMessage: string, recentMessages: string, userName: string) {
  const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openAIApiKey) {
    return { error: 'OpenAI API key not configured' };
  }

  try {
    const systemPrompt = `You are 'Sidekick', ${userName}'s careful assistant. Provide a concise, helpful response to the latest message, grounded in recent context. Output valid JSON.

Schema: {"reply_markdown": "string", "citations": [{"messageId": "string"}], "confidence": number}

Rules:
- Be concise and directly helpful
- Ground responses in recent messages when relevant
- Set confidence 0.0-1.0 based on certainty of response
- High confidence (0.8+): Clear questions with obvious answers
- Medium confidence (0.5-0.7): General questions with context
- Low confidence (0.0-0.4): Unclear, speculative, or complex requests`;

    const userPrompt = `Latest message to respond to: "${triggerMessage}"

Recent context:
${recentMessages}

Provide a helpful response as ${userName}'s assistant.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.4,
        max_tokens: 500
      }),
    });

    if (!response.ok) {
      return { error: 'AI service error' };
    }

    const data = await response.json();
    return JSON.parse(data.choices[0].message.content);

  } catch (error) {
    console.error('AI generation error:', error);
    return { error: 'AI processing failed' };
  }
}

function getConfidenceThreshold(level: string): number {
  switch (level) {
    case 'low': return 0.3;
    case 'high': return 0.8;
    default: return 0.6; // medium
  }
}

function formatPublicReply(markdown: string, userName: string, isDM: boolean, citations: any[]): string {
  const scope = isDM ? 'DM' : 'Channel';
  const citationText = citations?.length > 0 ? `\nRefs: ${citations.map(c => c.messageId.slice(-6)).join(', ')}` : '';
  
  return `Sidekick (auto for @${userName}) · Used: this ${scope} · Why this?

${markdown}${citationText}`;
}

async function createPrivateDraft(supabase: any, userId: string, content: string, originalChannelId: string) {
  // Create a DM channel with the user (or use existing)
  // For now, we'll create the draft as a system message - in production you'd want a proper draft system
  console.log(`Would create private draft for user ${userId}: ${content}`);
}

async function logAudit(supabase: any, userId: string, channelId: string, triggerType: string, confidence: number | null, action: string) {
  await supabase
    .from('agent_audit')
    .insert({
      user_id: userId,
      channel_id: channelId,
      trigger_type: triggerType,
      confidence,
      action,
      metadata: { timestamp: new Date().toISOString() }
    });
}