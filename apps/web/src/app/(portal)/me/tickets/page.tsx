'use client';

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

export default function MyTicketsPage() {
  const { data: tickets, isLoading } = useQuery<TicketRow[]>({
    queryKey: ['helpdesk', 'my-tickets'],
    queryFn: () => api.get('/helpdesk/tickets/me').then((r) => r.data),
  });

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
          {tickets.map((ticket) => (
            <Card key={ticket.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{ticket.subject}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-ink-muted">
                    {ticket.category} · {ticket.priority} · {formatDate(ticket.createdAt)}
                    {ticket._count?.comments ? ` · ${ticket._count.comments} comments` : ''}
                  </p>
                </div>
                <Badge variant={statusVariant(ticket.status)}>{ticket.status.replace(/_/g, ' ')}</Badge>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-ink-muted">{ticket.description}</p>
            </Card>
          ))}
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
