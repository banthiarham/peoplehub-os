'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Check, ListChecks, Settings2, X } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { PeopleApplyLeaveDialog } from '@/components/forms/people-apply-leave-dialog';
import { Avatar } from '@/components/ui/avatar';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

interface LeaveRow {
  id: string;
  fromDate: string;
  toDate: string;
  days: number;
  reason: string | null;
  status: string;
  employee: { firstName: string; lastName: string; employeeCode: string; department: { name: string } | null };
  leaveType: { name: string; code: string };
}

interface LeaveTypeRow {
  id: string;
  code: string;
  name: string;
  isPaid: boolean;
  requiresAttachment: boolean;
  isCarryForward: boolean;
  isEncashable: boolean;
  genderRestriction: string | null;
}

interface LeavePolicyRow {
  id: string;
  name: string;
  accrualType: string;
  accrualDays: number | string;
  minDuration: number | string;
  maxDuration: number | string | null;
  sandwichRule: boolean;
  requiresAttachment: boolean;
  leaveType: { id: string; code: string; name: string };
}

interface LeaveCalendarRow {
  id: string;
  fromDate: string;
  toDate: string;
  employee: { firstName: string; lastName: string };
  leaveType: { code: string };
}

interface LeaveCalendarResponse {
  requests: LeaveCalendarRow[];
}

