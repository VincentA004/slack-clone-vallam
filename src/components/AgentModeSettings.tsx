import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Trash2, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth';

interface UserSettings {
  agent_auto_enabled: boolean;
  agent_auto_scope: 'both' | 'dm' | 'channels';
  agent_auto_expires_at: string | null;
  agent_auto_blocked_topics: string[];
  agent_auto_confidence: 'low' | 'medium' | 'high';
}

export function AgentModeSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [settings, setSettings] = useState<UserSettings>({
    agent_auto_enabled: false,
    agent_auto_scope: 'both',
    agent_auto_expires_at: null,
    agent_auto_blocked_topics: [],
    agent_auto_confidence: 'medium'
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newTopic, setNewTopic] = useState('');
  const [timeRemaining, setTimeRemaining] = useState<string>('');

  useEffect(() => {
    if (user) {
      loadSettings();
    }
  }, [user]);

  useEffect(() => {
    const updateTimer = () => {
      if (settings.agent_auto_enabled && settings.agent_auto_expires_at) {
        const now = new Date();
        const expires = new Date(settings.agent_auto_expires_at);
        const diff = expires.getTime() - now.getTime();
        
        if (diff <= 0) {
          setSettings(prev => ({ ...prev, agent_auto_enabled: false }));
          setTimeRemaining('');
        } else {
          const minutes = Math.floor(diff / 60000);
          setTimeRemaining(`${minutes}m left`);
        }
      } else {
        setTimeRemaining('');
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 60000); // Update every minute
    return () => clearInterval(interval);
  }, [settings.agent_auto_enabled, settings.agent_auto_expires_at]);

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user!.id)
        .single();

      if (error && error.code !== 'PGRST116') { // Not found error
        console.error('Error loading settings:', error);
        return;
      }

      if (data) {
        setSettings({
          agent_auto_enabled: data.agent_auto_enabled || false,
          agent_auto_scope: (data.agent_auto_scope as 'both' | 'dm' | 'channels') || 'both',
          agent_auto_expires_at: data.agent_auto_expires_at,
          agent_auto_blocked_topics: data.agent_auto_blocked_topics || [],
          agent_auto_confidence: 'medium' // Default since not in DB yet
        });
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async (newSettings: Partial<UserSettings>) => {
    setSaving(true);
    try {
      const updatedSettings = { ...settings, ...newSettings };
      
      const { error } = await supabase
        .from('user_settings')
        .upsert({
          user_id: user!.id,
          ...updatedSettings
        });

      if (error) throw error;

      setSettings(updatedSettings);
      toast({
        title: "Settings saved",
        description: "Agent Mode settings updated successfully",
      });
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: "Error",
        description: "Failed to save settings",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAgent = async (enabled: boolean) => {
    if (enabled) {
      // Set expiration time based on current settings or default to 30 minutes
      const minutes = 30; // Default duration
      const expiresAt = new Date(Date.now() + minutes * 60000).toISOString();
      await saveSettings({ 
        agent_auto_enabled: true, 
        agent_auto_expires_at: expiresAt 
      });
    } else {
      await saveSettings({ 
        agent_auto_enabled: false,
        agent_auto_expires_at: null
      });
    }
  };

  const handleDurationChange = async (minutes: number) => {
    const expiresAt = new Date(Date.now() + minutes * 60000).toISOString();
    await saveSettings({ agent_auto_expires_at: expiresAt });
  };

  const addBlockedTopic = async () => {
    if (newTopic.trim() && !settings.agent_auto_blocked_topics.includes(newTopic.trim())) {
      const updatedTopics = [...settings.agent_auto_blocked_topics, newTopic.trim()];
      await saveSettings({ agent_auto_blocked_topics: updatedTopics });
      setNewTopic('');
    }
  };

  const removeBlockedTopic = async (topic: string) => {
    const updatedTopics = settings.agent_auto_blocked_topics.filter(t => t !== topic);
    await saveSettings({ agent_auto_blocked_topics: updatedTopics });
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Agent Mode</CardTitle>
          <CardDescription>Loading settings...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Agent Mode
          {settings.agent_auto_enabled && (
            <Badge variant="default" className="ml-2">
              ON · {settings.agent_auto_scope} · {timeRemaining}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Automatically reply to DMs and @mentions when enabled
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Main Toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="agent-enabled">Enable Agent Mode</Label>
            <p className="text-sm text-muted-foreground">
              Allow Sidekick to respond automatically
            </p>
          </div>
          <Switch
            id="agent-enabled"
            checked={settings.agent_auto_enabled}
            onCheckedChange={handleToggleAgent}
            disabled={saving}
          />
        </div>

        {settings.agent_auto_enabled && (
          <>
            <Separator />
            
            {/* Scope Selection */}
            <div className="space-y-2">
              <Label>Response Scope</Label>
              <Select
                value={settings.agent_auto_scope}
                onValueChange={(value: 'both' | 'dm' | 'channels') => 
                  saveSettings({ agent_auto_scope: value })
                }
                disabled={saving}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">DMs & Channels</SelectItem>
                  <SelectItem value="dm">DMs Only</SelectItem>
                  <SelectItem value="channels">Channels Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Duration Controls */}
            <div className="space-y-2">
              <Label>Auto-expire in</Label>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDurationChange(15)}
                  disabled={saving}
                >
                  15m
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDurationChange(30)}
                  disabled={saving}
                >
                  30m
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDurationChange(60)}
                  disabled={saving}
                >
                  60m
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDurationChange(120)}
                  disabled={saving}
                >
                  2h
                </Button>
              </div>
            </div>

            {/* Confidence Threshold */}
            <div className="space-y-2">
              <Label>Confidence Threshold</Label>
              <Select
                value={settings.agent_auto_confidence}
                onValueChange={(value: 'low' | 'medium' | 'high') => 
                  saveSettings({ agent_auto_confidence: value })
                }
                disabled={saving}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low - Reply to most messages</SelectItem>
                  <SelectItem value="medium">Medium - Balanced responses</SelectItem>
                  <SelectItem value="high">High - Only confident replies</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* Blocked Topics */}
            <div className="space-y-3">
              <Label>Blocked Topics (Optional)</Label>
              <p className="text-sm text-muted-foreground">
                Topics the agent should avoid responding to
              </p>
              
              <div className="flex gap-2">
                <Input
                  placeholder="e.g., finances, personal issues"
                  value={newTopic}
                  onChange={(e) => setNewTopic(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addBlockedTopic()}
                />
                <Button 
                  onClick={addBlockedTopic} 
                  size="sm"
                  variant="outline"
                  disabled={!newTopic.trim() || saving}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {settings.agent_auto_blocked_topics.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {settings.agent_auto_blocked_topics.map((topic) => (
                    <Badge key={topic} variant="secondary" className="flex items-center gap-1">
                      {topic}
                      <button
                        onClick={() => removeBlockedTopic(topic)}
                        className="ml-1 hover:text-destructive"
                        disabled={saving}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Turn Off Button */}
            <Separator />
            <Button
              variant="outline"
              onClick={() => handleToggleAgent(false)}
              disabled={saving}
              className="w-full"
            >
              Turn Off Agent Mode
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}