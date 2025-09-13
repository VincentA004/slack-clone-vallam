import { useState, useRef, KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandList, CommandItem, CommandGroup } from '@/components/ui/command';
import { Send, X, Hash, ListTodo, HelpCircle } from 'lucide-react';

interface MessageComposerProps {
  onSendMessage: (message: string) => void;
  onSlashCommand: (command: string, args: any) => void;
  onHelpCommand: () => void;
  replyToMessage?: string | null;
  onCancelReply?: () => void;
  isAdmin?: boolean;
}

export function MessageComposer({
  onSendMessage,
  onSlashCommand,
  onHelpCommand,
  replyToMessage,
  onCancelReply,
  isAdmin = false
}: MessageComposerProps) {
  const [message, setMessage] = useState('');
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const commands = [
    {
      id: 'summary',
      label: '/summary',
      description: 'Summarize recent messages',
      icon: Hash,
      template: '/summary last=50'
    },
    {
      id: 'tasks',
      label: '/tasks', 
      description: 'Extract tasks from messages',
      icon: ListTodo,
      template: '/tasks last=50'
    },
    {
      id: 'help',
      label: '/help',
      description: 'Show available commands',
      icon: HelpCircle,
      template: '/help'
    }
  ];

  const shouldShowSlashMenu = (text: string) => {
    const trimmed = text.trimStart();
    return trimmed === '/' || (trimmed.startsWith('/') && !trimmed.includes(' '));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (showSlashMenu) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedCommandIndex((prev) => (prev + 1) % commands.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedCommandIndex((prev) => (prev - 1 + commands.length) % commands.length);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        insertCommand(commands[selectedCommandIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowSlashMenu(false);
        setSelectedCommandIndex(0);
        return;
      }
    }
    
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const insertCommand = (command: typeof commands[0]) => {
    setMessage(command.template);
    setShowSlashMenu(false);
    setSelectedCommandIndex(0);
    textareaRef.current?.focus();
  };

  const handleMessageChange = (newMessage: string) => {
    setMessage(newMessage);
    
    const shouldShow = shouldShowSlashMenu(newMessage);
    if (shouldShow !== showSlashMenu) {
      setShowSlashMenu(shouldShow);
      if (shouldShow) {
        setSelectedCommandIndex(0);
      }
    }
    
    adjustTextareaHeight();
  };

  const handleSend = () => {
    if (!message.trim()) return;

    // Check for slash commands
    if (message.startsWith('/')) {
      const parts = message.slice(1).split(' ');
      const command = parts[0];
      
      if (command === 'help') {
        onHelpCommand();
        setMessage('');
        return;
      }
      
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
      const minHeight = 48; // min height
      textareaRef.current.style.height = `${Math.max(minHeight, Math.min(scrollHeight, maxHeight))}px`;
    }
  };

  return (
    <div className="w-full bg-card border-t border-border p-4">
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
        
        <div className="flex items-end gap-3">
          <div className="flex-1 relative">
            <Popover open={showSlashMenu} onOpenChange={setShowSlashMenu}>
              <PopoverTrigger asChild>
                <Textarea
                  ref={textareaRef}
                  value={message}
                  onChange={(e) => handleMessageChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isAdmin ? "Type a message... (use / for commands - Admin commands available)" : "Type a message... (use / for commands)"}
                  className="min-h-[48px] max-h-24 resize-none bg-input border border-border focus-visible:ring-2 focus-visible:ring-ring rounded-md p-3"
                  style={{ height: '48px' }}
                />
              </PopoverTrigger>
              
              <PopoverContent 
                side="top" 
                align="start" 
                className="w-80 p-0 bg-popover border border-border shadow-lg z-[100]"
                onOpenAutoFocus={(e) => e.preventDefault()}
              >
                <Command>
                  <CommandList>
                    <CommandGroup heading="Commands">
                      {commands.map((command, index) => {
                        const IconComponent = command.icon;
                        return (
                          <CommandItem
                            key={command.id}
                            onSelect={() => insertCommand(command)}
                            className={`flex items-center gap-3 p-3 cursor-pointer ${
                              index === selectedCommandIndex ? 'bg-accent' : ''
                            }`}
                          >
                            <IconComponent className="w-4 h-4 text-muted-foreground" />
                            <div className="flex-1">
                              <div className="font-medium">{command.label}</div>
                              <div className="text-sm text-muted-foreground">{command.description}</div>
                            </div>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            
            {message.startsWith('/') && !showSlashMenu && (
              <div className="absolute left-3 top-1 text-xs text-muted-foreground bg-card px-1 rounded">
                Slash command
              </div>
            )}
          </div>
          
          <Button
            onClick={handleSend}
            disabled={!message.trim()}
            size="icon"
            className="shrink-0 h-12 w-12"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}