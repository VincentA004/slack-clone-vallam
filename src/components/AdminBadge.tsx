import { Badge } from '@/components/ui/badge';
import { Shield } from 'lucide-react';

interface AdminBadgeProps {
  isAdmin: boolean;
  userRole: string | null;
  className?: string;
}

export function AdminBadge({ isAdmin, userRole, className }: AdminBadgeProps) {
  if (!isAdmin) return null;

  return (
    <Badge 
      variant="secondary" 
      className={`inline-flex items-center gap-1 bg-primary/10 text-primary hover:bg-primary/20 ${className}`}
    >
      <Shield className="w-3 h-3" />
      Admin
    </Badge>
  );
}