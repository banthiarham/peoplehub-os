'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Network, Search, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';

interface OrgNode {
  id: string;
  name: string;
  employeeCode: string;
  workEmail: string | null;
  managerId: string | null;
  directReportCount: number;
  department: { id: string; name: string } | null;
  designation: { name: string; grade: string | null } | null;
  location: { name: string } | null;
}

interface OrgChartResponse {
  nodes: OrgNode[];
  roots: OrgNode[];
  byDepartment: Array<{ id: string; name: string; employees: OrgNode[] }>;
}

export default function OrgChartPage() {
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');

  const { data: options } = useQuery({
    queryKey: ['employees', 'options'],
    queryFn: () => api.get('/employees/meta/options').then((r) => r.data),
  });
  const { data, isLoading } = useQuery<OrgChartResponse>({
    queryKey: ['org-chart', search, departmentId],
    queryFn: () =>
      api
        .get('/org-chart', {
          params: { search: search || undefined, departmentId: departmentId || undefined },
        })
        .then((r) => r.data),
  });

  const childrenByManager = useMemo(() => {
    const map = new Map<string, OrgNode[]>();
    for (const node of data?.nodes ?? []) {
      if (!node.managerId) continue;
      const existing = map.get(node.managerId) ?? [];
      existing.push(node);
      map.set(node.managerId, existing);
    }
    return map;
  }, [data]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Org Chart"
        description="Reporting lines, department groups and open-position-ready organization structure"
      />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <Input className="pl-9" placeholder="Search people…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            <option value="">All departments</option>
            {options?.departments?.map((department: { id: string; name: string }) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-96 lg:col-span-2" />
          <Skeleton className="h-96" />
        </div>
      ) : data?.nodes.length ? (
        <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Network className="h-4 w-4 text-primary-600" /> Manager tree
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.roots.map((root) => (
                <OrgTree key={root.id} node={root} childrenByManager={childrenByManager} depth={0} />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary-600" /> Department view
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {data.byDepartment.map((department) => (
                <div key={department.id}>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-semibold">{department.name}</p>
                    <Badge variant="outline">{department.employees.length}</Badge>
                  </div>
                  <div className="space-y-2">
                    {department.employees.slice(0, 8).map((employee) => (
                      <EmployeeLine key={employee.id} employee={employee} />
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      ) : (
        <EmptyState icon={Network} title="No reporting lines found" description="Try changing search or department filters." />
      )}
    </div>
  );
}

function OrgTree({
  node,
  childrenByManager,
  depth,
}: {
  node: OrgNode;
  childrenByManager: Map<string, OrgNode[]>;
  depth: number;
}) {
  const children = childrenByManager.get(node.id) ?? [];
  return (
    <div className="space-y-2">
      <div style={{ marginLeft: depth * 20 }} className="rounded-lg border border-line bg-white px-3 py-2">
        <EmployeeLine employee={node} />
      </div>
      {children.map((child) => (
        <OrgTree key={child.id} node={child} childrenByManager={childrenByManager} depth={depth + 1} />
      ))}
    </div>
  );
}

function EmployeeLine({ employee }: { employee: OrgNode }) {
  return (
    <Link href={`/employees/${employee.id}`} className="flex items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-3">
        <Avatar name={employee.name} size="sm" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium hover:text-primary-700">{employee.name}</span>
          <span className="block truncate text-xs text-ink-muted">
            {employee.designation?.name ?? '—'} · {employee.employeeCode}
          </span>
        </span>
      </span>
      <Badge variant={employee.directReportCount ? 'success' : 'outline'}>
        {employee.directReportCount}
      </Badge>
    </Link>
  );
}
