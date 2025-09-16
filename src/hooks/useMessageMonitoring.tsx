import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useMessageMonitoring() {
  useEffect(() => {
    // Subscribe to all new messages for Agent Mode monitoring
    const subscription = supabase
      .channel('message-monitor')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages'
      }, (payload) => {
        // Call agent monitor for new messages
        supabase.functions.invoke('agent-monitor', {
          body: { messageId: payload.new.id }
        }).catch(console.error);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, []);
}