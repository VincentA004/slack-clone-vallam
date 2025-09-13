import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { ChatView } from '@/components/ChatView';
import { NewChannelModal } from '@/components/NewChannelModal';
import { NewDMModal } from '@/components/NewDMModal';
import { ChannelSettingsModal } from '@/components/ChannelSettingsModal';
import { useAuth } from '@/hooks/useAuth';

export default function Index() {
  const { user, loading } = useAuth();
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [showNewChannelModal, setShowNewChannelModal] = useState(false);
  const [showNewDMModal, setShowNewDMModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  const handleChannelCreated = (channelId: string) => {
    setSelectedChannelId(channelId);
  };

  const handleDMCreated = (channelId: string) => {
    setSelectedChannelId(channelId);
  };

  return (
    <>
      <SidebarProvider>
        <div className="min-h-screen flex w-full">
          <AppSidebar
            selectedChannelId={selectedChannelId}
            onChannelSelect={setSelectedChannelId}
            onNewChannel={() => setShowNewChannelModal(true)}
            onNewDM={() => setShowNewDMModal(true)}
            onSettings={() => setShowSettingsModal(true)}
          />
          
          <div className="flex-1 flex flex-col">
            <header className="h-12 flex items-center border-b bg-card px-4">
              <SidebarTrigger />
            </header>
            
            <ChatView
              channelId={selectedChannelId}
              onSettingsOpen={() => setShowSettingsModal(true)}
            />
          </div>
        </div>
      </SidebarProvider>

      <NewChannelModal
        open={showNewChannelModal}
        onOpenChange={setShowNewChannelModal}
        onChannelCreated={handleChannelCreated}
      />

      <NewDMModal
        open={showNewDMModal}
        onOpenChange={setShowNewDMModal}
        onDMCreated={handleDMCreated}
      />

      <ChannelSettingsModal
        open={showSettingsModal}
        onOpenChange={setShowSettingsModal}
        channelId={selectedChannelId}
      />
    </>
  );
}
