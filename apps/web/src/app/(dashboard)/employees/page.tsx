'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import {
  BriefcaseBusiness,
  Building2,
  MapPin,
  Search,
  ShieldCheck,
  UserRoundCheck,
  Users,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';
import { PeopleAddEmployeeDialog } from '@/components/forms/people-add-employee-dialog';
import { Avatar } from '@/components/ui/avatar';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input, Select } from '@/components/ui/input';
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
  legalEntity: { name: string } | null;
  manager: { firstName: string; lastName: string } | null;
  roles?: string[];
}

interface EmployeesResponse {
  data: EmployeeRow[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

interface EmployeeOptions {
  departments?: Array<{ id: string; name: string }>;
  locations?: Array<{ id: string; name: string }>;
  legalEntities?: Array<{ id: string; name: string }>;
  managers?: Array<{ id: string; firstName: string; lastName: string }>;
  roles?: Array<{ id: string; name: string }>;
}

export default function EmployeesPage() {
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [legalEntityId, setLegalEntityId] = useState('');
  const [managerId, setManagerId] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);

  const { data: options } = useQuery({
    queryKey: ['employees', 'options'],
    queryFn: () => api.get('/employees/meta/options').then((r) => r.data as EmployeeOptions),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['employees', { search, departmentId, locationId, legalEntityId, managerId, role, page }],
    queryFn: () =>
      api
        .get('/employees', {
          params: {
            search: search || undefined,
            departmentId: departmentId || undefined,
            locationId: locationId || undefined,
            legalEntityId: legalEntityId || undefined,
            managerId: managerId || undefined,
            role: role || undefined,
            page,
            pageSize: 15,
          },
        })
        .then((r) => r.data as EmployeesResponse),
  });

  const resetPage = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setPage(1);
  };

