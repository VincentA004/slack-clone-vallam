import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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

interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface NewDMModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDMCreated: (channelId: string) => void;
}

export function NewDMModal({ open, onOpenChange, onDMCreated }: NewDMModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open) {
      loadProfiles();
    }
  }, [open]);

  const loadProfiles = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .neq('id', user?.id);

    if (data) {
      setProfiles(data);
    }
  };

  const getOrCreateDM = async (otherUserId: string) => {
    if (!user) return null;

    const userA = user.id < otherUserId ? user.id : otherUserId;
    const userB = user.id > otherUserId ? user.id : otherUserId;

    // Check if DM already exists
    let { data: existingChannel } = await supabase
      .from('channels')
      .select('*')
      .eq('is_dm', true)
      .eq('dm_user_a', userA)
      .eq('dm_user_b', userB)
      .single();

    if (existingChannel) {
      return existingChannel.id;
    }

    // Create new DM channel
    const { data: newChannel, error: channelError } = await supabase
      .from('channels')
      .insert({
        is_dm: true,
        dm_user_a: userA,
        dm_user_b: userB,
        agent_enabled: false, // DMs don't have agents by default
      })
      .select()
      .single();

    if (channelError) throw channelError;

    // Add both users as members
    const { error: memberError } = await supabase
      .from('channel_members')
      .insert([
        {
          channel_id: newChannel.id,
          user_id: user.id,
          role: 'member',
        },
        {
          channel_id: newChannel.id,
          user_id: otherUserId,
          role: 'member',
        },
      ]);

    if (memberError) throw memberError;

    return newChannel.id;
  };

  const handleStartDM = async () => {
    if (!selectedProfile || !user) return;

    setIsLoading(true);

    try {
      const channelId = await getOrCreateDM(selectedProfile.id);
      
      if (channelId) {
        onDMCreated(channelId);
        onOpenChange(false);
        setSelectedProfile(null);
        setSearchQuery('');
        
        toast({
          title: "Direct message started",
          description: `Started conversation with ${selectedProfile.display_name || 'User'}`,
        });
      }
    } catch (error: any) {
      toast({
        title: "Failed to start DM",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const filteredProfiles = profiles.filter(profile =>
    profile.display_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Start a direct message</DialogTitle>
          <DialogDescription>
            Send a direct message to someone in your workspace.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="user-search">Find a person</Label>
            <Input
              id="user-search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for someone..."
            />
          </div>

          <div className="max-h-60 overflow-y-auto space-y-1">
            {filteredProfiles.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No users found
              </p>
            ) : (
              filteredProfiles.map((profile) => (
                <div
                  key={profile.id}
                  className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                    selectedProfile?.id === profile.id
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-accent'
                  }`}
                  onClick={() => setSelectedProfile(profile)}
                >
                  <Avatar className="w-8 h-8">
                    <AvatarImage src={profile.avatar_url || undefined} />
                    <AvatarFallback>
                      {(profile.display_name || 'U').charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-medium">
                    {profile.display_name || 'Unknown User'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleStartDM}
            disabled={isLoading || !selectedProfile}
          >
            {isLoading ? 'Starting...' : 'Start DM'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}