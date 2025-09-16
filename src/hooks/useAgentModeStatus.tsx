import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface AgentModeStatus {
  isEnabled: boolean;
  scope: 'both' | 'dm' | 'channels';
  timeRemaining: string;
  expiresAt: string | null;
}

export function useAgentModeStatus() {
  const { user } = useAuth();
  const [status, setStatus] = useState<AgentModeStatus>({
    isEnabled: false,
    scope: 'both',
    timeRemaining: '',
    expiresAt: null
  });

  useEffect(() => {
    if (!user) return;

    const loadStatus = async () => {
      try {
        const { data } = await supabase
          .from('user_settings')
          .select('agent_auto_enabled, agent_auto_scope, agent_auto_expires_at')
          .eq('user_id', user.id)
          .single();

        if (data) {
          const now = new Date();
          const expires = data.agent_auto_expires_at ? new Date(data.agent_auto_expires_at) : null;
          const stillActive = expires ? expires > now : false;
          
          setStatus({
            isEnabled: data.agent_auto_enabled && stillActive,
            scope: (data.agent_auto_scope as 'both' | 'dm' | 'channels') || 'both',
            timeRemaining: expires && stillActive ? 
              `${Math.floor((expires.getTime() - now.getTime()) / 60000)}m` : '',
            expiresAt: data.agent_auto_expires_at
          });
        }
      } catch (error) {
        console.error('Error loading agent status:', error);
      }
    };

    loadStatus();
    const interval = setInterval(loadStatus, 60000); // Update every minute
    return () => clearInterval(interval);
  }, [user]);

  return status;
}