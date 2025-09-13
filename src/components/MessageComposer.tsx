import { useState, useRef, KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, X } from 'lucide-react';

interface MessageComposerProps {
  onSendMessage: (message: string) => void;
  onSlashCommand: (command: string, args: any) => void;
  replyToMessage?: string | null;
  onCancelReply?: () => void;
}

export function MessageComposer({
  onSendMessage,
  onSlashCommand,
  replyToMessage,
  onCancelReply
}: MessageComposerProps) {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    if (!message.trim()) return;

    // Check for slash commands
    if (message.startsWith('/')) {
      const parts = message.slice(1).split(' ');
      const command = parts[0];
      
      if (command === 'summary' || command === 'tasks') {
        const lastArg = parts.find(p => p.startsWith('last='));
        const last = lastArg ? parseInt(lastArg.split('=')[1]) : 50;
        
        onSlashCommand(command, { last });
        setMessage('');
        return;
      }
    }

    onSendMessage(message);
    setMessage('');
  };

  const adjustTextareaHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      const maxHeight = 96; // max-h-24 = 96px
      textareaRef.current.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
    }
  };

  return (
    <div className="composer-card space-y-3">
      {replyToMessage && (
        <div className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
          <span className="text-sm text-muted-foreground">Replying to message</span>
          <Button
            variant="ghost"
            size="icon"
            className="w-5 h-5"
            onClick={onCancelReply}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      )}
      
      <div className="flex items-end gap-2">
        <div className="flex-1 relative">
          <Textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              adjustTextareaHeight();
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type a message... (use / for commands)"
            className="min-h-[56px] max-h-24 resize-none border-0 bg-transparent focus-visible:ring-0 p-3"
            style={{ height: '56px' }}
          />
          
          {message.startsWith('/') && (
            <div className="absolute left-3 top-1 text-xs text-muted-foreground bg-background px-1 rounded">
              Slash command
            </div>
          )}
        </div>
        
        <Button
          onClick={handleSend}
          disabled={!message.trim()}
          size="icon"
          className="shrink-0"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}