import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, Settings } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface AgentModeBannerProps {
  onSettingsClick: () => void;
}

export function AgentModeBanner({ onSettingsClick }: AgentModeBannerProps) {
  const { user } = useAuth();
  const [isEnabled, setIsEnabled] = useState(false);
  const [scope, setScope] = useState<'both' | 'dm' | 'channels'>('both');
  const [timeRemaining, setTimeRemaining] = useState<string>('');
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      loadSettings();
      const interval = setInterval(loadSettings, 60000); // Check every minute
      return () => clearInterval(interval);
    }
  }, [user]);

  useEffect(() => {
    const updateTimer = () => {
      if (isEnabled && expiresAt) {
        const now = new Date();
        const expires = new Date(expiresAt);
        const diff = expires.getTime() - now.getTime();
        
        if (diff <= 0) {
          setIsEnabled(false);
          setTimeRemaining('');
        } else {
          const minutes = Math.floor(diff / 60000);
          setTimeRemaining(`${minutes}m`);
        }
      } else {
        setTimeRemaining('');
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 60000);
    return () => clearInterval(interval);
  }, [isEnabled, expiresAt]);

  const loadSettings = async () => {
    if (!user) return;
    
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
        
        setIsEnabled(data.agent_auto_enabled && stillActive);
        setScope((data.agent_auto_scope as 'both' | 'dm' | 'channels') || 'both');
        setExpiresAt(data.agent_auto_expires_at);
      }
    } catch (error) {
      console.error('Error loading agent settings:', error);
    }
  };

  const handleTurnOff = async () => {
    if (!user) return;
    
    try {
      await supabase
        .from('user_settings')
        .upsert({
          user_id: user.id,
          agent_auto_enabled: false,
          agent_auto_expires_at: null
        });
      
      setIsEnabled(false);
      setTimeRemaining('');
    } catch (error) {
      console.error('Error turning off agent mode:', error);
    }
  };

  const getScopeText = () => {
    switch (scope) {
      case 'dm': return 'DMs';
      case 'channels': return 'Channels';
      default: return 'DMs & Channels';
    }
  };

  if (!isEnabled) return null;

  return (
    <div className="bg-primary/10 border-primary/20 border rounded-lg p-3 mx-4 mb-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Badge variant="default" className="bg-primary">
          Agent Mode ON
        </Badge>
        <span className="text-sm text-muted-foreground">
          {getScopeText()} · {timeRemaining} left
        </span>
      </div>
      
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onSettingsClick}
          className="h-8 w-8 p-0"
        >
          <Settings className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleTurnOff}
          className="h-8 w-8 p-0"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}