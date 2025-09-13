import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

interface Channel {
  id: string;
  name: string | null;
  is_dm: boolean;
  agent_enabled: boolean;
  agent_max_posts_per_hour: number;
}

interface ChannelSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channelId: string | null;
}

export function ChannelSettingsModal({ open, onOpenChange, channelId }: ChannelSettingsModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [channel, setChannel] = useState<Channel | null>(null);
  const [agentEnabled, setAgentEnabled] = useState(false);
  const [maxPostsPerHour, setMaxPostsPerHour] = useState(3);
  const [isLoading, setIsLoading] = useState(false);
  const [userRole, setUserRole] = useState<string>('');

  useEffect(() => {
    if (open && channelId) {
      loadChannelData();
    }
  }, [open, channelId]);

  const loadChannelData = async () => {
    if (!channelId || !user) return;

    // Load channel data
    const { data: channelData } = await supabase
      .from('channels')
      .select('*')
      .eq('id', channelId)
      .single();

    if (channelData) {
      setChannel(channelData);
      setAgentEnabled(channelData.agent_enabled);
      setMaxPostsPerHour(channelData.agent_max_posts_per_hour);
    }

    // Check user role
    const { data: memberData } = await supabase
      .from('channel_members')
      .select('role')
      .eq('channel_id', channelId)
      .eq('user_id', user.id)
      .single();

    if (memberData) {
      setUserRole(memberData.role);
    }
  };

  const handleSave = async () => {
    if (!channelId || !user) return;

    setIsLoading(true);

    try {
      const { error } = await supabase
        .from('channels')
        .update({
          agent_enabled: agentEnabled,
          agent_max_posts_per_hour: maxPostsPerHour,
        })
        .eq('id', channelId);

      if (error) throw error;

      toast({
        title: "Settings saved",
        description: "Channel settings have been updated.",
      });

      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Failed to save settings",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const canEditSettings = userRole === 'owner' || userRole === 'admin';

  if (!channel) {
    return null;
  }

  if (channel.is_dm) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>DM Settings</DialogTitle>
            <DialogDescription>
              Direct messages don't have configurable settings.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Channel Settings</DialogTitle>
          <DialogDescription>
            Manage settings for #{channel.name}
          </DialogDescription>
        </DialogHeader>

        {!canEditSettings && (
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground">
              Only channel owners and admins can modify these settings.
            </p>
          </div>
        )}

        <div className="space-y-6">
          <div className="space-y-4">
            <h4 className="text-sm font-medium">Agent Settings</h4>
            
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label htmlFor="agent-enabled">Enable Agent</Label>
                <p className="text-xs text-muted-foreground">
                  Allow AI agent to respond to slash commands in this channel
                </p>
              </div>
              <Switch
                id="agent-enabled"
                checked={agentEnabled}
                onCheckedChange={setAgentEnabled}
                disabled={!canEditSettings}
              />
            </div>

            {agentEnabled && (
              <div className="space-y-2">
                <Label htmlFor="max-posts">Max Posts Per Hour</Label>
                <Input
                  id="max-posts"
                  type="number"
                  min="1"
                  max="20"
                  value={maxPostsPerHour}
                  onChange={(e) => setMaxPostsPerHour(parseInt(e.target.value) || 3)}
                  disabled={!canEditSettings}
                />
                <p className="text-xs text-muted-foreground">
                  Maximum number of agent responses allowed per hour to prevent spam
                </p>
              </div>
            )}
          </div>
        </div>

        {canEditSettings && (
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isLoading}>
              {isLoading ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        )}

        {!canEditSettings && (
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}