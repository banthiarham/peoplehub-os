'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, CalendarDays, Check, ListChecks, Settings2, ShieldCheck, Users, X } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';
import { PeopleApplyLeaveDialog } from '@/components/forms/people-apply-leave-dialog';
import { Avatar } from '@/components/ui/avatar';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input, Select } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
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

function LeaveMetric({
  label,
  value,
  detail,
  icon: Icon,
  accent,
  dark = false,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: typeof CalendarDays;
  accent: string;
  dark?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border p-4',
        dark
          ? 'border-slate-900 bg-slate-950 text-white'
          : 'border-slate-200 bg-slate-50/70 text-slate-950',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn('text-[11px] font-semibold uppercase tracking-[0.16em]', dark ? 'text-slate-400' : 'text-slate-500')}>
            {label}
          </p>
          <p className="mt-2 truncate text-2xl font-semibold tracking-tight">{value}</p>
          <p className={cn('mt-1 truncate text-xs', dark ? 'text-slate-400' : 'text-slate-600')}>{detail}</p>
        </div>
        <span
          className={cn('inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm', dark && 'bg-white/10')}
          style={{ color: accent }}
        >
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
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
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-[0_14px_48px_-44px_rgba(15,23,42,0.5)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-2xl">
                Leave command center
              </h1>
              <p className="text-xs leading-5 text-slate-600">
                Review requests, policy rules, leave types, and team calendar from one payroll-aware queue.
              </p>
            </div>
          </div>
          <PeopleApplyLeaveDialog />
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <LeaveMetric
            label="Pending requests"
            value={stats?.pendingCount ?? '—'}
            detail="Waiting for manager or HR action"
            icon={ListChecks}
            accent="#F59E0B"
          />
          <LeaveMetric
            label="On leave today"
            value={stats?.onLeaveToday ?? '—'}
            detail="Currently away from work"
            icon={Users}
            accent="#0F766E"
          />
          <LeaveMetric
            label="Upcoming week"
            value={stats?.upcomingThisWeek ?? '—'}
            detail="Approved or pending absences"
            icon={CalendarClock}
            accent="#2563EB"
          />
          <LeaveMetric
            label="Request filter"
            value={status || 'All'}
            detail="Current approval queue scope"
            icon={ShieldCheck}
            accent="#0F766E"
            dark
          />
        </div>
      </section>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['requests', 'Requests', CalendarDays],
          ['types', 'Types', ListChecks],
          ['policies', 'Policies', Settings2],
          ['calendar', 'Calendar', CalendarDays],
        ].map(([id, label, Icon]) => (
          <Button
            key={id as string}
            type="button"
            variant="outline"
            className={cn(
              'h-auto justify-start gap-2 rounded-lg border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-600 shadow-none transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-800',
              tab === id && 'border-teal-200 bg-teal-50 text-teal-800 ring-1 ring-teal-100',
            )}
            onClick={() => setTab(id as typeof tab)}
          >
            <Icon className="h-4 w-4" /> <span>{label as string}</span>
          </Button>
        ))}
      </div>

      {tab === 'requests' && (
      <Card className="overflow-hidden border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Leave request queue</p>
            <p className="mt-1 text-sm text-slate-600">Approve, reject, or inspect leave requests by status.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={status === 'PENDING' ? 'warning' : 'outline'}>{status || 'ALL'} view</Badge>
            <Select className="w-44 rounded-lg" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="">All</option>
            </Select>
          </div>
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
                <TH className="w-[28%]">Employee</TH>
                <TH className="w-[12%]">Type</TH>
                <TH className="w-[20%]">Dates</TH>
                <TH className="w-[10%]">Days</TH>
                <TH className="w-[18%]">Reason</TH>
                <TH className="w-[12%]">Status</TH>
                <TH className="w-[8%]"></TH>
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
                          {r.employee.employeeCode} · {r.employee.department?.name ?? '—'}
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
                  <TD className="font-medium">{r.days}d</TD>
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