export default function LeavePage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('PENDING');
  const [tab, setTab] = useState<'requests' | 'types' | 'policies' | 'calendar'>('requests');

  const { data: stats } = useQuery({
    queryKey: ['leave', 'stats'],
    queryFn: () => api.get('/leave/stats').then((r) => r.data),
  });
  const { data, isLoading } = useQuery({
    queryKey: ['leave', 'requests', status],
    queryFn: () =>
      api.get('/leave/requests', { params: { status: status || undefined, pageSize: 25 } }).then((r) => r.data),
  });

  const decide = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'reject' }) =>
      api.patch(`/leave/requests/${id}/${action}`, {}),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['leave'] }),
  });

  return (
    <div>
      <PageHeader
        title="Leave"
        description="Requests, balances and team calendar"
        actions={<PeopleApplyLeaveDialog />}
      />
      <div className="mb-5 grid gap-2 sm:grid-cols-4">
        {[
          ['requests', 'Requests', CalendarDays],
          ['types', 'Types', ListChecks],
          ['policies', 'Policies', Settings2],
          ['calendar', 'Calendar', CalendarDays],
        ].map(([id, label, Icon]) => (
          <Button key={id as string} variant={tab === id ? 'secondary' : 'outline'} onClick={() => setTab(id as typeof tab)}>
            <Icon className="h-4 w-4" /> {label as string}
          </Button>
        ))}
      </div>

      {tab === 'requests' && (
        <>
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="Pending requests" value={stats?.pendingCount ?? '—'} icon={CalendarDays} />
        <StatCard label="On leave today" value={stats?.onLeaveToday ?? '—'} />
        <StatCard label="Upcoming this week" value={stats?.upcomingThisWeek ?? '—'} />
      </div>

      <Card>
        <div className="flex items-center gap-3 border-b border-line p-4">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="">All</option>
          </Select>
        </div>
        {isLoading ? (
          <div className="space-y-2 p-4">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : data?.data?.length ? (
          <Table>
            <THead>
              <TR>
                <TH>Employee</TH>
                <TH>Type</TH>
                <TH>Dates</TH>
                <TH>Days</TH>
                <TH>Reason</TH>
                <TH>Status</TH>
                <TH></TH>
              </TR>
            </THead>
            <TBody>
              {data.data.map((r: LeaveRow) => (
                <TR key={r.id}>
                  <TD>
                    <div className="flex items-center gap-3">
                      <Avatar name={`${r.employee.firstName} ${r.employee.lastName}`} size="sm" />
                      <span>
                        <span className="block font-medium">
                          {r.employee.firstName} {r.employee.lastName}
                        </span>
                        <span className="block text-xs text-ink-muted">
                          {r.employee.department?.name ?? '—'}
                        </span>
                      </span>
                    </div>
                  </TD>
                  <TD>
                    <Badge variant="violet">{r.leaveType.code}</Badge>
                  </TD>
                  <TD className="text-ink-muted">
                    {formatDate(r.fromDate)} → {formatDate(r.toDate)}
                  </TD>
                  <TD className="font-medium">{r.days}</TD>
                  <TD className="max-w-48 truncate text-ink-muted">{r.reason ?? '—'}</TD>
                  <TD>
                    <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                  </TD>
                  <TD>
                    {r.status === 'PENDING' && (
                      <div className="flex gap-1.5">
                        <Button
                          size="icon"
                          variant="secondary"
                          className="h-7 w-7"
                          onClick={() => decide.mutate({ id: r.id, action: 'approve' })}
                          aria-label="Approve"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-7 w-7 text-danger"
                          onClick={() => decide.mutate({ id: r.id, action: 'reject' })}
                          aria-label="Reject"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyState icon={CalendarDays} title="No leave requests" description="Nothing here for this filter." />
        )}
      </Card>
        </>
      )}
      {tab === 'types' && <LeaveTypesTab />}
      {tab === 'policies' && <LeavePoliciesTab />}
      {tab === 'calendar' && <LeaveCalendarTab />}
    </div>
  );
}

function LeaveTypesTab() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: '', code: '', isPaid: true, requiresAttachment: false, isCarryForward: false, isEncashable: false, allowNegativeBalance: false, genderRestriction: '' });
  const { data } = useQuery({
    queryKey: ['leave', 'types'],
    queryFn: () => api.get('/leave/types').then((r) => r.data as LeaveTypeRow[]),
  });
  const create = useMutation({
    mutationFn: () => api.post('/leave/types', { ...form, code: form.code.toUpperCase(), genderRestriction: form.genderRestriction || undefined }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['leave', 'types'] }); setForm((f) => ({ ...f, name: '', code: '' })); },
  });
  return <div className="grid gap-4 xl:grid-cols-[380px_1fr]"><Card className="p-4"><h2 className="text-sm font-semibold">Create leave type</h2><Input className="mt-3" placeholder="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /><Input className="mt-2" placeholder="Code" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} /><Select className="mt-2" value={form.genderRestriction} onChange={(e) => setForm((f) => ({ ...f, genderRestriction: e.target.value }))}><option value="">All genders</option><option value="MALE">Male</option><option value="FEMALE">Female</option></Select><div className="mt-3 grid grid-cols-2 gap-2 text-xs text-ink-muted">{(['isPaid','requiresAttachment','isCarryForward','isEncashable','allowNegativeBalance'] as const).map((k) => <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.checked }))} />{k.replace(/([A-Z])/g, ' $1')}</label>)}</div><Button className="mt-3" onClick={() => create.mutate()} disabled={!form.name || !form.code || create.isPending}>Save type</Button></Card><Card><Table><THead><TR><TH>Code</TH><TH>Name</TH><TH>Paid</TH><TH>Proof</TH><TH>Rules</TH></TR></THead><TBody>{data?.map((t) => <TR key={t.id}><TD><Badge variant="violet">{t.code}</Badge></TD><TD>{t.name}</TD><TD>{t.isPaid ? 'Yes' : 'No'}</TD><TD>{t.requiresAttachment ? 'Required' : 'No'}</TD><TD>{t.isCarryForward && 'Carry forward'} {t.isEncashable && 'Encashable'} {t.genderRestriction ?? ''}</TD></TR>)}</TBody></Table></Card></div>;
}

