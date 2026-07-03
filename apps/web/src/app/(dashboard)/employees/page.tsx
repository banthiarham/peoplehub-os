'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { Search, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

interface EmployeeRow {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
  workEmail: string | null;
  status: string;
  employmentType: string;
  joiningDate: string | null;
  department: { name: string } | null;
  designation: { name: string } | null;
  location: { name: string } | null;
}

export default function EmployeesPage() {
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [page, setPage] = useState(1);

  const { data: options } = useQuery({
    queryKey: ['employees', 'options'],
    queryFn: () => api.get('/employees/meta/options').then((r) => r.data),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['employees', { search, departmentId, page }],
    queryFn: () =>
      api
        .get('/employees', { params: { search: search || undefined, departmentId: departmentId || undefined, page, pageSize: 15 } })
        .then((r) => r.data),
  });

  return (
    <div>
      <PageHeader
        title="Employees"
        description={data ? `${data.meta.total} people in the directory` : 'Directory'}
      />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <Input
              className="pl-9"
              placeholder="Search name, email or code…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <Select
            value={departmentId}
            onChange={(e) => {
              setDepartmentId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All departments</option>
            {options?.departments?.map((d: { id: string; name: string }) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </div>
        {isLoading ? (
          <div className="space-y-2 p-4">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : data?.data?.length ? (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Employee</TH>
                  <TH>Department</TH>
                  <TH>Designation</TH>
                  <TH>Location</TH>
                  <TH>Joined</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {data.data.map((e: EmployeeRow) => (
                  <TR key={e.id}>
                    <TD>
                      <Link href={`/employees/${e.id}`} className="flex items-center gap-3">
                        <Avatar name={`${e.firstName} ${e.lastName}`} />
                        <span>
                          <span className="block font-medium hover:text-primary-700">
                            {e.firstName} {e.lastName}
                          </span>
                          <span className="block text-xs text-ink-muted">
                            {e.employeeCode} · {e.workEmail ?? '—'}
                          </span>
                        </span>
                      </Link>
                    </TD>
                    <TD>{e.department?.name ?? '—'}</TD>
                    <TD>{e.designation?.name ?? '—'}</TD>
                    <TD className="text-ink-muted">{e.location?.name ?? '—'}</TD>
                    <TD className="text-ink-muted">{formatDate(e.joiningDate)}</TD>
                    <TD>
                      <Badge variant={statusVariant(e.status)}>{e.status.replace(/_/g, ' ')}</Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm">
              <span className="text-ink-muted">
                Page {data.meta.page} of {data.meta.totalPages}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= data.meta.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        ) : (
          <EmptyState icon={Users} title="No employees found" description="Try changing your filters." />
        )}
      </Card>
    </div>
  );
}
