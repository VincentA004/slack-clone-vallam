import { useState, useEffect, useRef, useMemo } from 'react';
import { format, isToday, isYesterday, isSameDay } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MessageComposer } from '@/components/MessageComposer';
import { MessageItem } from '@/components/MessageItem';
import { ProposalCard } from '@/components/ProposalCard';
import { Search, Download, Settings } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Message {
  id: string;
  text: string;
  user_id: string;
  parent_message_id: string | null;
  created_at: string;
  profiles: {
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

interface Channel {
  id: string;
  name: string | null;
  is_dm: boolean;
  is_private: boolean;
  agent_enabled: boolean;
  agent_max_posts_per_hour: number;
  dm_user_a: string | null;
  dm_user_b: string | null;
}

interface AgentTask {
  id: string;
  command: string;
  status: string;
  result_json: any;
  created_at: string;
}

interface ChatViewProps {
  channelId: string | null;
  onSettingsOpen: () => void;
}

export function ChatView({ channelId, onSettingsOpen }: ChatViewProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [agentTasks, setAgentTasks] = useState<AgentTask[]>([]);
  const [replyToMessage, setReplyToMessage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!channelId || !user) return;

    loadChannel();
    loadMessages();
    loadAgentTasks();

    // Subscribe to new messages
    const messagesSubscription = supabase
      .channel(`messages:${channelId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `channel_id=eq.${channelId}`
      }, (payload) => {
        loadMessages(); // Reload to get profile data
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `channel_id=eq.${channelId}`
      }, (payload) => {
        loadMessages();
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'messages',
        filter: `channel_id=eq.${channelId}`
      }, (payload) => {
        setMessages(prev => prev.filter(m => m.id !== payload.old.id));
      })
      .subscribe();

    // Subscribe to agent tasks
    const tasksSubscription = supabase
      .channel(`agent_tasks:${channelId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'agent_tasks',
        filter: `channel_id=eq.${channelId}`
      }, () => {
        loadAgentTasks();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(messagesSubscription);
      supabase.removeChannel(tasksSubscription);
    };
  }, [channelId, user]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadChannel = async () => {
    if (!channelId) return;

    const { data } = await supabase
      .from('channels')
      .select('*')
      .eq('id', channelId)
      .single();

    setChannel(data);
  };

  const loadMessages = async () => {
    if (!channelId) return;

    // First fetch messages without joins to avoid FK dependency
    const { data: msgs, error: msgErr } = await supabase
      .from('messages')
      .select('id, text, user_id, parent_message_id, created_at')
      .eq('channel_id', channelId)
      .order('created_at', { ascending: true });

    if (msgErr) {
      return;
    }

    if (!msgs || msgs.length === 0) {
      setMessages([]);
      return;
    }

    const userIds = Array.from(new Set(msgs.map(m => m.user_id)));
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url')
      .in('id', userIds);

    const profileMap = new Map((profs || []).map(p => [p.id as string, { display_name: p.display_name, avatar_url: p.avatar_url }]));

    const withProfiles = (msgs || []).map((m: any) => ({
      ...m,
      profiles: profileMap.get(m.user_id) ?? null,
    }));

    setMessages(withProfiles as any);
  };

  const loadAgentTasks = async () => {
    if (!channelId) return;

    const { data } = await supabase
      .from('agent_tasks')
      .select('*')
      .eq('channel_id', channelId)
      .in('status', ['queued', 'running', 'completed'])
      .order('created_at', { ascending: false });

    if (data) {
      setAgentTasks(data);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async (text: string) => {
    if (!channelId || !user || !text.trim()) return;

    // Ensure membership to satisfy RLS before inserting a message
    await supabase
      .from('channel_members')
      .upsert(
        { channel_id: channelId, user_id: user.id, role: 'member' },
        { onConflict: 'channel_id,user_id' }
      );

    const { error } = await supabase
      .from('messages')
      .insert({
        channel_id: channelId,
        user_id: user.id,
        text: text.trim(),
        parent_message_id: replyToMessage,
      });

    if (error) {
      toast({
        title: "Failed to send message",
        description: error.message,
        variant: "destructive",
      });
    }

    setReplyToMessage(null);
  };

  const handleSlashCommand = async (command: string, args: any) => {
    if (!channelId || !user || !channel) return;

    if (channel.is_dm) {
      toast({
        title: "Agent not available",
        description: "Agent isn't available in DMs (yet).",
        variant: "destructive",
      });
      return;
    }

    if (!channel.agent_enabled) {
      toast({
        title: "Agent disabled",
        description: "Agent is off for this channel.",
        variant: "destructive",
      });
      return;
    }

    // Check rate limit
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const recentTasks = agentTasks.filter(task => 
      task.status === 'completed' && 
      task.created_at > oneHourAgo
    );

    if (recentTasks.length >= channel.agent_max_posts_per_hour) {
      toast({
        title: "Agent cooldown",
        description: `Agent cooldown reached (max ${channel.agent_max_posts_per_hour} posts/hour). Try later.`,
        variant: "destructive",
      });
      return;
    }

    const { error } = await supabase
      .from('agent_tasks')
      .insert({
        channel_id: channelId,
        user_id: user.id,
        command,
        args_json: args,
        status: 'queued'
      });

    if (error) {
      toast({
        title: "Failed to create agent task",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Agent task created",
        description: `Running ${command} command...`,
      });
    }
  };

  const handleExportTranscript = () => {
    if (!messages.length || !channel) return;

    const transcript = messages.map(message => {
      const time = format(new Date(message.created_at), 'HH:mm');
      const author = message.profiles?.display_name || 'Unknown User';
      return `[${time}] ${author}: ${message.text}`;
    }).join('\n');

    const blob = new Blob([transcript], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${channel.name || 'chat'}-transcript.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Transcript exported",
      description: "Chat transcript has been downloaded.",
    });
  };

  const filteredMessages = useMemo(() => {
    if (!searchQuery.trim()) return messages;
    return messages.filter(message => 
      message.text.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [messages, searchQuery]);

  // Group messages by date and thread
  const groupedMessages = useMemo(() => {
    const groups: { date: Date; messages: Message[] }[] = [];
    let currentDate: Date | null = null;
    let currentGroup: Message[] = [];

    filteredMessages.forEach(message => {
      const messageDate = new Date(message.created_at);
      const messageDay = new Date(messageDate.getFullYear(), messageDate.getMonth(), messageDate.getDate());

      if (!currentDate || !isSameDay(currentDate, messageDay)) {
        if (currentGroup.length > 0) {
          groups.push({ date: currentDate!, messages: currentGroup });
        }
        currentDate = messageDay;
        currentGroup = [message];
      } else {
        currentGroup.push(message);
      }
    });

    if (currentGroup.length > 0 && currentDate) {
      groups.push({ date: currentDate, messages: currentGroup });
    }

    return groups;
  }, [filteredMessages]);

  const getChannelDisplayName = () => {
    if (!channel) return 'Select a channel';
    if (channel.is_dm) return 'Direct Message';
    return `# ${channel.name}`;
  };

  const formatDateHeader = (date: Date) => {
    if (isToday(date)) return 'Today';
    if (isYesterday(date)) return 'Yesterday';
    return format(date, 'EEEE, MMMM d');
  };

  if (!channelId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <h2 className="text-xl font-medium text-muted-foreground">
            Welcome to SlackLite
          </h2>
          <p className="text-muted-foreground">
            Select a channel or start a conversation to begin chatting.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-card">
        <h1 className="text-lg font-semibold">{getChannelDisplayName()}</h1>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 max-w-sm">
            <Search className="w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search in channel..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8"
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleExportTranscript}
            disabled={!messages.length}
          >
            <Download className="w-4 h-4" />
          </Button>
          {!channel?.is_dm && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onSettingsOpen}
            >
              <Settings className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {groupedMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-2">
              <p className="text-muted-foreground">
                {searchQuery ? 'No messages found matching your search.' : 'No messages yet.'}
              </p>
              {!searchQuery && (
                <p className="text-sm text-muted-foreground">
                  Start the conversation. Type <strong>/</strong> to try a command.
                </p>
              )}
            </div>
          </div>
        ) : (
          groupedMessages.map(({ date, messages: groupMessages }) => (
            <div key={date.toISOString()} className="space-y-4">
              <div className="flex items-center justify-center">
                <div className="px-3 py-1 bg-muted rounded-full text-xs font-medium text-muted-foreground">
                  {formatDateHeader(date)}
                </div>
              </div>
              
              <div className="space-y-2">
                {groupMessages
                  .filter(msg => !msg.parent_message_id)
                  .map((message) => {
                    const replies = groupMessages.filter(m => m.parent_message_id === message.id);
                    return (
                      <MessageItem
                        key={message.id}
                        message={message}
                        replies={replies}
                        isOwn={message.user_id === user?.id}
                        onReply={() => setReplyToMessage(message.id)}
                        onEdit={(messageId, newText) => {
                          supabase
                            .from('messages')
                            .update({ text: newText })
                            .eq('id', messageId);
                        }}
                        onDelete={(messageId) => {
                          supabase
                            .from('messages')
                            .delete()
                            .eq('id', messageId);
                        }}
                      />
                    );
                  })
                }
              </div>
            </div>
          ))
        )}

        {/* Agent Tasks */}
        {agentTasks
          .filter(task => task.status !== 'rejected')
          .map((task) => (
            <ProposalCard
              key={task.id}
              task={task as any}
              onAccept={async (taskId, markdown) => {
                await supabase
                  .from('messages')
                  .insert({
                    channel_id: channelId,
                    user_id: user!.id,
                    text: markdown,
                  });
                
                await supabase
                  .from('agent_tasks')
                  .update({ status: 'completed' })
                  .eq('id', taskId);
              }}
              onReject={async (taskId) => {
                await supabase
                  .from('agent_tasks')
                  .update({ status: 'rejected' })
                  .eq('id', taskId);
              }}
            />
          ))
        }

        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      <MessageComposer
        onSendMessage={handleSendMessage}
        onSlashCommand={handleSlashCommand}
        replyToMessage={replyToMessage}
        onCancelReply={() => setReplyToMessage(null)}
      />
    </div>
  );
}