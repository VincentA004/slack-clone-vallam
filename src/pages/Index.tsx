import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { ChatView } from '@/components/ChatView';
import { useAuth } from '@/hooks/useAuth';

export default function Index() {
  const { user, loading } = useAuth();
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);

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

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar
          selectedChannelId={selectedChannelId}
          onChannelSelect={setSelectedChannelId}
          onNewChannel={() => {}}
          onNewDM={() => {}}
          onSettings={() => {}}
        />
        
        <div className="flex-1 flex flex-col">
          <header className="h-12 flex items-center border-b bg-card px-4">
            <SidebarTrigger />
          </header>
          
          <ChatView
            channelId={selectedChannelId}
            onSettingsOpen={() => {}}
          />
        </div>
      </div>
    </SidebarProvider>
  );
}
