'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, CalendarClock, Clock, Download, LogIn, LogOut, MapPin, Repeat2, Settings2, Upload, Users } from 'lucide-react';
import { useState } from 'react';
import type { ChangeEvent } from 'react';
import { api } from '@/lib/api';
import { downloadFile } from '@/lib/download';
import { getDeviceId, getDeviceInfo } from '@/lib/device';
import { captureFreshFix } from '@/lib/geo';
import { formatDate, formatTime } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useToast } from '@/components/ui/toaster';

interface TodayRow {
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    employeeCode: string;
    department: { name: string } | null;
  };
  status: string;
  punchIn: string | null;
  punchOut: string | null;
  workingMinutes: number | null;
  punchSource: string | null;
}

interface AttendanceRuleRow {
  id: string;
  name: string;
  lateMarkAfterMins: number;
  halfDayAfterMinutes: number;
  overtimeAfterMinutes: number;
  isDefault: boolean;
  remoteAttendanceAllowed: boolean;
  weekendWorkAllowed: boolean;
  compOffEligible: boolean;
  shift: { name: string } | null;
  location: { name: string } | null;
}

interface AttendanceCaptureSettingRow {
  id: string;
  mode: CaptureMode;
  enabled: boolean;
  requiresGps: boolean;
  requiresGeofence: boolean;
  notes: string | null;
  inherited?: boolean;
  tenantDefault?: {
    enabled: boolean;
    requiresGps: boolean;
    requiresGeofence: boolean;
    notes: string | null;
  };
}

interface LocationOption {
  id: string;
  name: string;
  city: string | null;
}

interface ShiftRow {
  id: string;
  name: string;
  type: string;
  startTime: string;
  endTime: string;
  gracePeriodMins: number;
  shiftAllowanceAmount: number | string;
  _count?: { shiftAssignments?: number };
}

interface RosterUploadRow {
  id: string;
  name: string;
  status: string;
  importedCount: number;
  failedCount: number;
}

interface ShiftSwapRow {
  id: string;
  status: string;
  requester: { firstName: string; lastName: string };
  requestedShift: { name: string };
  targetShift: { name: string };
}

interface CompOffRow {
  id: string;
  earnedDate: string;
  days: number;
  expiresAt: string | null;
  status: string;
  employee: { firstName: string; lastName: string };
}

interface HolidayRow {
  id: string;
  name: string;
  date: string;
  isOptional: boolean;
}

type CaptureMode = 'WEB' | 'MOBILE' | 'GPS' | 'QR' | 'BIOMETRIC' | 'MANUAL' | 'API_IMPORT';
type AttendanceTab = 'today' | 'capture' | 'rules' | 'shifts' | 'rosters' | 'imports' | 'finalize' | 'swaps' | 'compoff' | 'holidays';

const ATTENDANCE_TABS: Array<{ id: AttendanceTab; label: string; icon: typeof Clock }> = [
  { id: 'today', label: 'Today', icon: Clock },
  { id: 'capture', label: 'Capture', icon: Settings2 },
  { id: 'rules', label: 'Rules', icon: Settings2 },
  { id: 'shifts', label: 'Shifts', icon: CalendarClock },
  { id: 'rosters', label: 'Rosters', icon: Users },
  { id: 'imports', label: 'Imports', icon: Upload },
  { id: 'finalize', label: 'Finalize', icon: CalendarCheck },
  { id: 'swaps', label: 'Swaps', icon: Repeat2 },
  { id: 'compoff', label: 'Comp-off', icon: CalendarCheck },
  { id: 'holidays', label: 'Holidays', icon: CalendarClock },
];

const CAPTURE_MODE_LABELS: Record<CaptureMode, string> = {
  WEB: 'Web punch',
  MOBILE: 'Mobile punch',
  GPS: 'GPS punch',
  QR: 'QR punch',
  BIOMETRIC: 'Biometric import',
  MANUAL: 'Manual import',
  API_IMPORT: 'API import',
};

const CAPTURE_MODE_HELP: Record<CaptureMode, string> = {
  WEB: 'Desktop/browser check-in without mandatory GPS.',
  MOBILE: 'Mobile browser check-in when no GPS fix is sent.',
  GPS: 'Any browser/mobile check-in that sends coordinates.',
  QR: 'Location QR check-in. QR payload must match assigned location.',
  BIOMETRIC: 'HR import from biometric machines.',
  MANUAL: 'HR/manual corrections and upload rows.',
  API_IMPORT: 'External attendance system sync endpoint.',
};

