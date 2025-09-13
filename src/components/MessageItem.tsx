import { useState } from 'react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Reply, Edit, Trash2, Check, X } from 'lucide-react';

interface Message {
  id: string;
  text: string;
  user_id: string;
  created_at: string;
  profiles: {
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

interface MessageItemProps {
  message: Message;
  replies?: Message[];
  isOwn: boolean;
  onReply: () => void;
  onEdit: (messageId: string, newText: string) => void;
  onDelete: (messageId: string) => void;
}

export function MessageItem({
  message,
  replies = [],
  isOwn,
  onReply,
  onEdit,
  onDelete
}: MessageItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message.text);

  const handleSaveEdit = () => {
    if (editText.trim() && editText !== message.text) {
      onEdit(message.id, editText.trim());
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditText(message.text);
    setIsEditing(false);
  };

  const displayName = message.profiles?.display_name || 'Unknown User';
  const avatarUrl = message.profiles?.avatar_url;
  const initials = displayName.split(' ').map(n => n[0]).join('').toUpperCase();
  const timestamp = format(new Date(message.created_at), 'h:mm a');

  return (
    <div className="group space-y-2">
      {/* Main message */}
      <div className="flex items-start gap-3 hover:bg-muted/30 p-2 rounded-lg">
        <Avatar className="w-8 h-8 shrink-0">
          <AvatarImage src={avatarUrl || undefined} />
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>

        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{displayName}</span>
            <span className="text-xs text-muted-foreground">{timestamp}</span>
          </div>

          {isEditing ? (
            <div className="space-y-2">
              <Input
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveEdit();
                  if (e.key === 'Escape') handleCancelEdit();
                }}
                autoFocus
              />
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={handleSaveEdit}>
                  <Check className="w-3 h-3" />
                </Button>
                <Button size="sm" variant="ghost" onClick={handleCancelEdit}>
                  <X className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="text-sm">{message.text}</div>
              
              {/* Message actions */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={onReply}
                >
                  <Reply className="w-3 h-3" />
                </Button>
                {isOwn && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => setIsEditing(true)}
                    >
                      <Edit className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-destructive hover:text-destructive"
                      onClick={() => onDelete(message.id)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Thread replies */}
      {replies.length > 0 && (
        <div className="ml-11 space-y-2 border-l-2 border-muted pl-4">
          {replies.map((reply) => (
            <div key={reply.id} className="flex items-start gap-3 hover:bg-muted/30 p-2 rounded-lg">
              <Avatar className="w-6 h-6 shrink-0">
                <AvatarImage src={reply.profiles?.avatar_url || undefined} />
                <AvatarFallback className="text-xs">
                  {(reply.profiles?.display_name || 'U').split(' ').map(n => n[0]).join('').toUpperCase()}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-xs">{reply.profiles?.display_name || 'Unknown User'}</span>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(reply.created_at), 'h:mm a')}
                  </span>
                </div>
                <div className="text-sm">{reply.text}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}