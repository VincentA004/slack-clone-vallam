import { useState, useEffect } from 'react';
import { Hash, MessageCircle, Plus, Settings, LogOut, Users } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';

interface Channel {
  id: string;
  name: string | null;
  is_dm: boolean;
  dm_user_a: string | null;
  dm_user_b: string | null;
}

interface Profile {
  id: string;
  display_name: string | null;
}

interface AppSidebarProps {
  selectedChannelId: string | null;
  onChannelSelect: (channelId: string) => void;
  onNewChannel: () => void;
  onNewDM: () => void;
  onSettings: () => void;
}

export function AppSidebar({
  selectedChannelId,
  onChannelSelect,
  onNewChannel,
  onNewDM,
  onSettings
}: AppSidebarProps) {
  const { user, signOut } = useAuth();
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const [channels, setChannels] = useState<Channel[]>([]);
  const [dms, setDMs] = useState<Channel[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!user) return;

    loadChannels();
    loadProfiles();
    loadUnreadCounts();

    // Subscribe to channels updates
    const channelsSubscription = supabase
      .channel('channels-changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'channels' 
      }, loadChannels)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'channel_members' 
      }, loadChannels)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'messages' 
      }, loadUnreadCounts)
      .subscribe();

    return () => {
      supabase.removeChannel(channelsSubscription);
    };
  }, [user]);

  useEffect(() => {
    if (selectedChannelId && user) {
      markChannelAsRead(selectedChannelId);
    }
  }, [selectedChannelId, user]);

  const loadChannels = async () => {
    if (!user) return;

    const { data } = await supabase
      .from('channels')
      .select('*')
      .order('created_at');

    if (data) {
      setChannels(data.filter(c => !c.is_dm));
      setDMs(data.filter(c => c.is_dm));
    }
  };

  const loadProfiles = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*');

    if (data) {
      const profilesMap = data.reduce((acc, profile) => {
        acc[profile.id] = profile;
        return acc;
      }, {} as Record<string, Profile>);
      setProfiles(profilesMap);
    }
  };

  const loadUnreadCounts = async () => {
    if (!user) return;

    const { data: reads } = await supabase
      .from('channel_reads')
      .select('channel_id, last_read_at')
      .eq('user_id', user.id);

    const { data: latestMessages } = await supabase
      .from('messages')
      .select('channel_id, created_at')
      .order('created_at', { ascending: false });

    const unreadMap: Record<string, number> = {};
    
    if (latestMessages && reads) {
      const readMap = new Map(reads.map(r => [r.channel_id, r.last_read_at]));
      
      [...channels, ...dms].forEach(channel => {
        const lastRead = readMap.get(channel.id);
        if (!lastRead) {
          // Count all messages if never read
          const count = latestMessages.filter(m => m.channel_id === channel.id).length;
          if (count > 0) unreadMap[channel.id] = count;
        } else {
          // Count messages after last read
          const count = latestMessages.filter(m => 
            m.channel_id === channel.id && 
            new Date(m.created_at) > new Date(lastRead)
          ).length;
          if (count > 0) unreadMap[channel.id] = count;
        }
      });
    }

    setUnreadCounts(unreadMap);
  };

  const markChannelAsRead = async (channelId: string) => {
    if (!user) return;

    await supabase
      .from('channel_reads')
      .upsert({
        user_id: user.id,
        channel_id: channelId,
        last_read_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,channel_id'
      });

    // Remove from unread counts
    setUnreadCounts(prev => {
      const next = { ...prev };
      delete next[channelId];
      return next;
    });
  };

  const getDMDisplayName = (dm: Channel) => {
    if (!user) return 'Unknown User';
    
    const otherUserId = dm.dm_user_a === user.id ? dm.dm_user_b : dm.dm_user_a;
    const otherProfile = otherUserId ? profiles[otherUserId] : null;
    
    return otherProfile?.display_name || 'Unknown User';
  };

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <Sidebar collapsible="icon" variant="inset" className={collapsed ? "w-14" : "w-80"}>
      <SidebarHeader className="p-4">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 rounded-lg">
              <MessageCircle className="w-5 h-5 text-primary" />
            </div>
            <h1 className="font-semibold text-lg">SlackLite</h1>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="px-2">
        {/* Channels Section */}
        <SidebarGroup>
          <div className="flex items-center justify-between">
            <SidebarGroupLabel className="flex items-center gap-2">
              <Hash className="w-4 h-4" />
              {!collapsed && "Channels"}
            </SidebarGroupLabel>
            {!collapsed && (
              <Button
                variant="ghost"
                size="icon"
                className="w-5 h-5"
                onClick={onNewChannel}
              >
                <Plus className="w-3 h-3" />
              </Button>
            )}
          </div>
          <SidebarGroupContent>
            <SidebarMenu>
              {channels.map((channel) => (
                <SidebarMenuItem key={channel.id}>
                  <SidebarMenuButton
                    onClick={() => onChannelSelect(channel.id)}
                    isActive={selectedChannelId === channel.id}
                    className="w-full justify-start relative"
                  >
                    <Hash className="w-4 h-4" />
                    {!collapsed && <span>{channel.name}</span>}
                    {unreadCounts[channel.id] && (
                      <div className="w-2 h-2 bg-red-500 rounded-full absolute -top-1 -right-1" />
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Direct Messages Section */}
        <SidebarGroup>
          <div className="flex items-center justify-between">
            <SidebarGroupLabel className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4" />
              {!collapsed && "Direct Messages"}
            </SidebarGroupLabel>
            {!collapsed && (
              <Button
                variant="ghost"
                size="icon"
                className="w-5 h-5"
                onClick={onNewDM}
              >
                <Plus className="w-3 h-3" />
              </Button>
            )}
          </div>
          <SidebarGroupContent>
            <SidebarMenu>
              {dms.map((dm) => (
                <SidebarMenuItem key={dm.id}>
                  <SidebarMenuButton
                    onClick={() => onChannelSelect(dm.id)}
                    isActive={selectedChannelId === dm.id}
                    className="w-full justify-start relative"
                  >
                    <Users className="w-4 h-4" />
                    {!collapsed && <span>{getDMDisplayName(dm)}</span>}
                    {unreadCounts[dm.id] && (
                      <div className="w-2 h-2 bg-red-500 rounded-full absolute -top-1 -right-1" />
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4">
        <div className="space-y-2">
          {!collapsed && (
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={onSettings}
            >
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </Button>
          )}
          <Button
            variant="ghost"
            className={collapsed ? "w-full" : "w-full justify-start"}
            onClick={handleSignOut}
          >
            <LogOut className="w-4 h-4" />
            {!collapsed && <span className="ml-2">Sign Out</span>}
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}