function LeavePoliciesTab() {
  const queryClient = useQueryClient();
  const { data: types } = useQuery({
    queryKey: ['leave', 'types'],
    queryFn: () => api.get('/leave/types').then((r) => r.data as LeaveTypeRow[]),
  });
  const { data: policies } = useQuery({
    queryKey: ['leave', 'policies'],
    queryFn: () => api.get('/leave/policies').then((r) => r.data as LeavePolicyRow[]),
  });
  const [form, setForm] = useState({ name: '', leaveTypeId: '', accrualType: 'MONTHLY', accrualDays: '1.5', minDuration: '0.5', maxDuration: '', probationAllowed: false, noticePeriodAllowed: false, sandwichRule: false, requiresAttachment: false, allowNegativeBalance: false });
  const create = useMutation({
    mutationFn: () => api.post('/leave/policies', { ...form, accrualDays: Number(form.accrualDays), minDuration: Number(form.minDuration), maxDuration: form.maxDuration ? Number(form.maxDuration) : undefined }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['leave', 'policies'] }); setForm((f) => ({ ...f, name: '' })); },
  });
  return <div className="grid gap-4 xl:grid-cols-[420px_1fr]"><Card className="p-4"><h2 className="text-sm font-semibold">Create policy</h2><Input className="mt-3" placeholder="Policy name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /><Select className="mt-2" value={form.leaveTypeId} onChange={(e) => setForm((f) => ({ ...f, leaveTypeId: e.target.value }))}><option value="">Leave type</option>{types?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select><div className="mt-2 grid grid-cols-2 gap-2"><Select value={form.accrualType} onChange={(e) => setForm((f) => ({ ...f, accrualType: e.target.value }))}><option>MONTHLY</option><option>YEARLY</option><option>UPFRONT</option></Select><Input type="number" step="0.5" value={form.accrualDays} onChange={(e) => setForm((f) => ({ ...f, accrualDays: e.target.value }))} /><Input type="number" step="0.5" value={form.minDuration} onChange={(e) => setForm((f) => ({ ...f, minDuration: e.target.value }))} /><Input type="number" step="0.5" placeholder="Max duration" value={form.maxDuration} onChange={(e) => setForm((f) => ({ ...f, maxDuration: e.target.value }))} /></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs text-ink-muted">{(['probationAllowed','noticePeriodAllowed','sandwichRule','requiresAttachment','allowNegativeBalance'] as const).map((k) => <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.checked }))} />{k.replace(/([A-Z])/g, ' $1')}</label>)}</div><Button className="mt-3" onClick={() => create.mutate()} disabled={!form.name || !form.leaveTypeId || create.isPending}>Save policy</Button></Card><Card><Table><THead><TR><TH>Policy</TH><TH>Type</TH><TH>Accrual</TH><TH>Duration</TH><TH>Restrictions</TH></TR></THead><TBody>{policies?.map((p) => <TR key={p.id}><TD>{p.name}</TD><TD>{p.leaveType.code}</TD><TD>{p.accrualType} · {p.accrualDays}</TD><TD>{p.minDuration} - {p.maxDuration ?? '∞'}</TD><TD>{p.sandwichRule && <Badge variant="warning">Sandwich</Badge>} {p.requiresAttachment && <Badge variant="info">Proof</Badge>}</TD></TR>)}</TBody></Table></Card></div>;
}

function LeaveCalendarTab() {
  const month = new Date().toISOString().slice(0, 7);
  const { data } = useQuery({
    queryKey: ['leave', 'calendar', month],
    queryFn: () => api.get(`/leave/calendar?month=${month}`).then((r) => r.data as LeaveCalendarResponse),
  });
  return <Card><Table><THead><TR><TH>Employee</TH><TH>Type</TH><TH>Dates</TH></TR></THead><TBody>{data?.requests?.map((r) => <TR key={r.id}><TD>{r.employee.firstName} {r.employee.lastName}</TD><TD><Badge variant="violet">{r.leaveType.code}</Badge></TD><TD>{formatDate(r.fromDate)} → {formatDate(r.toDate)}</TD></TR>)}</TBody></Table></Card>;
}
