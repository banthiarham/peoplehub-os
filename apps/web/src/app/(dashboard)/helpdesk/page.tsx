'use client';

import { useQuery } from '@tanstack/react-query';
import { LifeBuoy, MessageSquare } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { OpsNewTicketDialog } from '@/components/forms/ops-new-ticket-dialog';
import { Avatar } from '@/components/ui/avatar';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

interface TicketRow {
  id: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  createdAt: string;
  assignedTo?: string | null;
  sla?: { dueAt: string; hours: number; breached: boolean };
  employee: { firstName: string; lastName: string };
  _count: { comments: number };
}

export default function HelpdeskPage() {
  const [status, setStatus] = useState('');
  const { data: stats } = useQuery({
    queryKey: ['helpdesk', 'stats'],
    queryFn: () => api.get('/helpdesk/stats').then((r) => r.data),
  });
  const { data } = useQuery({
    queryKey: ['helpdesk', 'tickets', status],
    queryFn: () =>
      api.get('/helpdesk/tickets', { params: { status: status || undefined, pageSize: 25 } }).then((r) => r.data),
  });

  return (
    <div>
      <PageHeader
        title="Helpdesk"
        description="Employee queries and requests"
        actions={<OpsNewTicketDialog />}
      />
      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Open" value={stats?.open ?? '—'} icon={LifeBuoy} />
        <StatCard label="In progress" value={stats?.inProgress ?? '—'} />
        <StatCard label="Resolved this week" value={stats?.resolvedThisWeek ?? '—'} />
        <StatCard
          label="Avg resolution"
          value={stats?.avgResolutionHours != null ? `${stats.avgResolutionHours}h` : '—'}
        />
        <StatCard label="SLA breached" value={stats?.slaBreached ?? '—'} />
        <StatCard label="Due soon" value={stats?.dueSoon ?? '—'} />
      </div>

      <Card>
        <div className="flex items-center gap-3 border-b border-line p-4">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="WAITING">Waiting</option>
            <option value="RESOLVED">Resolved</option>
            <option value="CLOSED">Closed</option>
          </Select>
        </div>
        {data?.data?.length ? (
          <Table>
            <THead>
              <TR>
                <TH>Ticket</TH>
                <TH>Raised by</TH>
                <TH>Category</TH>
                <TH>Priority</TH>
                <TH>Queue</TH>
                <TH>SLA</TH>
                <TH>Status</TH>
                <TH>Created</TH>
              </TR>
            </THead>
            <TBody>
              {data.data.map((t: TicketRow) => (
                <TR key={t.id}>
                  <TD>
                    <span className="flex items-center gap-2 font-medium">
                      {t.subject}
                      {t._count.comments > 0 && (
                        <span className="flex items-center gap-1 text-xs text-ink-faint">
                          <MessageSquare className="h-3 w-3" /> {t._count.comments}
                        </span>
                      )}
                    </span>
                  </TD>
                  <TD>
                    <div className="flex items-center gap-2">
                      <Avatar name={`${t.employee.firstName} ${t.employee.lastName}`} size="sm" />
                      <span className="text-ink-muted">
                        {t.employee.firstName} {t.employee.lastName}
                      </span>
                    </div>
                  </TD>
                  <TD>
                    <Badge variant="outline">{t.category}</Badge>
                  </TD>
                  <TD>
                    <Badge variant={t.priority === 'URGENT' || t.priority === 'HIGH' ? 'destructive' : 'outline'}>
                      {t.priority}
                    </Badge>
                  </TD>
                  <TD className="text-ink-muted">{t.assignedTo ?? 'Unassigned'}</TD>
                  <TD>
                    <Badge variant={t.sla?.breached ? 'destructive' : 'outline'}>
                      {t.sla?.breached ? 'Breached' : t.sla?.dueAt ? `Due ${formatDate(t.sla.dueAt)}` : '—'}
                    </Badge>
                  </TD>
                  <TD>
                    <Badge variant={statusVariant(t.status)}>{t.status.replace(/_/g, ' ')}</Badge>
                  </TD>
                  <TD className="text-ink-muted">{formatDate(t.createdAt)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyState icon={LifeBuoy} title="No tickets" />
        )}
      </Card>
    </div>
  );
}
