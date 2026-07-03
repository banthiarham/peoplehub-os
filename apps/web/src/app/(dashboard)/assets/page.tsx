'use client';

import { useQuery } from '@tanstack/react-query';
import { Laptop } from 'lucide-react';
import { api } from '@/lib/api';
import { formatINR } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

interface AssetRow {
  id: string;
  name: string;
  category: string;
  serialNumber: string | null;
  status: string;
  condition: string;
  purchaseCost: number | null;
  currentHolder: { firstName: string; lastName: string } | null;
}

export default function AssetsPage() {
  const { data: stats } = useQuery({
    queryKey: ['assets', 'stats'],
    queryFn: () => api.get('/assets/stats').then((r) => r.data),
  });
  const { data } = useQuery({
    queryKey: ['assets', 'list'],
    queryFn: () => api.get('/assets', { params: { pageSize: 30 } }).then((r) => r.data),
  });

  return (
    <div>
      <PageHeader title="Assets" description="Company hardware and assignments" />
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="Total assets" value={stats?.total ?? '—'} icon={Laptop} />
        <StatCard label="Assigned" value={stats?.assigned ?? '—'} />
        <StatCard label="Available" value={stats?.available ?? '—'} />
      </div>
      <Card>
        {data?.data?.length ? (
          <Table>
            <THead>
              <TR>
                <TH>Asset</TH>
                <TH>Category</TH>
                <TH>Serial</TH>
                <TH>Cost</TH>
                <TH>Holder</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {data.data.map((a: AssetRow) => (
                <TR key={a.id}>
                  <TD className="font-medium">{a.name}</TD>
                  <TD>
                    <Badge variant="outline">{a.category}</Badge>
                  </TD>
                  <TD className="text-ink-muted">{a.serialNumber ?? '—'}</TD>
                  <TD className="text-ink-muted">{a.purchaseCost ? formatINR(a.purchaseCost) : '—'}</TD>
                  <TD>
                    {a.currentHolder ? (
                      <div className="flex items-center gap-2">
                        <Avatar name={`${a.currentHolder.firstName} ${a.currentHolder.lastName}`} size="sm" />
                        <span>
                          {a.currentHolder.firstName} {a.currentHolder.lastName}
                        </span>
                      </div>
                    ) : (
                      <span className="text-ink-faint">—</span>
                    )}
                  </TD>
                  <TD>
                    <Badge variant={statusVariant(a.status)}>{a.status.replace(/_/g, ' ')}</Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyState icon={Laptop} title="No assets yet" />
        )}
      </Card>
    </div>
  );
}
