import { useState } from 'react';
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

interface NewChannelModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChannelCreated: (channelId: string) => void;
}

export function NewChannelModal({ open, onOpenChange, onChannelCreated }: NewChannelModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !name.trim()) return;

    setIsLoading(true);

    try {
      // Create the channel
      const { data: channel, error: channelError } = await supabase
        .from('channels')
        .insert({
          name: name.trim(),
          is_private: isPrivate,
          is_dm: false,
        })
        .select()
        .single();

      if (channelError) throw channelError;

      // Add the creator as owner
      const { error: memberError } = await supabase
        .from('channel_members')
        .insert({
          channel_id: channel.id,
          user_id: user.id,
          role: 'owner',
        });

      if (memberError) throw memberError;

      toast({
        title: "Channel created",
        description: `#${name} has been created successfully.`,
      });

      onChannelCreated(channel.id);
      onOpenChange(false);
      setName('');
      setIsPrivate(false);
    } catch (error: any) {
      toast({
        title: "Failed to create channel",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create a new channel</DialogTitle>
          <DialogDescription>
            Channels are where your team communicates. They're best when organized around a topic — #marketing, for example.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="channel-name">Channel name</Label>
            <div className="flex items-center">
              <span className="text-muted-foreground mr-1">#</span>
              <Input
                id="channel-name"
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="e.g. marketing"
                className="flex-1"
                required
              />
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="is-private"
              checked={isPrivate}
              onCheckedChange={setIsPrivate}
            />
            <Label htmlFor="is-private">Make private</Label>
          </div>
          {isPrivate && (
            <p className="text-sm text-muted-foreground">
              Private channels can only be viewed or joined by invitation.
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !name.trim()}>
              {isLoading ? 'Creating...' : 'Create Channel'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}