  const rows = data?.data ?? [];
  const activeOnPage = rows.filter((employee) => ['ACTIVE', 'CONFIRMED', 'ON_PROBATION'].includes(employee.status)).length;
  const managersOnPage = rows.filter((employee) => rows.some((candidate) => candidate.manager && `${candidate.manager.firstName} ${candidate.manager.lastName}` === `${employee.firstName} ${employee.lastName}`)).length;
  const filtered = Boolean(search || departmentId || locationId || legalEntityId || managerId || role);
  const selectedScope = [
    departmentId && 'Department',
    locationId && 'Location',
    legalEntityId && 'Entity',
    managerId && 'Manager',
    role && 'Role',
  ].filter(Boolean).join(' + ') || 'Entire tenant';

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-[0_14px_48px_-44px_rgba(15,23,42,0.5)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-2xl">
                Employee directory
              </h1>
              <p className="text-xs leading-5 text-slate-600">
                Search, filter, and govern employee master records across entities, roles, managers, and locations.
              </p>
            </div>
          </div>
          <PeopleAddEmployeeDialog />
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <PeopleMetric
            label="Directory records"
            value={data?.meta.total ?? 0}
            detail={filtered ? 'Matching current filters' : 'Across active tenant scope'}
            icon={Users}
            accent="#0F766E"
          />
          <PeopleMetric
            label="Visible active"
            value={activeOnPage}
            detail={`${rows.length} people on this page`}
            icon={UserRoundCheck}
            accent="#2563EB"
          />
          <PeopleMetric
            label="Departments"
            value={options?.departments?.length ?? 0}
            detail="Configured org units"
            icon={Building2}
            accent="#F59E0B"
          />
          <PeopleMetric
            label="Locations"
            value={options?.locations?.length ?? 0}
            detail={`${options?.legalEntities?.length ?? 0} legal entities`}
            icon={MapPin}
            accent="#7C3AED"
          />
          <PeopleMetric
            label="Access scope"
            value={selectedScope}
            detail={`${options?.roles?.length ?? 0} roles available`}
            icon={ShieldCheck}
            accent="#0F766E"
            dark
          />
        </div>
      </section>

      <Card className="overflow-hidden border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Directory controls</p>
              <p className="mt-1 text-xs text-slate-500">Filter the source-of-truth employee list without leaving the page.</p>
            </div>
            <Badge variant={filtered ? 'info' : 'outline'}>{filtered ? 'Filtered view' : 'All people'}</Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.25fr_repeat(5,minmax(0,1fr))]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <Input
              id="employee-directory-search"
              name="employeeSearch"
              className="rounded-lg pl-9"
              placeholder="Search name, email or code…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <Select
            id="employee-department-filter"
            name="departmentId"
            className="w-full rounded-lg"
            value={departmentId}
            onChange={(e) => {
              resetPage(setDepartmentId)(e.target.value);
            }}
          >
            <option value="">All departments</option>
            {options?.departments?.map((d: { id: string; name: string }) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
          <Select
            id="employee-location-filter"
            name="locationId"
            className="w-full rounded-lg"
            value={locationId}
            onChange={(e) => resetPage(setLocationId)(e.target.value)}
          >
            <option value="">All locations</option>
            {options?.locations?.map((l: { id: string; name: string }) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
          <Select
            id="employee-legal-entity-filter"
            name="legalEntityId"
            className="w-full rounded-lg"
            value={legalEntityId}
            onChange={(e) => resetPage(setLegalEntityId)(e.target.value)}
          >
            <option value="">All legal entities</option>
            {options?.legalEntities?.map((le: { id: string; name: string }) => (
              <option key={le.id} value={le.id}>
                {le.name}
              </option>
            ))}
          </Select>
          <Select
            id="employee-manager-filter"
            name="managerId"
            className="w-full rounded-lg"
            value={managerId}
            onChange={(e) => resetPage(setManagerId)(e.target.value)}
          >
            <option value="">All managers</option>
            {options?.managers?.map((m: { id: string; firstName: string; lastName: string }) => (
              <option key={m.id} value={m.id}>
                {m.firstName} {m.lastName}
              </option>
            ))}
          </Select>
          <Select
            id="employee-role-filter"
            name="role"
            className="w-full rounded-lg"
            value={role}
            onChange={(e) => resetPage(setRole)(e.target.value)}
          >
            <option value="">All roles</option>
            {options?.roles?.map((r: { id: string; name: string }) => (
              <option key={r.id} value={r.name}>
                {r.name}
              </option>
            ))}
          </Select>
          </div>
        </div>
        {isLoading ? (
          <div className="space-y-2 p-4">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : data?.data?.length ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Employee master</p>
                <p className="mt-1 text-xs text-slate-500">
                  Page {data.meta.page} of {data.meta.totalPages} · {data.meta.total} records
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{managersOnPage} managers visible</Badge>
                <Badge variant="outline">{activeOnPage} active visible</Badge>
              </div>
            </div>
            <Table>
              <THead>
                <TR>
                  <TH>Employee</TH>
                  <TH className="w-36">Status</TH>
                  <TH>Job</TH>
                  <TH>Location</TH>
                  <TH>Manager</TH>
                  <TH>Access</TH>
                </TR>
              </THead>
              <TBody>
                {data.data.map((e: EmployeeRow) => (
                  <TR key={e.id} className="hover:bg-teal-50/35">
                    <TD>
                      <Link href={`/employees/${e.id}`} className="flex items-center gap-3">
                        <Avatar name={`${e.firstName} ${e.lastName}`} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-slate-950 hover:text-primary-700">
                            {e.firstName} {e.lastName}
                          </span>
                          <span className="block truncate text-xs text-ink-muted">
                            {e.employeeCode} · {e.workEmail ?? '—'}
                          </span>
                          <span className="block text-xs text-slate-400">Joined {formatDate(e.joiningDate)}</span>
                        </span>
                      </Link>
                    </TD>
                    <TD>
                      <Badge variant={statusVariant(e.status)}>{e.status.replace(/_/g, ' ')}</Badge>
                    </TD>
                    <TD>
                      <div className="flex min-w-0 items-start gap-2">
                        <BriefcaseBusiness className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-slate-700">{e.designation?.name ?? '—'}</span>
                          <span className="block truncate text-xs text-ink-muted">{e.department?.name ?? '—'}</span>
                        </span>
                      </div>
                    </TD>
                    <TD className="text-ink-muted">
                      <span className="block whitespace-nowrap">{e.location?.name ?? '—'}</span>
                      <span className="block max-w-40 truncate text-xs">{e.legalEntity?.name ?? '—'}</span>
                    </TD>
                    <TD className="text-ink-muted">
                      {e.manager ? `${e.manager.firstName} ${e.manager.lastName}` : '—'}
                    </TD>
                    <TD>
                      <span className="inline-flex max-w-36 items-center gap-1 truncate rounded-lg bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
                        {e.roles?.slice(0, 2).join(', ') || '—'}
                      </span>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <div className="flex items-center justify-between border-t border-line px-5 py-4 text-sm">
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

function PeopleMetric({
  label,
  value,
  detail,
  icon: Icon,
  accent,
  dark = false,
}: {
  label: string;
  value: React.ReactNode;
  detail: string;
  icon: typeof Users;
  accent: string;
  dark?: boolean;
}) {
  return (
    <div className={cn('rounded-lg border p-3', dark ? 'border-slate-900 bg-slate-950' : 'border-slate-200 bg-slate-50')}>
      <div className="flex items-center justify-between gap-3">
        <p className={cn('text-[10px] font-semibold uppercase tracking-[0.14em]', dark ? 'text-slate-400' : 'text-slate-500')}>{label}</p>
        <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg shadow-sm', dark ? 'bg-white/10' : 'bg-white')} style={{ color: dark ? '#99F6E4' : accent }}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className={cn('mt-2 truncate text-xl font-semibold tracking-tight', dark ? 'text-white' : 'text-slate-950')}>{value}</p>
      <p className={cn('mt-1 truncate text-xs', dark ? 'text-slate-400' : 'text-slate-500')}>{detail}</p>
    </div>
  );
}