function apiError(err: unknown): string {
  const e = err as { response?: { data?: { message?: string | string[] } } };
  const m = e?.response?.data?.message;
  return Array.isArray(m) ? m.join(', ') : (m ?? 'Something went wrong');
}

export default function AttendancePage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<AttendanceTab>('today');
  const [regularizeOpen, setRegularizeOpen] = useState(false);
  const [regDate, setRegDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [regIn, setRegIn] = useState('09:00');
  const [regOut, setRegOut] = useState('18:00');
  const [regReason, setRegReason] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['attendance', 'today'],
    queryFn: () => api.get('/attendance/today').then((r) => r.data),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['attendance'] });

  const checkIn = useMutation({
    mutationFn: async () => {
      const fix = await captureFreshFix();
      return api
        .post('/attendance/check-in', {
          deviceId: getDeviceId(),
          ...getDeviceInfo(),
          ...(fix
            ? { geoLat: fix.lat, geoLng: fix.lng, geoAccuracy: fix.accuracy, fixAt: fix.timestamp }
            : {}),
        })
        .then((r) => ({ record: r.data, coords: fix }));
    },
    onSuccess: ({ record, coords }) => {
      toast(
        `Checked in at ${formatTime(record.punchIn)}${coords ? ' with GPS location' : ''}${
          record.status === 'LATE' ? ' — marked late' : ''
        }`,
        record.status === 'LATE' ? 'info' : 'success',
      );
      refresh();
    },
    onError: (err) => toast(apiError(err), 'error'),
  });

  const checkOut = useMutation({
    mutationFn: () =>
      api.post('/attendance/check-out', { deviceId: getDeviceId() }).then((r) => r.data),
    onSuccess: (record) => {
      const h = Math.floor((record.workingMinutes ?? 0) / 60);
      const m = (record.workingMinutes ?? 0) % 60;
      toast(`Checked out at ${formatTime(record.punchOut)} — ${h}h ${m}m today`);
      refresh();
    },
    onError: (err) => toast(apiError(err), 'error'),
  });

  const regularize = useMutation({
    mutationFn: () =>
      api.post('/attendance/regularize', {
        date: regDate,
        punchIn: new Date(`${regDate}T${regIn}:00`).toISOString(),
        punchOut: new Date(`${regDate}T${regOut}:00`).toISOString(),
        reason: regReason,
      }),
    onSuccess: () => {
      toast('Attendance regularization submitted for approval');
      setRegularizeOpen(false);
      setRegReason('');
      refresh();
    },
    onError: (err) => toast(apiError(err), 'error'),
  });

  return (
    <div>
      <PageHeader
        title="Attendance"
        description="Live team attendance for today — check-in captures your GPS location"
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                downloadFile('/attendance/export', 'attendance.csv').catch(() =>
                  toast('Export failed — HR/Admin role required', 'error'),
                )
              }
            >
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setRegularizeOpen(true)}>
              <CalendarClock className="h-3.5 w-3.5" /> Regularize
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => checkOut.mutate()}
              disabled={checkOut.isPending}
            >
              <LogOut className="h-3.5 w-3.5" /> Check out
            </Button>
            <Button size="sm" onClick={() => checkIn.mutate()} disabled={checkIn.isPending}>
              <LogIn className="h-3.5 w-3.5" /> {checkIn.isPending ? 'Locating…' : 'Check in'}
            </Button>
          </>
        }
      />

      <div className="mb-5 grid gap-2 sm:grid-cols-3 xl:grid-cols-10">
        {ATTENDANCE_TABS.map((item) => {
          const Icon = item.icon;
          return (
            <Button
              key={item.id}
              type="button"
              variant={tab === item.id ? 'secondary' : 'outline'}
              className="h-auto justify-start gap-2 px-3 py-2"
              onClick={() => setTab(item.id)}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Button>
          );
        })}
      </div>

      {tab === 'today' && (isLoading || !data ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-96" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Present" value={data.summary.present} icon={Clock} />
            <StatCard label="Late" value={data.summary.late} />
            <StatCard label="On leave" value={data.summary.onLeave} />
            <StatCard label="Absent" value={data.summary.absent} />
          </div>
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>Employee</TH>
                  <TH>Department</TH>
                  <TH>Check in</TH>
                  <TH>Check out</TH>
                  <TH>Hours</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {data.rows.map((r: TodayRow) => (
                  <TR key={r.employee.id}>
                    <TD>
                      <div className="flex items-center gap-3">
                        <Avatar name={`${r.employee.firstName} ${r.employee.lastName}`} size="sm" />
                        <span>
                          <span className="block font-medium">
                            {r.employee.firstName} {r.employee.lastName}
                          </span>
                          <span className="block text-xs text-ink-muted">
                            {r.employee.employeeCode}
                          </span>
                        </span>
                      </div>
                    </TD>
                    <TD className="text-ink-muted">{r.employee.department?.name ?? '—'}</TD>
                    <TD>
                      <span className="flex items-center gap-1.5">
                        {formatTime(r.punchIn)}
                        {r.punchSource === 'GPS' && (
                          <MapPin className="h-3 w-3 text-primary-500" aria-label="GPS verified" />
                        )}
                      </span>
                    </TD>
                    <TD>{formatTime(r.punchOut)}</TD>
                    <TD className="text-ink-muted">
                      {r.workingMinutes
                        ? `${Math.floor(r.workingMinutes / 60)}h ${r.workingMinutes % 60}m`
                        : '—'}
                    </TD>
                    <TD>
                      <Badge variant={statusVariant(r.status)}>{r.status.replace(/_/g, ' ')}</Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        </div>
      ))}

      {tab === 'rules' && <AttendanceRulesTab />}
      {tab === 'capture' && <CaptureSettingsTab />}
      {tab === 'shifts' && <ShiftsTab />}
      {tab === 'rosters' && <RostersTab />}
      {tab === 'imports' && <AttendanceImportsTab />}
      {tab === 'finalize' && <AttendanceFinalizeTab />}
      {tab === 'swaps' && <ShiftSwapsTab />}
      {tab === 'compoff' && <CompOffTab />}
      {tab === 'holidays' && <HolidaysTab />}

      <Dialog open={regularizeOpen} onOpenChange={setRegularizeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Regularize attendance</DialogTitle>
            <DialogDescription>
              Correct a missed or wrong punch. Employee requests are routed for approval before
              the MANUAL record is applied.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Date</label>
              <Input type="date" value={regDate} onChange={(e) => setRegDate(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Check in</label>
                <Input type="time" value={regIn} onChange={(e) => setRegIn(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Check out</label>
                <Input type="time" value={regOut} onChange={(e) => setRegOut(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Reason</label>
              <Input
                placeholder="e.g. Forgot to punch out, client visit"
                value={regReason}
                onChange={(e) => setRegReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegularizeOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => regularize.mutate()}
              disabled={!regReason || regularize.isPending}
            >
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CaptureSettingsTab() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [scope, setScope] = useState('tenant');
  const locationId = scope === 'tenant' ? undefined : scope;
  const { data: locations } = useQuery({
    queryKey: ['locations'],
    queryFn: () => api.get('/locations').then((r) => r.data as LocationOption[]),
  });
  const { data, isLoading } = useQuery({
    queryKey: ['attendance', 'capture-settings', locationId ?? 'tenant'],
    queryFn: () =>
      api
        .get('/attendance/capture-settings', { params: locationId ? { locationId } : undefined })
        .then((r) => r.data as AttendanceCaptureSettingRow[]),
  });
  const update = useMutation({
    mutationFn: (payload: {
      mode: CaptureMode;
      enabled: boolean;
      requiresGps: boolean;
      requiresGeofence: boolean;
      notes?: string | null;
    }) => api.patch('/attendance/capture-settings', { ...payload, locationId }),
    onSuccess: () => {
      toast('Attendance capture setting saved');
      queryClient.invalidateQueries({ queryKey: ['attendance', 'capture-settings'] });
    },
    onError: (err) => toast(apiError(err), 'error'),
  });

  const patchSetting = (
    row: AttendanceCaptureSettingRow,
    patch: Partial<Pick<AttendanceCaptureSettingRow, 'enabled' | 'requiresGps' | 'requiresGeofence'>>,
  ) => {
    update.mutate({
      mode: row.mode,
      enabled: patch.enabled ?? row.enabled,
      requiresGps: patch.requiresGps ?? row.requiresGps,
      requiresGeofence: patch.requiresGeofence ?? row.requiresGeofence,
      notes: row.notes,
    });
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Attendance capture modes</h2>
            <p className="mt-1 text-sm text-ink-muted">
              Configure which punch/import methods are allowed. Location scope overrides tenant defaults.
            </p>
          </div>
          <Select className="w-64" value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="tenant">Tenant default</option>
            {locations?.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}{location.city ? ` · ${location.city}` : ''}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      <Card>
        {isLoading ? (
          <div className="space-y-2 p-4">
            {[...Array(7)].map((_, i) => <Skeleton key={i} className="h-12" />)}
          </div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Mode</TH>
                <TH>Enabled</TH>
                <TH>Require GPS</TH>
                <TH>Require geofence</TH>
                <TH>Scope</TH>
                <TH>Notes</TH>
              </TR>
            </THead>
            <TBody>
              {data?.map((row) => (
                <TR key={row.mode}>
                  <TD>
                    <span className="block font-medium">{CAPTURE_MODE_LABELS[row.mode]}</span>
                    <span className="block text-xs text-ink-muted">{CAPTURE_MODE_HELP[row.mode]}</span>
                  </TD>
                  <TD>
                    <input
                      type="checkbox"
                      checked={row.enabled}
                      disabled={update.isPending}
                      onChange={(e) => patchSetting(row, { enabled: e.target.checked })}
                      aria-label={`Enable ${CAPTURE_MODE_LABELS[row.mode]}`}
                    />
                  </TD>
                  <TD>
                    <input
                      type="checkbox"
                      checked={row.requiresGps}
                      disabled={row.mode === 'GPS' || update.isPending}
                      onChange={(e) => patchSetting(row, { requiresGps: e.target.checked })}
                      aria-label={`Require GPS for ${CAPTURE_MODE_LABELS[row.mode]}`}
                    />
                  </TD>
                  <TD>
                    <input
                      type="checkbox"
                      checked={row.requiresGeofence}
                      disabled={update.isPending}
                      onChange={(e) => patchSetting(row, { requiresGeofence: e.target.checked })}
                      aria-label={`Require geofence for ${CAPTURE_MODE_LABELS[row.mode]}`}
                    />
                  </TD>
                  <TD>
                    {row.inherited ? <Badge variant="info">Inherited</Badge> : <Badge variant="success">Configured</Badge>}
                  </TD>
                  <TD className="max-w-md text-sm text-ink-muted">{row.notes ?? row.tenantDefault?.notes ?? '—'}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function AttendanceRulesTab() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: rules } = useQuery({
    queryKey: ['attendance', 'rules'],
    queryFn: () => api.get('/attendance/rules').then((r) => r.data as AttendanceRuleRow[]),
  });
  const create = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post('/attendance/rules', payload),
    onSuccess: () => {
      toast('Attendance rule saved');
      queryClient.invalidateQueries({ queryKey: ['attendance', 'rules'] });
    },
    onError: (err) => toast(apiError(err), 'error'),
  });
  return (
    <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
      <Card className="p-4">
        <h2 className="text-sm font-semibold">Create rule</h2>
        <RuleForm onSubmit={(payload) => create.mutate(payload)} pending={create.isPending} />
      </Card>
      <Card>
        <Table>
          <THead><TR><TH>Rule</TH><TH>Scope</TH><TH>Late</TH><TH>Half day</TH><TH>Overtime</TH><TH>Flags</TH></TR></THead>
          <TBody>
            {rules?.map((r) => (
              <TR key={r.id}>
                <TD className="font-medium">{r.name}</TD>
                <TD className="text-ink-muted">{r.shift?.name ?? r.location?.name ?? (r.isDefault ? 'Default' : 'Tenant')}</TD>
                <TD>{r.lateMarkAfterMins}m</TD>
                <TD>{r.halfDayAfterMinutes}m</TD>
                <TD>{r.overtimeAfterMinutes}m</TD>
                <TD className="space-x-1">
                  {r.remoteAttendanceAllowed && <Badge variant="info">Remote</Badge>}
                  {r.weekendWorkAllowed && <Badge variant="warning">Weekend</Badge>}
                  {r.compOffEligible && <Badge variant="success">Comp-off</Badge>}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}

function RuleForm({ onSubmit, pending }: { onSubmit: (payload: Record<string, unknown>) => void; pending: boolean }) {
  const [form, setForm] = useState({ name: '', lateMarkAfterMins: '15', minWorkingMinutes: '480', halfDayAfterMinutes: '240', overtimeAfterMinutes: '540', isDefault: false, remoteAttendanceAllowed: false, weekendWorkAllowed: false, holidayWorkAllowed: false, compOffEligible: false });
  const set = (key: keyof typeof form) => (event: ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }));
  return (
    <form className="mt-3 space-y-3" onSubmit={(e) => { e.preventDefault(); onSubmit({ ...form, lateMarkAfterMins: Number(form.lateMarkAfterMins), minWorkingMinutes: Number(form.minWorkingMinutes), halfDayAfterMinutes: Number(form.halfDayAfterMinutes), overtimeAfterMinutes: Number(form.overtimeAfterMinutes) }); }}>
      <Input placeholder="Rule name" value={form.name} onChange={set('name')} required />
      <div className="grid grid-cols-2 gap-2">
        <Input type="number" placeholder="Late after min" value={form.lateMarkAfterMins} onChange={set('lateMarkAfterMins')} />
        <Input type="number" placeholder="Min work min" value={form.minWorkingMinutes} onChange={set('minWorkingMinutes')} />
        <Input type="number" placeholder="Half day min" value={form.halfDayAfterMinutes} onChange={set('halfDayAfterMinutes')} />
        <Input type="number" placeholder="Overtime min" value={form.overtimeAfterMinutes} onChange={set('overtimeAfterMinutes')} />
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs text-ink-muted">
        {(['isDefault', 'remoteAttendanceAllowed', 'weekendWorkAllowed', 'holidayWorkAllowed', 'compOffEligible'] as const).map((key) => (
          <label key={key} className="flex items-center gap-2"><input type="checkbox" checked={Boolean(form[key])} onChange={set(key)} />{key.replace(/([A-Z])/g, ' $1')}</label>
        ))}
      </div>
      <Button type="submit" disabled={pending || !form.name}>Save rule</Button>
    </form>
  );
}

function ShiftsTab() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: shifts } = useQuery({
    queryKey: ['attendance', 'shifts'],
    queryFn: () => api.get('/attendance/shifts').then((r) => r.data as ShiftRow[]),
  });
  const [form, setForm] = useState({ name: '', type: 'FIXED', startTime: '09:00', endTime: '18:00', gracePeriodMins: '15', shiftAllowanceAmount: '0' });
  const create = useMutation({
    mutationFn: () => api.post('/attendance/shifts', { ...form, gracePeriodMins: Number(form.gracePeriodMins), shiftAllowanceAmount: Number(form.shiftAllowanceAmount) }),
    onSuccess: () => { toast('Shift saved'); queryClient.invalidateQueries({ queryKey: ['attendance', 'shifts'] }); setForm((f) => ({ ...f, name: '' })); },
    onError: (err) => toast(apiError(err), 'error'),
  });
  return (
    <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
      <Card className="p-4">
        <h2 className="text-sm font-semibold">Create shift</h2>
        <form className="mt-3 space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <Input placeholder="Shift name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
          <div className="grid grid-cols-2 gap-2">
            <Select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}><option>FIXED</option><option>ROTATIONAL</option><option>FLEXIBLE</option><option>NIGHT</option><option>SPLIT</option></Select>
            <Input type="number" placeholder="Allowance" value={form.shiftAllowanceAmount} onChange={(e) => setForm((f) => ({ ...f, shiftAllowanceAmount: e.target.value }))} />
            <Input type="time" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} />
            <Input type="time" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} />
          </div>
          <Button type="submit" disabled={create.isPending || !form.name}>Save shift</Button>
        </form>
      </Card>
      <Card>
        <Table>
          <THead><TR><TH>Name</TH><TH>Type</TH><TH>Time</TH><TH>Grace</TH><TH>Allowance</TH><TH>Assigned</TH></TR></THead>
          <TBody>{shifts?.map((s) => <TR key={s.id}><TD className="font-medium">{s.name}</TD><TD>{s.type}</TD><TD>{s.startTime} - {s.endTime}</TD><TD>{s.gracePeriodMins}m</TD><TD>₹{s.shiftAllowanceAmount}</TD><TD>{s._count?.shiftAssignments ?? 0}</TD></TR>)}</TBody>
        </Table>
      </Card>
    </div>
  );
}

function RostersTab() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data } = useQuery({
    queryKey: ['attendance', 'rosters'],
    queryFn: () => api.get('/attendance/rosters').then((r) => r.data as RosterUploadRow[]),
  });
  const [name, setName] = useState('Roster upload');
  const [rows, setRows] = useState('EMP-0001,2026-07-15,Standard Shift\nEMP-0002,2026-07-15,Night Operations');
  const upload = useMutation({
    mutationFn: () => api.post('/attendance/rosters/import', { name, rows: rows.split('\n').filter(Boolean).map((line) => { const [employeeCode, date, shiftName] = line.split(',').map((x) => x.trim()); return { employeeCode, date, shiftName }; }) }),
    onSuccess: () => { toast('Roster imported'); queryClient.invalidateQueries({ queryKey: ['attendance', 'rosters'] }); },
    onError: (err) => toast(apiError(err), 'error'),
  });
  return <ImportListCard title="Roster import" name={name} setName={setName} rows={rows} setRows={setRows} action="Import roster" pending={upload.isPending} onSubmit={() => upload.mutate()} data={data} />;
}

function AttendanceImportsTab() {
  const toast = useToast();
  const [rows, setRows] = useState('EMP-0001,2026-07-15,2026-07-15T09:00:00.000Z,2026-07-15T18:30:00.000Z,PRESENT');
  const upload = useMutation({
    mutationFn: () => api.post('/attendance/import/manual', { rows: rows.split('\n').filter(Boolean).map((line) => { const [employeeCode, date, punchIn, punchOut, status] = line.split(',').map((x) => x.trim()); return { employeeCode, date, punchIn, punchOut, status }; }) }),
    onSuccess: (r) => toast(`Imported ${r.data.imported}, skipped ${r.data.skipped}`),
    onError: (err) => toast(apiError(err), 'error'),
  });
  return <Card className="p-4"><h2 className="text-sm font-semibold">Manual/API attendance upload</h2><textarea className="mt-3 min-h-40 w-full rounded-md border border-line p-3 text-sm" value={rows} onChange={(e) => setRows(e.target.value)} /><Button className="mt-3" onClick={() => upload.mutate()} disabled={upload.isPending}>Import attendance</Button></Card>;
}

function AttendanceFinalizeTab() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const { data, refetch } = useQuery({ queryKey: ['attendance', 'finalization', month], queryFn: () => api.get('/attendance/finalization/preview', { params: { month } }).then((r) => r.data) });
  const finalize = useMutation({
    mutationFn: () => api.post('/attendance/finalization/finalize', { month, notes: 'Finalized from admin UI' }),
    onSuccess: () => { toast('Attendance finalized and payroll inputs generated'); queryClient.invalidateQueries({ queryKey: ['attendance'] }); refetch(); },
    onError: (err) => toast(apiError(err), 'error'),
  });
  return <Card className="p-4"><div className="flex flex-wrap items-center gap-3"><Input type="month" className="w-48" value={month} onChange={(e) => setMonth(e.target.value)} /><Button onClick={() => refetch()}>Preview</Button><Button onClick={() => finalize.mutate()} disabled={finalize.isPending}>Finalize month</Button></div>{data && <div className="mt-4 grid gap-3 sm:grid-cols-4"><StatCard label="Employees" value={data.employees} /><StatCard label="Unfinalized" value={data.unfinalizedRecords} /><StatCard label="Missing estimate" value={data.missingRecordsEstimate} /><StatCard label="Overtime hrs" value={data.overtimeHours} /></div>}</Card>;
}

function ShiftSwapsTab() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data } = useQuery({
    queryKey: ['attendance', 'shift-swaps'],
    queryFn: () => api.get('/attendance/shift-swaps').then((r) => r.data as ShiftSwapRow[]),
  });
  const decide = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/attendance/shift-swaps/${id}`, { status }),
    onSuccess: () => { toast('Shift swap updated'); queryClient.invalidateQueries({ queryKey: ['attendance', 'shift-swaps'] }); },
    onError: (err) => toast(apiError(err), 'error'),
  });
  return <Card><Table><THead><TR><TH>Employee</TH><TH>Requested</TH><TH>Target</TH><TH>Status</TH><TH></TH></TR></THead><TBody>{data?.map((s) => <TR key={s.id}><TD>{s.requester.firstName} {s.requester.lastName}</TD><TD>{s.requestedShift.name}</TD><TD>{s.targetShift.name}</TD><TD><Badge variant={statusVariant(s.status)}>{s.status}</Badge></TD><TD>{s.status === 'REQUESTED' && <div className="flex gap-2"><Button size="sm" onClick={() => decide.mutate({ id: s.id, status: 'APPROVED' })}>Approve</Button><Button size="sm" variant="outline" onClick={() => decide.mutate({ id: s.id, status: 'REJECTED' })}>Reject</Button></div>}</TD></TR>)}</TBody></Table></Card>;
}

function CompOffTab() {
  const { data } = useQuery({
    queryKey: ['attendance', 'comp-offs'],
    queryFn: () => api.get('/attendance/comp-offs').then((r) => r.data as CompOffRow[]),
  });
  return <Card><Table><THead><TR><TH>Employee</TH><TH>Earned</TH><TH>Days</TH><TH>Expires</TH><TH>Status</TH></TR></THead><TBody>{data?.map((c) => <TR key={c.id}><TD>{c.employee.firstName} {c.employee.lastName}</TD><TD>{formatDate(c.earnedDate)}</TD><TD>{c.days}</TD><TD>{c.expiresAt ? formatDate(c.expiresAt) : '—'}</TD><TD><Badge variant={statusVariant(c.status)}>{c.status}</Badge></TD></TR>)}</TBody></Table></Card>;
}

function HolidaysTab() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const year = new Date().getFullYear();
  const { data } = useQuery({
    queryKey: ['attendance', 'holidays', year],
    queryFn: () => api.get(`/attendance/holidays?year=${year}`).then((r) => r.data as HolidayRow[]),
  });
  const [form, setForm] = useState({ name: '', date: `${year}-08-15`, isOptional: false });
  const create = useMutation({
    mutationFn: () => api.post('/attendance/holidays', form),
    onSuccess: () => { toast('Holiday saved'); queryClient.invalidateQueries({ queryKey: ['attendance', 'holidays'] }); setForm((f) => ({ ...f, name: '' })); },
    onError: (err) => toast(apiError(err), 'error'),
  });
  return <div className="grid gap-4 xl:grid-cols-[360px_1fr]"><Card className="p-4"><Input placeholder="Holiday name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /><Input className="mt-2" type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} /><label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isOptional} onChange={(e) => setForm((f) => ({ ...f, isOptional: e.target.checked }))} />Optional</label><Button className="mt-3" onClick={() => create.mutate()} disabled={!form.name || create.isPending}>Save holiday</Button></Card><Card><Table><THead><TR><TH>Name</TH><TH>Date</TH><TH>Type</TH></TR></THead><TBody>{data?.map((h) => <TR key={h.id}><TD>{h.name}</TD><TD>{formatDate(h.date)}</TD><TD>{h.isOptional ? 'Optional' : 'Mandatory'}</TD></TR>)}</TBody></Table></Card></div>;
}

function ImportListCard({ title, name, setName, rows, setRows, action, pending, onSubmit, data }: { title: string; name: string; setName: (v: string) => void; rows: string; setRows: (v: string) => void; action: string; pending: boolean; onSubmit: () => void; data?: RosterUploadRow[] }) {
  return <div className="grid gap-4 xl:grid-cols-[420px_1fr]"><Card className="p-4"><h2 className="text-sm font-semibold">{title}</h2><Input className="mt-3" value={name} onChange={(e) => setName(e.target.value)} /><textarea className="mt-3 min-h-40 w-full rounded-md border border-line p-3 text-sm" value={rows} onChange={(e) => setRows(e.target.value)} /><Button className="mt-3" onClick={onSubmit} disabled={pending}>{action}</Button></Card><Card><Table><THead><TR><TH>Name</TH><TH>Status</TH><TH>Imported</TH><TH>Failed</TH></TR></THead><TBody>{data?.map((r) => <TR key={r.id}><TD>{r.name}</TD><TD><Badge variant={statusVariant(r.status)}>{r.status}</Badge></TD><TD>{r.importedCount}</TD><TD>{r.failedCount}</TD></TR>)}</TBody></Table></Card></div>;
}
