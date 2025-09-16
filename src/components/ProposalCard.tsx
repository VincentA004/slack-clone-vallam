import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle, XCircle, Edit, Loader2 } from 'lucide-react';

interface AgentTask {
  id: string;
  command: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'rejected';
  result_json: any;
  created_at: string;
}

interface ProposalCardProps {
  task: AgentTask;
  onAccept: (taskId: string, markdown: string) => Promise<void>;
  onReject: (taskId: string) => Promise<void>;
}

export function ProposalCard({ task, onAccept, onReject }: ProposalCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedMarkdown, setEditedMarkdown] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  if (task.status === 'queued' || task.status === 'running') {
    return (
      <Card className="proposal-card">
        <CardContent className="flex items-center gap-3 p-4">
          <Loader2 className="w-5 h-5 animate-spin" />
          <div>
            <div className="font-medium">
              {task.status === 'queued' ? 'Queued' : 'Running'} {task.command}
            </div>
            <div className="text-sm text-muted-foreground">
              {task.status === 'queued' 
                ? 'Waiting to process...' 
                : 'Agent is working on your request...'}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (task.status === 'failed') {
    return (
      <Card className="proposal-card border-destructive">
        <CardContent className="flex items-center gap-3 p-4">
          <XCircle className="w-5 h-5 text-destructive" />
          <div>
            <div className="font-medium">Failed: {task.command}</div>
            <div className="text-sm text-muted-foreground">
              The agent encountered an error processing your request.
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (task.status === 'completed' && task.result_json) {
    const result = task.result_json;
    const markdown = result.markdown || result.summary || result.content || 'No content available';
    const citations = result.citations || [];

    const handleAccept = async () => {
      setIsProcessing(true);
      try {
        await onAccept(task.id, isEditing ? editedMarkdown : markdown);
      } finally {
        setIsProcessing(false);
      }
    };

    const handleReject = async () => {
      setIsProcessing(true);
      try {
        await onReject(task.id);
      } finally {
        setIsProcessing(false);
      }
    };

    const startEditing = () => {
      setEditedMarkdown(markdown);
      setIsEditing(true);
    };

    return (
      <Card className="proposal-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              {task.command === 'summary' ? 'Summary' : task.command === 'tasks' ? 'Tasks' : task.command}
              <CheckCircle className="w-5 h-5 text-success" />
            </CardTitle>
            <Badge variant="secondary" className="text-xs">
              Used: this {task.result_json?.scope === 'dm' ? 'DM' : 'channel'}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {isEditing ? (
            <div className="space-y-3">
              <Textarea
                value={editedMarkdown}
                onChange={(e) => setEditedMarkdown(e.target.value)}
                className="min-h-32"
                placeholder="Edit the content..."
              />
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => setIsEditing(false)}
                  variant="outline"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleAccept}
                  disabled={isProcessing}
                >
                  {isProcessing ? 'Saving...' : 'Save & Accept'}
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Markdown content */}
              <div className="prose prose-sm max-w-none">
                <div className="whitespace-pre-wrap">{markdown}</div>
              </div>

              {/* Citations */}
              {citations.length > 0 && (
                <div className="space-y-2">
                  <div className="text-sm font-medium">Citations:</div>
                  <div className="flex flex-wrap gap-2">
                    {citations.map((citation: any, index: number) => (
                      <Badge
                        key={index}
                        variant="outline"
                        className="cursor-pointer hover:bg-muted"
                        onClick={() => {
                          // Scroll to cited message if possible
                          const element = document.querySelector(`[data-message-id="${citation.messageId}"]`);
                          if (element) {
                            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            // Highlight the message briefly
                            element.classList.add('bg-primary/10');
                            setTimeout(() => element.classList.remove('bg-primary/10'), 2000);
                          }
                        }}
                      >
                        {citation.messageId.slice(-6)}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  variant="ghost"
                  onClick={handleReject}
                  disabled={isProcessing}
                  className="text-destructive hover:text-destructive"
                >
                  Reject
                </Button>
                <Button
                  variant="ghost"
                  onClick={startEditing}
                  disabled={isProcessing}
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Edit
                </Button>
                <Button
                  onClick={handleAccept}
                  disabled={isProcessing}
                >
                  {isProcessing ? 'Accepting...' : 'Accept'}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  return null;
}