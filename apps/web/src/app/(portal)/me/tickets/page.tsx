'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LifeBuoy } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { OpsNewTicketDialog } from '@/components/forms/ops-new-ticket-dialog';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';

interface TicketRow {
  id: string;
  category: string;
  subject: string;
  description: string;
  priority: string;
  status: string;
  createdAt: string;
  _count?: { comments: number };
}

interface TicketComment {
  id: string;
  message: string;
  createdAt: string;
}

interface TicketDetail extends TicketRow {
  comments: TicketComment[];
}

function TicketReplies({ ticketId }: { ticketId: string }) {
  const { data: ticket, isLoading } = useQuery<TicketDetail>({
    queryKey: ['helpdesk', 'ticket', ticketId],
    queryFn: () => api.get(`/helpdesk/tickets/${ticketId}`).then((r) => r.data),
  });

  if (isLoading) return <Skeleton className="mt-3 h-12" />;

  const comments = ticket?.comments ?? [];
  if (!comments.length) {
    return <p className="mt-3 text-xs text-ink-muted">No replies yet.</p>;
  }

  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      {comments.map((comment) => (
        <div key={comment.id} className="rounded-md bg-surface-muted p-2 text-xs">
          <p className="text-ink-muted">{formatDate(comment.createdAt)}</p>
          <p className="mt-0.5 leading-relaxed">{comment.message}</p>
        </div>
      ))}
    </div>
  );
}

export default function MyTicketsPage() {
  const { data: tickets, isLoading } = useQuery<TicketRow[]>({
    queryKey: ['helpdesk', 'my-tickets'],
    queryFn: () => api.get('/helpdesk/tickets/me').then((r) => r.data),
  });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">My tickets</h1>
        <OpsNewTicketDialog />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : tickets?.length ? (
        <div className="space-y-2">
          {tickets.map((ticket) => {
            const isExpanded = expandedId === ticket.id;
            return (
              <Card key={ticket.id} className="p-4">
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : ticket.id)}
                  className="flex w-full items-start justify-between gap-3 text-left"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{ticket.subject}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-ink-muted">
                      {ticket.category} · {ticket.priority} · {formatDate(ticket.createdAt)}
                      {ticket._count?.comments ? ` · ${ticket._count.comments} comments` : ''}
                    </p>
                  </div>
                  <Badge variant={statusVariant(ticket.status)}>{ticket.status.replace(/_/g, ' ')}</Badge>
                </button>
                <p className="mt-3 text-xs leading-relaxed text-ink-muted">{ticket.description}</p>
                {isExpanded && <TicketReplies ticketId={ticket.id} />}
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={LifeBuoy}
          title="No tickets yet"
          description="Raise HR, payroll, IT or admin requests and track them here."
        />
      )}
    </div>
  );
}
