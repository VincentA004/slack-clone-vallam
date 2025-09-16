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

    const { taskId } = await req.json();
    
    console.log(`Processing agent task: ${taskId}`);

    // Get task details
    const { data: task, error: taskError } = await supabase
      .from('agent_tasks')
      .select('*')
      .eq('id', taskId)
      .single();

    if (taskError || !task) {
      console.error('Error fetching task:', taskError);
      return new Response(JSON.stringify({ error: 'Task not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update task status to running
    await supabase
      .from('agent_tasks')
      .update({ status: 'running' })
      .eq('id', taskId);

    // Get channel info
    const { data: channel } = await supabase
      .from('channels')
      .select('name, is_dm, dm_user_a, dm_user_b')
      .eq('id', task.channel_id)
      .single();

    // Get recent messages
    const lastCount = task.args_json?.last || 50;
    const clampedCount = Math.min(Math.max(lastCount, 10), 200);
    
    const { data: messages } = await supabase
      .from('messages')
      .select(`
        id,
        text,
        created_at,
        user_id,
        profiles:user_id (display_name)
      `)
      .eq('channel_id', task.channel_id)
      .order('created_at', { ascending: false })
      .limit(clampedCount);

    if (!messages || messages.length < 5) {
      await supabase
        .from('agent_tasks')
        .update({ 
          status: 'failed',
          result_json: { error: 'Not enough recent messages—try a larger `last`.' }
        })
        .eq('id', taskId);
      
      return new Response(JSON.stringify({ error: 'Not enough messages' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get channel members for owner validation
    const { data: members } = await supabase
      .from('channel_members')
      .select(`
        user_id,
        profiles:user_id (display_name)
      `)
      .eq('channel_id', task.channel_id);

    const memberDisplayNames = members?.map(m => m.profiles?.display_name).filter(Boolean) || [];

    // Format messages for AI
    const formattedMessages = messages
      .reverse()
      .map(m => {
        const timestamp = new Date(m.created_at).toISOString().slice(0, 16).replace('T', ' ');
        const displayName = m.profiles?.display_name || 'Unknown';
        return `[${timestamp} | @${displayName} | ${m.id}] ${m.text}`;
      })
      .join('\n');

    // Call OpenAI
    const openAIResponse = await callOpenAI(task.command, formattedMessages, memberDisplayNames, channel?.is_dm);

    if (openAIResponse.error) {
      await supabase
        .from('agent_tasks')
        .update({ 
          status: 'failed',
          result_json: { error: openAIResponse.error }
        })
        .eq('id', taskId);
      
      return new Response(JSON.stringify({ error: openAIResponse.error }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate citations exist
    const validCitations = openAIResponse.citations?.filter(c => 
      messages.some(m => m.id === c.messageId)
    ) || [];

    const result = {
      markdown: openAIResponse.markdown,
      citations: validCitations,
      scope: channel?.is_dm ? 'dm' : 'channel'
    };

    // Update task with result
    await supabase
      .from('agent_tasks')
      .update({ 
        status: 'completed',
        result_json: result
      })
      .eq('id', taskId);

    console.log(`Task ${taskId} completed successfully`);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in agent-process:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function callOpenAI(command: string, messages: string, memberNames: string[], isDM: boolean) {
  const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openAIApiKey) {
    return { error: 'OpenAI API key not configured' };
  }

  try {
    let systemPrompt: string;
    let userPrompt: string;

    if (command === 'summary') {
      systemPrompt = `You are 'Sidekick', a careful assistant. Use **only** the provided room messages as evidence. Output **valid JSON** matching the schema. If evidence is weak, say so.

Schema: {"markdown": "string", "citations": [{"messageId": "string"}]}

Create a summary with exactly 4 sections:
1. **Context** — what changed/matters
2. **Decisions** — what was decided
3. **Open Questions** — what's still unclear  
4. **Owners** — who owns what

Rules:
- Maximum 10 total bullets across sections
- Include 2-5 citations supporting key claims
- Brief uncertainty notes if evidence is thin
- Plain, concise language`;

      userPrompt = `Summarize these messages:

${messages}`;

    } else if (command === 'tasks') {
      const ownerList = isDM ? "Only the two DM participants" : memberNames.join(', ');
      
      systemPrompt = `You are 'Sidekick', a careful assistant. Use **only** the provided room messages as evidence. Output **valid JSON** matching the schema.

Schema: {"markdown": "string", "citations": [{"messageId": "string"}]}

Extract actionable tasks in this exact format:
- [ ] @owner | task text | Due: optional

Rules:
- Owners must be: ${ownerList}
- Prefer fewer, clearer tasks
- Skip vague/duplicate items
- If none found: "No actionable items found."`;

      userPrompt = `Extract tasks from these messages:

Valid owners: ${ownerList}

Messages:
${messages}`;
    }

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
        temperature: 0.3,
        max_tokens: 1000
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', errorText);
      return { error: 'AI processing failed' };
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    try {
      return JSON.parse(content);
    } catch (parseError) {
      console.error('JSON parse error:', parseError, 'Content:', content);
      return { error: 'AI response format error' };
    }

  } catch (error) {
    console.error('OpenAI call error:', error);
    return { error: 'AI service unavailable' };
  }
}