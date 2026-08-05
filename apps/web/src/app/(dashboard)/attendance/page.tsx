'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  Clock,
  Download,
  FileUp,
  Fingerprint,
  LogIn,
  LogOut,
  MapPin,
  Pencil,
  Plus,
  RadioTower,
  Repeat2,
  Settings2,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import type { ChangeEvent } from 'react';
import { api } from '@/lib/api';
import { downloadFile } from '@/lib/download';
import { getDeviceId, getDeviceInfo } from '@/lib/device';
import { asArray, employeeLabel, employeeOptionsFrom, type EmployeeOption } from '@/lib/options';
import {
  ATTENDANCE_IMPORT_TEMPLATE,
  ATTENDANCE_STATUS_OPTIONS,
  SUPPORTED_DATE_FORMATS_HELP,
  combineDateTime,
  newAttendanceImportRow,
  normalizeImportDate,
  parseAttendanceCsv,
  toAttendanceImportPayload,
  type AttendanceImportRow,
} from '@/lib/attendance-import';
import { captureFreshFix } from '@/lib/geo';
import { cn, formatDate, formatTime } from '@/lib/utils';
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
import { EmptyState } from '@/components/ui/empty-state';
import { Input, Select } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useToast } from '@/components/ui/toaster';

interface TodayRow {
  id: string | null;
  date: string;
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
  weeklyOffDays: number[];
  isDefault: boolean;
  /** Employees whose effective shift today is this one, via the shared resolver. */
  activeAssignments?: number;
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

interface ShiftAssignmentRow {
  id: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  source: string;
  status: 'ACTIVE' | 'SCHEDULED' | 'EXPIRED';
  locationIsOverride: boolean;
  overlappingAssignmentIds: string[];
  shift: { id: string; name: string; startTime: string; endTime: string } | null;
  effectiveLocation: { id: string; name: string } | null;
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    employeeCode: string;
    /** The employee's permanent/default location, never changed by an assignment. */
    location: { id: string; name: string } | null;
  };
}

interface EffectiveShift {
  source: string;
  date: string;
  locationIsOverride: boolean;
  employee: { id: string; firstName: string; lastName: string; employeeCode: string };
  shift: { id: string; name: string; startTime: string; endTime: string } | null;
  effectiveLocation: { id: string; name: string } | null;
  defaultLocation: { id: string; name: string } | null;
}

type CaptureMode = 'WEB' | 'MOBILE' | 'GPS' | 'QR' | 'BIOMETRIC' | 'MANUAL' | 'API_IMPORT';
type AttendanceTab =
  | 'today'
  | 'punches'
  | 'capture'
  | 'rules'
  | 'shifts'
  | 'rosters'
  | 'imports'
  | 'finalize'
  | 'swaps'
  | 'compoff'
  | 'holidays';

const ATTENDANCE_TABS: Array<{ id: AttendanceTab; label: string; icon: typeof Clock }> = [
  { id: 'today', label: 'Attendance', icon: Clock },
  { id: 'punches', label: 'Punch history', icon: MapPin },
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

/** Today, so a sample roster row is never dated in the past. */
const ROSTER_SAMPLE_DATE = new Date().toISOString().slice(0, 10);

function rosterTemplate(sampleLines: string[]): string {
  return [
    '# employeeCode,date,shiftName — date accepts YYYY-MM-DD or an ISO 8601 date-time',
    ...sampleLines,
    '',
  ].join('\n');
}

function formatMinutes(minutes: number | null | undefined) {
  if (!minutes) return '—';
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function formatDateInput(value: string | null | undefined) {
  if (!value) return new Date().toISOString().slice(0, 10);
  return value.slice(0, 10);
}

function formatTimeInput(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 5);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
}

function CompactAttendanceMetric({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  tone?: 'default' | 'warning';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-semibold',
        tone === 'warning'
          ? 'border-amber-200 bg-amber-50 text-amber-800'
          : 'border-slate-200 bg-slate-50 text-slate-700',
      )}
    >
      <span className="font-medium text-slate-500">{label}</span>
      <span className="text-slate-950">{value}</span>
    </span>
  );
}

function AttendanceMetric({
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
  icon: typeof Clock;
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
          <p className="mt-2 break-words text-2xl font-semibold tracking-tight">{value}</p>
          <p className={cn('mt-1 text-xs leading-4', dark ? 'text-slate-400' : 'text-slate-600')}>{detail}</p>
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

/**
 * Employee dropdown options, always as an array.
 *
 * `['employees', 'options']` is a shared React Query cache key: the employees,
 * employee detail and org pages all cache the *whole* options object under it.
 * Caching only `data.managers` here meant whichever page mounted first decided
 * the cached shape, so arriving from one of those pages handed this page an
 * object and `.map()` threw. The query now caches the same object everyone else
 * does, and `employeeOptionsFrom` selects the array from either shape.
 */
function useEmployeeOptions(): EmployeeOption[] {
  const { data } = useQuery({
    queryKey: ['employees', 'options'],
    queryFn: () => api.get('/employees/meta/options').then((r) => r.data),
  });
  return employeeOptionsFrom(data);
}

/** Work locations, always as an array. */
function useLocationOptions(): LocationOption[] {
  const { data } = useQuery({
    queryKey: ['locations'],
    queryFn: () => api.get('/locations').then((r) => r.data),
  });
  return asArray<LocationOption>(data);
}

function apiError(err: unknown): string {
  const e = err as { response?: { data?: { message?: string | string[] } } };
  const m = e?.response?.data?.message;
  return Array.isArray(m) ? m.join(', ') : (m ?? 'Something went wrong');
}

export default function AttendancePage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const todayDate = new Date().toISOString().slice(0, 10);
  const [tab, setTab] = useState<AttendanceTab>('today');
  const [selectedDate, setSelectedDate] = useState(todayDate);
  const displayDate =
  selectedDate === todayDate
    ? 'today'
    : new Date(selectedDate).toLocaleDateString('en-GB');
  const [regularizeOpen, setRegularizeOpen] = useState(false);
  const [regDate, setRegDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [regIn, setRegIn] = useState('09:00');
  const [regOut, setRegOut] = useState('18:00');
  const [regReason, setRegReason] = useState('');
  const [editingRecord, setEditingRecord] = useState<TodayRow | null>(null);
  const [editForm, setEditForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    punchIn: '',
    punchOut: '',
    status: 'PRESENT',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['attendance', 'today', selectedDate],
    queryFn: () =>
      api
        .get('/attendance/today', {
          params: selectedDate === todayDate ? undefined : { date: selectedDate },
        })
        .then((r) => r.data),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['attendance'] });
  const rows = (data?.rows ?? []) as TodayRow[];
  const summary = data?.summary ?? { present: 0, late: 0, onLeave: 0, absent: 0 };
  const totalPeople = rows.length || summary.present + summary.late + summary.onLeave + summary.absent;
  const workingRows = rows.filter((row) => row.punchIn && !row.punchOut).length;
  const gpsVerifiedRows = rows.filter((row) => row.punchSource === 'GPS').length;
  const exceptionRows = summary.late + summary.absent;
  const presentShare = totalPeople ? Math.round(((summary.present + summary.late) / totalPeople) * 100) : 0;

  const checkIn = useMutation({
    mutationFn: async () => {
      const { fix, reason } = await captureFreshFix();
      return api
        .post('/attendance/check-in', {
          deviceId: getDeviceId(),
          ...getDeviceInfo(),
          ...(fix
            ? { geoLat: fix.lat, geoLng: fix.lng, geoAccuracy: fix.accuracy, fixAt: fix.timestamp }
            : reason
              ? { geoErrorReason: reason }
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

  const openEditRecord = (row: TodayRow) => {
    setEditingRecord(row);
    setEditForm({
      date: formatDateInput(row.date),
      punchIn: formatTimeInput(row.punchIn),
      punchOut: formatTimeInput(row.punchOut),
      status: row.status,
    });
  };

  const updateRecord = useMutation({
    mutationFn: () => {
      if (!editingRecord?.id) throw new Error('No attendance record selected');
      return api.patch(`/attendance/records/${editingRecord.id}`, {
        date: editForm.date,
        punchIn: combineDateTime(editForm.date, editForm.punchIn),
        punchOut: combineDateTime(editForm.date, editForm.punchOut),
        status: editForm.status,
      });
    },
    onSuccess: () => {
      toast('Attendance record updated');
      setEditingRecord(null);
      refresh();
    },
    onError: (err) => toast(apiError(err), 'error'),
  });

  const deleteRecord = useMutation({
    mutationFn: (id: string) => api.delete(`/attendance/records/${id}`),
    onSuccess: () => {
      toast('Attendance record deleted');
      refresh();
    },
    onError: (err) => toast(apiError(err), 'error'),
  });

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-[0_14px_48px_-44px_rgba(15,23,42,0.5)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-2xl">
                Attendance command
              </h1>
              <p className="text-xs leading-5 text-slate-600">
                Review punches and exceptions by date, capture modes, rosters, and payroll-ready
                finalization.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
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
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <AttendanceMetric
            label="People tracked"
            value={isLoading ? '—' : totalPeople}
            detail={`${summary.present + summary.late} marked present ${selectedDate === todayDate ? displayDate : `on ${displayDate}`}`}
            icon={Users}
            accent="#0F766E"
          />
          <AttendanceMetric
            label="Presence rate"
            value={isLoading ? '—' : `${presentShare}%`}
            detail={`${summary.onLeave} leave · ${summary.absent} absent`}
            icon={CheckCircle2}
            accent="#2563EB"
          />
          <AttendanceMetric
            label="Exceptions"
            value={isLoading ? '—' : exceptionRows}
            detail={`${summary.late} late marks ${selectedDate === todayDate ? displayDate : `on ${displayDate}`}`}
            icon={AlertTriangle}
            accent="#F59E0B"
          />
          <AttendanceMetric
            label="Open sessions"
            value={isLoading ? '—' : workingRows}
            detail={`${gpsVerifiedRows} GPS verified punches ${selectedDate === todayDate ? displayDate : `on ${displayDate}`}`}
            icon={RadioTower}
            accent="#7C3AED"
          />
          <AttendanceMetric
            label="Payroll sync"
            value="Finalize"
            detail="Payable days + LOP"
            icon={Fingerprint}
            accent="#0F766E"
            dark
          />
        </div>
      </section>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5 xl:grid-cols-10">
        {ATTENDANCE_TABS.map((item) => {
          const Icon = item.icon;
          return (
            <Button
              key={item.id}
              type="button"
              variant="outline"
              className={cn(
                'h-auto justify-start gap-2 rounded-lg border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-600 shadow-none transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-800',
                tab === item.id && 'border-teal-200 bg-teal-50 text-teal-800 ring-1 ring-teal-100',
              )}
              onClick={() => setTab(item.id)}
            >
              <Icon className="h-4 w-4" />
              <span className="whitespace-nowrap">{item.label}</span>
            </Button>
          );
        })}
      </div>

      {tab === 'today' &&
        (isLoading || !data ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
            <Skeleton className="h-96" />
          </div>
        ) : (
          <div>
            <Card className="overflow-hidden border-slate-200 bg-white">
              <div className="border-b border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Attendance ledger
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Punch state, hours, source, and exception status by date.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      type="date"
                      className="w-40"
                      value={selectedDate}
                      max={todayDate}
                      onChange={(event) => setSelectedDate(event.target.value)}
                      aria-label="Attendance date"
                    />
                    <Badge variant={exceptionRows ? 'warning' : 'success'}>
                      {exceptionRows ? 'Review needed' : 'Clean day'}
                    </Badge>
                    <Badge variant="outline">{rows.length} rows</Badge>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-xs">
                  <CompactAttendanceMetric label={selectedDate} value={`${presentShare}%`} />
                  <CompactAttendanceMetric label="Present" value={summary.present} />
                  <CompactAttendanceMetric
                    label="Late"
                    value={summary.late}
                    tone={summary.late ? 'warning' : 'default'}
                  />
                  <CompactAttendanceMetric label="On leave" value={summary.onLeave} />
                  <CompactAttendanceMetric
                    label="Absent"
                    value={summary.absent}
                    tone={summary.absent ? 'warning' : 'default'}
                  />
                  <CompactAttendanceMetric label="Working" value={workingRows} />
                  <CompactAttendanceMetric label="GPS" value={gpsVerifiedRows} />
                </div>
              </div>
              <Table>
                <THead>
                  <TR>
                    <TH className="w-[34%]">Employee</TH>
                    <TH className="w-[16%]">Status</TH>
                    <TH className="w-[16%]">Check in</TH>
                    <TH className="w-[16%]">Check out</TH>
                    <TH className="w-[12%]">Hours</TH>
                    <TH className="w-[6%]">Source</TH>
                    <TH className="w-[8%]"></TH>
                  </TR>
                </THead>
                <TBody>
                  {rows.map((r: TodayRow) => (
                    <TR key={r.employee.id}>
                      <TD>
                        <div className="flex items-center gap-3">
                          <Avatar
                            name={`${r.employee.firstName} ${r.employee.lastName}`}
                            size="sm"
                          />
                          <span>
                            <span className="block font-medium">
                              {r.employee.firstName} {r.employee.lastName}
                            </span>
                            <span className="block text-xs text-ink-muted">
                              {r.employee.employeeCode} ·{' '}
                              {r.employee.department?.name ?? 'No department'}
                            </span>
                          </span>
                        </div>
                      </TD>
                      <TD>
                        <Badge
                          variant={r.status === 'WEEKEND' ? 'violet' : statusVariant(r.status)}
                        >
                          {r.status.replace(/_/g, ' ')}
                        </Badge>
                      </TD>
                      <TD>
                        <span className="whitespace-nowrap font-medium text-slate-900">
                          {formatTime(r.punchIn)}
                        </span>
                      </TD>
                      <TD>
                        <span className="whitespace-nowrap text-slate-600">
                          {formatTime(r.punchOut)}
                        </span>
                      </TD>
                      <TD className="whitespace-nowrap text-slate-600">
                        {formatMinutes(r.workingMinutes)}
                      </TD>
                      <TD>
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                          {r.punchSource === 'GPS' && (
                            <MapPin
                              className="h-3.5 w-3.5 text-teal-700"
                              aria-label="GPS verified"
                            />
                          )}
                          {r.punchSource ?? '—'}
                        </span>
                      </TD>
                      <TD>
                        {r.id ? (
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label="Edit attendance record"
                              onClick={() => openEditRecord(r)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label="Delete attendance record"
                              onClick={() => {
                                if (window.confirm('Delete this attendance record?'))
                                  deleteRecord.mutate(r.id!);
                              }}
                              disabled={deleteRecord.isPending}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : null}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>
          </div>
        ))}

      {tab === 'punches' && <PunchHistoryTab />}
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

      <Dialog open={Boolean(editingRecord)} onOpenChange={(open) => !open && setEditingRecord(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit attendance record</DialogTitle>
            <DialogDescription>
              Update unfinalized attendance before monthly finalization sends it to payroll.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Date</label>
              <Input
                type="date"
                value={editForm.date}
                onChange={(e) => setEditForm((form) => ({ ...form, date: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Check in</label>
                <Input
                  type="time"
                  value={editForm.punchIn}
                  onChange={(e) => setEditForm((form) => ({ ...form, punchIn: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Check out</label>
                <Input
                  type="time"
                  value={editForm.punchOut}
                  onChange={(e) => setEditForm((form) => ({ ...form, punchOut: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Status</label>
              <Select
                value={editForm.status}
                onChange={(e) => setEditForm((form) => ({ ...form, status: e.target.value }))}
              >
                {ATTENDANCE_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>
                ))}
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingRecord(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => updateRecord.mutate()}
              disabled={!editForm.date || updateRecord.isPending}
            >
              Save changes
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
  const { data: shiftsData } = useQuery({
    queryKey: ['attendance', 'shifts'],
    queryFn: () => api.get('/attendance/shifts').then((r) => r.data),
  });
  const shifts: ShiftRow[] = Array.isArray(shiftsData) ? shiftsData : [];
  const employeeOptions = useEmployeeOptions();
  const locationOptions = useLocationOptions();
  const [form, setForm] = useState({
    name: '',
    type: 'FIXED',
    startTime: '09:00',
    endTime: '18:00',
    gracePeriodMins: '15',
    shiftAllowanceAmount: '0',
  });
  const [editingWeeklyOffs, setEditingWeeklyOffs] = useState<{ id: string; days: number[] } | null>(
    null,
  );
  const [assigningShift, setAssigningShift] = useState<{ id: string; name: string } | null>(null);
  const [assignEmployeeIds, setAssignEmployeeIds] = useState<string[]>([]);
  const [assignEffectiveFrom, setAssignEffectiveFrom] = useState('');
  const [assignLocationId, setAssignLocationId] = useState('');
  const create = useMutation({
    mutationFn: () => api.post('/attendance/shifts', { ...form, gracePeriodMins: Number(form.gracePeriodMins), shiftAllowanceAmount: Number(form.shiftAllowanceAmount) }),
    onSuccess: () => { toast('Shift saved'); queryClient.invalidateQueries({ queryKey: ['attendance', 'shifts'] }); setForm((f) => ({ ...f, name: '' })); },
    onError: (err) => toast(apiError(err), 'error'),
  });
  const updateWeeklyOffs = useMutation({
    mutationFn: ({ id, days }: { id: string; days: number[] }) =>
      api.patch(`/attendance/shifts/${id}/weekly-offs`, { weeklyOffDays: days }),
    onSuccess: () => {
      toast('Weekly offs updated');
      queryClient.invalidateQueries({ queryKey: ['attendance', 'shifts'] });
      setEditingWeeklyOffs(null);
    },
    onError: (err) => toast(apiError(err), 'error'),
  });
  const setDefaultShift = useMutation({
    mutationFn: (id: string) => api.patch(`/attendance/shifts/${id}/default`),
    onSuccess: () => { toast('Default shift updated'); queryClient.invalidateQueries({ queryKey: ['attendance', 'shifts'] }); },
    onError: (err) => toast(apiError(err), 'error'),
  });
  const assignShift = useMutation({
    mutationFn: () =>
      api.post('/attendance/shifts/assign', {
        shiftId: assigningShift!.id,
        employeeIds: assignEmployeeIds,
        ...(assignEffectiveFrom && { effectiveFrom: assignEffectiveFrom }),
        ...(assignLocationId && { locationId: assignLocationId }),
      }),
    onSuccess: () => {
      toast('Shift assigned');
      queryClient.invalidateQueries({ queryKey: ['attendance', 'shifts'] });
      setAssigningShift(null);
      setAssignEmployeeIds([]);
      setAssignEffectiveFrom('');
      setAssignLocationId('');
    },
    onError: (err) => toast(apiError(err), 'error'),
  });
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="h-fit p-4">
          <h2 className="text-sm font-semibold">Create shift</h2>
          <form className="mt-3 space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
            <label className="block text-sm">
              <span className="text-ink-muted">Shift name</span>
              <Input className="mt-1" placeholder="Standard Shift" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-ink-muted">Type</span>
                <Select className="mt-1" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}><option>FIXED</option><option>ROTATIONAL</option><option>FLEXIBLE</option><option>NIGHT</option><option>SPLIT</option></Select>
              </label>
              <label className="block text-sm">
                <span className="text-ink-muted">Allowance (₹)</span>
                <Input className="mt-1" type="number" min="0" value={form.shiftAllowanceAmount} onChange={(e) => setForm((f) => ({ ...f, shiftAllowanceAmount: e.target.value }))} />
              </label>
              <label className="block text-sm">
                <span className="text-ink-muted">Start</span>
                <Input className="mt-1" type="time" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} />
              </label>
              <label className="block text-sm">
                <span className="text-ink-muted">End</span>
                <Input className="mt-1" type="time" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} />
              </label>
            </div>
            <Button type="submit" className="w-full" disabled={create.isPending || !form.name}>Save shift</Button>
          </form>
        </Card>
        <Card className="overflow-hidden">
          <div className="border-b border-slate-200 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Shifts</p>
            <p className="mt-1 text-sm text-slate-600">
              &ldquo;On shift today&rdquo; is the headcount the shared shift resolver puts on each shift right
              now, including employees covered by the default shift.
            </p>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Type</TH>
                  <TH>Time</TH>
                  <TH>Grace</TH>
                  <TH>Allowance</TH>
                  <TH>Weekly off</TH>
                  <TH>On shift today</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {shifts.map((s) => (
                  <TR key={s.id}>
                    <TD className="font-medium">
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        {s.name}
                        {s.isDefault && <Badge variant="success">Default</Badge>}
                      </div>
                    </TD>
                    <TD>{s.type}</TD>
                    <TD className="whitespace-nowrap">
                      {s.startTime} - {s.endTime}
                    </TD>
                    <TD>{s.gracePeriodMins}m</TD>
                    <TD>₹{s.shiftAllowanceAmount}</TD>
                    <TD>
                      <div className="flex items-center gap-1 whitespace-nowrap">
                        <span>
                          {s.weeklyOffDays.map((day) => weekdays[day]).join(', ') || 'None'}
                        </span>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Edit weekly offs for ${s.name}`}
                          title="Edit weekly offs"
                          onClick={() =>
                            setEditingWeeklyOffs({ id: s.id, days: [...s.weeklyOffDays] })
                          }
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </div>
                    </TD>
                    <TD>{s.activeAssignments ?? 0}</TD>
                    <TD>
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setAssigningShift({ id: s.id, name: s.name });
                            setAssignEmployeeIds([]);
                            setAssignEffectiveFrom('');
                            setAssignLocationId('');
                          }}
                        >
                          Assign
                        </Button>
                        {!s.isDefault && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={setDefaultShift.isPending}
                            onClick={() => setDefaultShift.mutate(s.id)}
                          >
                            Set default
                          </Button>
                        )}
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </Card>
      </div>
      <Dialog
        open={editingWeeklyOffs !== null}
        onOpenChange={(open) => !open && setEditingWeeklyOffs(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Weekly Off</DialogTitle>
          </DialogHeader>
          <div className="flex flex-wrap gap-3 py-2">
            {weekdays.map((day, index) => (
              <label key={day} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editingWeeklyOffs?.days.includes(index) ?? false}
                  onChange={() =>
                    setEditingWeeklyOffs(
                      (current) =>
                        current && {
                          ...current,
                          days: current.days.includes(index)
                            ? current.days.filter((value) => value !== index)
                            : [...current.days, index].sort(),
                        },
                    )
                  }
                />
                {day}
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingWeeklyOffs(null)}>
              Cancel
            </Button>
            <Button
              disabled={!editingWeeklyOffs || updateWeeklyOffs.isPending}
              onClick={() =>
                editingWeeklyOffs &&
                updateWeeklyOffs.mutate({
                  id: editingWeeklyOffs.id,
                  days: editingWeeklyOffs.days,
                })
              }
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={assigningShift !== null}
        onOpenChange={(open) => !open && setAssigningShift(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign {assigningShift?.name}</DialogTitle>
            <DialogDescription>
              Employees selected here will be moved onto this shift starting from the effective date. Any shift they&apos;re currently on is closed out automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <label className="block text-sm">
              <span className="text-ink-muted">Effective from</span>
              <Input
                type="date"
                value={assignEffectiveFrom}
                onChange={(e) => setAssignEffectiveFrom(e.target.value)}
                className="mt-1"
              />
            </label>
            <label className="block text-sm">
              <span className="text-ink-muted">Location (optional)</span>
              <Select
                value={assignLocationId}
                onChange={(e) => setAssignLocationId(e.target.value)}
                className="mt-1"
              >
                <option value="">Employee&apos;s own location</option>
                {locationOptions.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </Select>
              <span className="mt-1 block text-xs text-ink-muted">
                Set this when these employees work this shift at a different location than usual.
              </span>
            </label>
            <div className="max-h-64 overflow-y-auto rounded-lg border border-line">
              {employeeOptions.map((employee) => (
                <label
                  key={employee.id}
                  className="flex items-center gap-2 border-b border-line px-3 py-2 text-sm last:border-b-0"
                >
                  <input
                    type="checkbox"
                    checked={assignEmployeeIds.includes(employee.id)}
                    onChange={() =>
                      setAssignEmployeeIds((current) =>
                        current.includes(employee.id)
                          ? current.filter((id) => id !== employee.id)
                          : [...current, employee.id],
                      )
                    }
                  />
                  {employee.firstName} {employee.lastName}
                </label>
              ))}
              {employeeOptions.length === 0 && (
                <p className="px-3 py-4 text-sm text-ink-muted">No employees available.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssigningShift(null)}>
              Cancel
            </Button>
            <Button
              disabled={!assignEmployeeIds.length || assignShift.isPending}
              onClick={() => assignShift.mutate()}
            >
              Assign {assignEmployeeIds.length || ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RostersTab() {
  return (
    <div className="space-y-4">
      <EmployeeRosterCard />
      <RosterImportCard />
    </div>
  );
}

const ASSIGNMENT_STATUS_VARIANT: Record<ShiftAssignmentRow['status'], 'success' | 'info' | 'outline'> = {
  ACTIVE: 'success',
  SCHEDULED: 'info',
  EXPIRED: 'outline',
};

/**
 * States which shift attendance uses for **one named employee** on the selected
 * date. It never renders without an employee selection, because a roster table
 * spanning many employees has no single effective shift.
 */
function EffectiveShiftSummary({
  employeeId,
  onDate,
  effective,
}: {
  employeeId: string;
  onDate: string;
  effective?: EffectiveShift;
}) {
  if (!employeeId) {
    return (
      <p className="mt-3 text-xs text-slate-500">
        Select a single employee to see which shift attendance uses on a given date. The table below
        covers every employee in range, so no one shift applies to all of it.
      </p>
    );
  }
  if (!effective) return null;

  const name = employeeLabel(effective.employee);
  const shiftName = effective.shift?.name ?? 'no shift';
  const locationName = effective.effectiveLocation?.name ?? 'no location';
  const fromTenantDefault = effective.source === 'TENANT_DEFAULT';

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
        <CalendarClock className="h-4 w-4 shrink-0 text-slate-500" />
        <span>
          {name} uses {shiftName} at {locationName} on {formatDate(onDate)}.
        </span>
      </p>
      <p className="mt-1 text-xs text-slate-600">
        {fromTenantDefault
          ? 'No roster assignment covers this date, so the tenant default shift applies.'
          : `Resolved from a ${effective.source.replace(/_/g, ' ').toLowerCase()} assignment covering this date.`}
        {effective.locationIsOverride
          ? ` The assignment overrides the working location for this date; base location: ${
              effective.defaultLocation?.name ?? 'none set'
            }.`
          : ' The location is the employee default.'}
      </p>
    </div>
  );
}

/**
 * Employee roster: the assignment ledger behind attendance. Every row is read
 * from the same resolver the punch path uses, so the shift shown here is the
 * shift attendance actually applies.
 */
function EmployeeRosterCard() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const [employeeId, setEmployeeId] = useState('');
  const [from, setFrom] = useState(() => `${today.slice(0, 8)}01`);
  const [to, setTo] = useState(today);
  const [onDate, setOnDate] = useState(today);
  const [editing, setEditing] = useState<ShiftAssignmentRow | null>(null);
  const [editForm, setEditForm] = useState({ shiftId: '', locationId: '', effectiveFrom: '', effectiveTo: '' });

  const employeeOptions = useEmployeeOptions();
  const locationOptions = useLocationOptions();

  const { data: assignments, isLoading } = useQuery({
    queryKey: ['attendance', 'shift-assignments', employeeId, from, to],
    queryFn: () =>
      api
        .get('/attendance/shift-assignments', {
          params: { ...(employeeId && { employeeId }), ...(from && { from }), ...(to && { to }) },
        })
        .then((r) => r.data),
  });
  const { data: shifts } = useQuery({
    queryKey: ['attendance', 'shifts'],
    queryFn: () => api.get('/attendance/shifts').then((r) => r.data),
  });

  // Resolved for one named employee only. Without a selection there is no
  // single answer, so the lookup does not run rather than showing one
  // employee's shift above a table of many.
  const { data: effective } = useQuery({
    enabled: Boolean(employeeId && onDate),
    queryKey: ['attendance', 'effective-shift', employeeId, onDate],
    queryFn: () =>
      api
        .get('/attendance/shift-assignments/effective', {
          params: { employeeId, date: onDate },
        })
        .then((r) => r.data as EffectiveShift),
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['attendance', 'shift-assignments'] });

  const update = useMutation({
    mutationFn: () =>
      api.patch(`/attendance/shift-assignments/${editing!.id}`, {
        ...(editForm.shiftId && { shiftId: editForm.shiftId }),
        locationId: editForm.locationId,
        ...(editForm.effectiveFrom && { effectiveFrom: editForm.effectiveFrom }),
        effectiveTo: editForm.effectiveTo,
      }),
    onSuccess: () => {
      toast('Shift assignment updated');
      setEditing(null);
      refresh();
    },
    onError: (err) => toast(apiError(err), 'error'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/attendance/shift-assignments/${id}`),
    onSuccess: () => {
      toast('Shift assignment deleted');
      refresh();
    },
    onError: (err) => toast(apiError(err), 'error'),
  });

  const rows: ShiftAssignmentRow[] = Array.isArray(assignments) ? assignments : [];
  const shiftRows: ShiftRow[] = Array.isArray(shifts) ? shifts : [];
  const overlapping = rows.filter((row) => row.overlappingAssignmentIds.length).length;

  return (
    <>
      <Card className="overflow-hidden border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Employee roster
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Current and historical shift assignments, the location each one applies at, and where
                the assignment came from.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="block text-xs font-medium text-slate-500">
                Employee
                <Select
                  className="mt-1 w-56"
                  value={employeeId}
                  onChange={(event) => setEmployeeId(event.target.value)}
                >
                  <option value="">All employees</option>
                  {employeeOptions.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employeeLabel(employee)}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="block text-xs font-medium text-slate-500">
                From
                <Input
                  className="mt-1 w-36"
                  type="date"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                />
              </label>
              <label className="block text-xs font-medium text-slate-500">
                To
                <Input
                  className="mt-1 w-36"
                  type="date"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                />
              </label>
              <label className="block text-xs font-medium text-slate-500">
                Shift used on
                <Input
                  className="mt-1 w-36"
                  type="date"
                  value={onDate}
                  onChange={(event) => setOnDate(event.target.value)}
                />
              </label>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge variant="outline">{rows.length} assignments</Badge>
            {overlapping > 0 && (
              <Badge variant="warning">{overlapping} overlapping</Badge>
            )}
          </div>
          <EffectiveShiftSummary employeeId={employeeId} onDate={onDate} effective={effective} />
        </div>

        <div className="overflow-x-auto">
          <Table>
            <THead>
              <TR>
                <TH>Employee</TH>
                <TH>Shift</TH>
                <TH>Effective</TH>
                <TH>Location</TH>
                <TH>Source</TH>
                <TH>Status</TH>
                <TH></TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((row) => (
                <TR key={row.id}>
                  <TD className="font-medium">
                    {row.employee.firstName} {row.employee.lastName}
                    <span className="ml-2 text-xs text-slate-500">{row.employee.employeeCode}</span>
                  </TD>
                  <TD>
                    {row.shift?.name ?? '—'}
                    {row.shift && (
                      <span className="ml-2 text-xs text-slate-500">
                        {row.shift.startTime}–{row.shift.endTime}
                      </span>
                    )}
                  </TD>
                  <TD className="whitespace-nowrap">
                    {formatDate(row.effectiveFrom)} → {row.effectiveTo ? formatDate(row.effectiveTo) : 'Open'}
                  </TD>
                  <TD>
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{row.effectiveLocation?.name ?? '—'}</span>
                      <Badge variant={row.locationIsOverride ? 'violet' : 'outline'}>
                        {row.locationIsOverride ? 'Assignment override' : 'Employee default'}
                      </Badge>
                    </div>
                    {/* The permanent location stays visible so an override is
                        never mistaken for a change to the employee record. */}
                    {row.locationIsOverride && (
                      <p className="mt-1 text-xs text-slate-500">
                        Base location: {row.employee.location?.name ?? 'none set'}
                      </p>
                    )}
                  </TD>
                  <TD>{row.source.replace(/_/g, ' ')}</TD>
                  <TD>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={ASSIGNMENT_STATUS_VARIANT[row.status]}>{row.status}</Badge>
                      {row.overlappingAssignmentIds.length > 0 && (
                        <Badge variant="warning">
                          Overlaps {row.overlappingAssignmentIds.length}
                        </Badge>
                      )}
                    </div>
                  </TD>
                  <TD>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Edit shift assignment"
                        onClick={() => {
                          setEditing(row);
                          setEditForm({
                            shiftId: row.shift?.id ?? '',
                            locationId: row.locationIsOverride ? (row.effectiveLocation?.id ?? '') : '',
                            effectiveFrom: row.effectiveFrom.slice(0, 10),
                            effectiveTo: row.effectiveTo ? row.effectiveTo.slice(0, 10) : '',
                          });
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Delete shift assignment"
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(row.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {!isLoading && rows.length === 0 && (
            <div className="p-4">
              <EmptyState
                icon={Users}
                title="No assignments in this window"
                description="Widen the date range, clear the employee filter, or assign a shift from the Shifts tab."
              />
            </div>
          )}
        </div>
      </Card>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Edit assignment — {editing?.employee.firstName} {editing?.employee.lastName}
            </DialogTitle>
            <DialogDescription>
              Changing the location here overrides the working location for this assignment only. The
              employee&apos;s own location is never changed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <label className="block text-sm">
              <span className="text-ink-muted">Shift</span>
              <Select
                className="mt-1"
                value={editForm.shiftId}
                onChange={(event) => setEditForm((form) => ({ ...form, shiftId: event.target.value }))}
              >
                {shiftRows.map((shift) => (
                  <option key={shift.id} value={shift.id}>
                    {shift.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block text-sm">
              <span className="text-ink-muted">Location</span>
              <Select
                className="mt-1"
                value={editForm.locationId}
                onChange={(event) =>
                  setEditForm((form) => ({ ...form, locationId: event.target.value }))
                }
              >
                <option value="">Employee&apos;s own location</option>
                {locationOptions.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </Select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-ink-muted">Effective from</span>
                <Input
                  className="mt-1"
                  type="date"
                  value={editForm.effectiveFrom}
                  onChange={(event) =>
                    setEditForm((form) => ({ ...form, effectiveFrom: event.target.value }))
                  }
                />
              </label>
              <label className="block text-sm">
                <span className="text-ink-muted">Effective to (inclusive)</span>
                <Input
                  className="mt-1"
                  type="date"
                  value={editForm.effectiveTo}
                  onChange={(event) =>
                    setEditForm((form) => ({ ...form, effectiveTo: event.target.value }))
                  }
                />
                <span className="mt-1 block text-xs text-ink-muted">Leave empty for open-ended.</span>
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button disabled={update.isPending} onClick={() => update.mutate()}>
              Save assignment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Roster sample rows built from this tenant's own employee codes and shift
 * names, so the placeholder never suggests codes like `VH-1001` that the tenant
 * does not use. Falls back to values explicitly labelled as examples when the
 * tenant has no employees or shifts to read yet.
 */
function useRosterSample(): { lines: string[]; isReal: boolean } {
  const { data: employeePage } = useQuery({
    queryKey: ['employees', { rosterSample: true }],
    queryFn: () => api.get('/employees', { params: { pageSize: 2 } }).then((r) => r.data),
  });
  const { data: shiftsData } = useQuery({
    queryKey: ['attendance', 'shifts'],
    queryFn: () => api.get('/attendance/shifts').then((r) => r.data),
  });

  const employees = Array.isArray(employeePage?.data) ? employeePage.data : [];
  const shifts: ShiftRow[] = Array.isArray(shiftsData) ? shiftsData : [];
  const codes = employees
    .map((employee: { employeeCode?: string }) => employee.employeeCode)
    .filter((code: string | undefined): code is string => Boolean(code));
  const shiftNames = shifts.map((shift) => shift.name);
  if (!codes.length || !shiftNames.length) {
    return {
      isReal: false,
      lines: [
        `EXAMPLE-0001,${ROSTER_SAMPLE_DATE},Example Day Shift`,
        `EXAMPLE-0002,${ROSTER_SAMPLE_DATE}T00:00:00.000Z,Example Night Shift`,
      ],
    };
  }
  return {
    isReal: true,
    lines: [
      `${codes[0]},${ROSTER_SAMPLE_DATE},${shiftNames[0]}`,
      `${codes[1] ?? codes[0]},${ROSTER_SAMPLE_DATE}T00:00:00.000Z,${shiftNames[1] ?? shiftNames[0]}`,
    ],
  };
}

function RosterImportCard() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data } = useQuery({
    queryKey: ['attendance', 'rosters'],
    queryFn: () => api.get('/attendance/rosters').then((r) => r.data as RosterUploadRow[]),
  });
  const [name, setName] = useState('Roster upload');
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [rows, setRows] = useState('');
  const [rowErrors, setRowErrors] = useState<Array<{ row: number; employeeCode: string; error: string }>>([]);
  const sample = useRosterSample();
  const upload = useMutation({
    mutationFn: () =>
      api.post('/attendance/rosters/import', {
        name,
        replaceExisting,
        rows: rows
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line && !line.startsWith('#'))
          .map((line) => {
            const [employeeCode, date, shiftName] = line.split(',').map((cell) => cell.trim());
            return { employeeCode, date, shiftName };
          }),
      }),
    onSuccess: (response) => {
      const failures = (response.data.errors ?? []) as Array<{
        row: number;
        employeeCode: string;
        error: string;
      }>;
      setRowErrors(failures);
      toast(
        `Imported ${response.data.importedCount}, failed ${response.data.failedCount}${
          response.data.replacedCount ? `, replaced ${response.data.replacedCount}` : ''
        }`,
        failures.length ? 'info' : 'success',
      );
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
    },
    onError: (err) => toast(apiError(err), 'error'),
  });

  return (
    <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
      <Card className="p-4">
        <h2 className="text-sm font-semibold">Roster import</h2>
        <p className="mt-1 text-xs text-slate-500">
          One row per employee and day: employeeCode,date,shiftName. {SUPPORTED_DATE_FORMATS_HELP}
        </p>
        <Input className="mt-3" value={name} onChange={(e) => setName(e.target.value)} />
        <textarea
          className="mt-3 min-h-40 w-full rounded-md border border-line p-3 font-mono text-xs"
          value={rows}
          placeholder={sample.lines.join('\n')}
          onChange={(e) => setRows(e.target.value)}
        />
        <p className="mt-1 text-xs text-slate-500">
          {sample.isReal
            ? 'The greyed-out rows use real employee codes and shift names from this workspace.'
            : 'The greyed-out rows are placeholders only — EXAMPLE-0001 and the example shift names do not exist in this workspace.'}{' '}
          <button
            type="button"
            className="font-semibold text-teal-700 underline underline-offset-2"
            onClick={() => setRows(sample.lines.join('\n'))}
          >
            Use these rows
          </button>
        </p>
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={replaceExisting}
            onChange={(e) => setReplaceExisting(e.target.checked)}
          />
          <span>
            Replace existing assignments
            <span className="mt-0.5 block text-xs text-ink-muted">
              Without this, a row that collides with an assignment already starting that day fails
              instead of creating a second, ambiguous assignment.
            </span>
          </span>
        </label>
        <div className="mt-3 flex items-center gap-2">
          <Button onClick={() => upload.mutate()} disabled={upload.isPending || !rows.trim()}>
            Import roster
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              downloadTextFile('roster-import-template.csv', rosterTemplate(sample.lines))
            }
          >
            <Download className="h-3.5 w-3.5" /> Template
          </Button>
        </div>
        {rowErrors.length > 0 && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-800">
              {rowErrors.length} row{rowErrors.length === 1 ? '' : 's'} rejected
            </p>
            <ul className="mt-2 space-y-1 text-xs text-amber-900">
              {rowErrors.slice(0, 10).map((failure) => (
                <li key={`${failure.row}-${failure.employeeCode}`}>
                  Row {failure.row} ({failure.employeeCode}): {failure.error}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
      <Card>
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Status</TH>
              <TH>Imported</TH>
              <TH>Failed</TH>
            </TR>
          </THead>
          <TBody>
            {data?.map((history) => (
              <TR key={history.id}>
                <TD>{history.name}</TD>
                <TD>
                  <Badge variant={statusVariant(history.status)}>{history.status}</Badge>
                </TD>
                <TD>{history.importedCount}</TD>
                <TD>{history.failedCount}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}

function AttendanceImportsTab() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [rows, setRows] = useState<AttendanceImportRow[]>([newAttendanceImportRow()]);
  const upload = useMutation({
    // `status` is omitted for rows that leave it blank, so the API derives it.
    mutationFn: () =>
      api.post('/attendance/import/manual', { rows: toAttendanceImportPayload(rows) }),
    onSuccess: (r) => {
      const failures = (r.data.errors ?? []) as Array<{ row: number; error: string }>;
      toast(
        `Imported ${r.data.imported}, skipped ${r.data.skipped}`,
        failures.length ? 'info' : 'success',
      );
      setImportErrors(failures);
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
    },
    onError: (err) => toast(apiError(err), 'error'),
  });

  const [importErrors, setImportErrors] = useState<Array<{ row: number; error: string }>>([]);

  const updateRow = (id: string, patch: Partial<AttendanceImportRow>) => {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch, dateError: undefined } : row)),
    );
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const parsed = parseAttendanceCsv(await file.text());
    setRows(parsed.length ? parsed : [newAttendanceImportRow()]);
    event.target.value = '';
  };

  const validRows = rows.filter((row) => row.employeeCode.trim() && row.date).length;

  return (
    <Card className="overflow-hidden border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Manual attendance import</p>
            <p className="mt-1 text-sm text-slate-600">
              Upload a CSV or add rows below, review every value, then import clean attendance corrections.
            </p>
            <p className="mt-1 text-xs text-slate-500">{SUPPORTED_DATE_FORMATS_HELP}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadTextFile('attendance-import-template.csv', ATTENDANCE_IMPORT_TEMPLATE)}>
              <Download className="h-3.5 w-3.5" /> Template
            </Button>
            <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-ink shadow-sm hover:bg-slate-50">
              <FileUp className="h-3.5 w-3.5" />
              Upload CSV
              <input className="sr-only" type="file" accept=".csv,text/csv" onChange={handleFile} />
            </label>
            <Button variant="outline" size="sm" onClick={() => setRows((current) => [...current, newAttendanceImportRow()])}>
              <Plus className="h-3.5 w-3.5" /> Add row
            </Button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <THead>
            <TR>
              <TH>Employee code</TH>
              <TH>Date</TH>
              <TH>Check in</TH>
              <TH>Check out</TH>
              <TH>Status</TH>
              <TH></TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((row) => (
              <TR key={row.id}>
                <TD>
                  <Input
                    placeholder="VH-1001"
                    value={row.employeeCode}
                    onChange={(e) => updateRow(row.id, { employeeCode: e.target.value })}
                  />
                </TD>
                <TD>
                  <Input
                    type="date"
                    value={row.date}
                    aria-invalid={Boolean(row.dateError)}
                    onChange={(e) => updateRow(row.id, { date: e.target.value })}
                  />
                  {row.dateError && (
                    <p className="mt-1 max-w-[16rem] text-xs text-rose-600">{row.dateError}</p>
                  )}
                </TD>
                <TD>
                  <Input
                    type="time"
                    value={row.punchIn.includes('T') ? formatTimeInput(row.punchIn) : row.punchIn}
                    onChange={(e) => updateRow(row.id, { punchIn: e.target.value })}
                  />
                </TD>
                <TD>
                  <Input
                    type="time"
                    value={row.punchOut.includes('T') ? formatTimeInput(row.punchOut) : row.punchOut}
                    onChange={(e) => updateRow(row.id, { punchOut: e.target.value })}
                  />
                </TD>
                <TD>
                  <Select value={row.status} onChange={(e) => updateRow(row.id, { status: e.target.value })}>
                    {/* Blank is the default: the API derives the status from
                        the punches, the shift and the attendance rule. */}
                    <option value="">Auto — from punches</option>
                    {ATTENDANCE_STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>
                    ))}
                  </Select>
                </TD>
                <TD>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Remove import row"
                    onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}
                    disabled={rows.length === 1}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>

      {importErrors.length > 0 && (
        <div className="border-t border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-800">
            {importErrors.length} row{importErrors.length === 1 ? '' : 's'} rejected
          </p>
          <ul className="mt-2 space-y-1 text-sm text-amber-900">
            {importErrors.slice(0, 10).map((failure) => (
              <li key={failure.row}>Row {failure.row}: {failure.error}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 p-4">
        <p className="text-sm text-slate-600">
          {validRows}/{rows.length} rows ready. Required columns: employee code and date.
        </p>
        <Button onClick={() => upload.mutate()} disabled={upload.isPending || validRows === 0}>
          <Upload className="h-3.5 w-3.5" /> Import attendance
        </Button>
      </div>
    </Card>
  );
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

interface PunchEventRow {
  id: string;
  eventAt: string;
  direction: 'IN' | 'OUT';
  source: string;
  geoAccuracy: number | null;
  isSystemGenerated: boolean;
  location: { id: string; name: string; city: string | null } | null;
}

interface PunchDayRow {
  employeeId: string;
  employee: { id: string; firstName: string; lastName: string; employeeCode: string } | null;
  date: string;
  events: PunchEventRow[];
  punchCount: number;
  firstIn: string | null;
  lastOut: string | null;
  isOpen: boolean;
  grossMinutes: number | null;
  netMinutes: number | null;
  locations: Array<{ id: string; name: string }>;
}

const PUNCH_PAGE_SIZE = 25;

/**
 * Days read from the raw punch log rather than the daily record, so a day
 * worked across several sites is legible.
 *
 * Defaults to the days that need it — more than one pair, or more than one
 * location. An ordinary one-in/one-out day says nothing the attendance view
 * does not already show, so listing those by default only buries these.
 */
function PunchHistoryTab() {
  const toast = useToast();
  const employeeOptions = useEmployeeOptions();
  const locationOptions = useLocationOptions();
  const today = new Date().toISOString().slice(0, 10);
  const [filters, setFilters] = useState({
    employeeId: '',
    locationId: '',
    from: today,
    to: today,
    scope: 'MULTI' as 'MULTI' | 'ALL',
  });
  const [page, setPage] = useState(1);
  const params = {
    page,
    pageSize: PUNCH_PAGE_SIZE,
    scope: filters.scope,
    ...(filters.employeeId && { employeeId: filters.employeeId }),
    ...(filters.locationId && { locationId: filters.locationId }),
    ...(filters.from && { from: filters.from }),
    ...(filters.to && { to: filters.to }),
  };
  const { data, isLoading } = useQuery({
    queryKey: ['attendance', 'punch-events', params],
    queryFn: () =>
      api.get('/attendance/punch-events', { params }).then(
        (r) =>
          r.data as {
            data: PunchDayRow[];
            meta: { page: number; total: number; totalPages: number };
          },
      ),
  });
  const setFilter = <K extends keyof typeof filters>(key: K) => (value: (typeof filters)[K]) => {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  };
  const exportCsv = async () => {
    try {
      const response = await api.get('/attendance/punch-events/export', {
        params,
        responseType: 'blob',
      });
      downloadFile(response.data, 'punch-history.csv');
    } catch (err) {
      toast(apiError(err), 'error');
    }
  };

  const rows = data?.data ?? [];
  const totalPages = data?.meta.totalPages ?? 0;
  const showingAll = filters.scope === 'ALL';

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Select
            value={filters.employeeId}
            onChange={(e) => setFilter('employeeId')(e.target.value)}
          >
            <option value="">All employees</option>
            {employeeOptions.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employeeLabel(employee)}
              </option>
            ))}
          </Select>
          <Select
            value={filters.locationId}
            onChange={(e) => setFilter('locationId')(e.target.value)}
          >
            <option value="">All locations</option>
            {locationOptions.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </Select>
          <Input type="date" value={filters.from} onChange={(e) => setFilter('from')(e.target.value)} />
          <Input type="date" value={filters.to} onChange={(e) => setFilter('to')(e.target.value)} />
          <Button variant="outline" onClick={exportCsv}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <Select
            className="max-w-xs"
            value={filters.scope}
            onChange={(e) => setFilter('scope')(e.target.value as 'MULTI' | 'ALL')}
          >
            <option value="MULTI">Multi-punch and multi-location days</option>
            <option value="ALL">All days with punches</option>
          </Select>
          <p className="text-xs text-ink-faint">
            {showingAll
              ? 'Including ordinary single check-in/check-out days.'
              : 'Ordinary single check-in/check-out days are hidden — they already appear under Attendance.'}
          </p>
        </div>
      </Card>

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={MapPin}
            title={showingAll ? 'No punches in this range' : 'No multi-location days in this range'}
            description={
              showingAll
                ? 'Check-ins and check-outs appear here as they happen, with the location each one was recorded at.'
                : 'Nobody split a day across locations or punched more than once. Switch to "All days with punches" to see every day.'
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((day) => (
            <Card key={`${day.employeeId}-${day.date}`} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {day.employee
                      ? `${day.employee.firstName} ${day.employee.lastName}`
                      : 'Unknown employee'}
                    <span className="ml-1.5 text-xs text-ink-faint">
                      {day.employee?.employeeCode}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {formatDate(day.date)} · {day.punchCount} punches
                    {day.locations.length > 1 && ` · ${day.locations.length} locations`}
                  </p>
                </div>
                <div className="text-right text-xs text-ink-muted">
                  <p className="text-sm font-semibold text-ink tabular-nums">
                    {formatTime(day.firstIn)} → {day.isOpen ? '…' : formatTime(day.lastOut)}
                  </p>
                  <p className="mt-0.5">
                    {day.grossMinutes != null && `${(day.grossMinutes / 60).toFixed(1)}h span`}
                    {/* Only worth showing once the two differ — i.e. the day had
                        a gap between stretches. */}
                    {day.netMinutes != null &&
                      day.netMinutes !== day.grossMinutes &&
                      ` · ${(day.netMinutes / 60).toFixed(1)}h on site`}
                  </p>
                </div>
              </div>

              <Table className="mt-3">
                <THead>
                  <TR>
                    <TH>Punch</TH>
                    <TH>Time</TH>
                    <TH>Location</TH>
                    <TH>Source</TH>
                  </TR>
                </THead>
                <TBody>
                  {day.events.map((event) => (
                    <TR key={event.id}>
                      <TD>
                        <Badge variant={event.direction === 'IN' ? 'success' : 'default'}>
                          {event.direction === 'IN' ? (
                            <>
                              <LogIn className="h-3 w-3" /> In
                            </>
                          ) : (
                            <>
                              <LogOut className="h-3 w-3" /> Out
                            </>
                          )}
                        </Badge>
                      </TD>
                      <TD className="tabular-nums">{formatTime(event.eventAt)}</TD>
                      <TD>{event.location?.name ?? '—'}</TD>
                      <TD>
                        <span className="text-xs text-ink-muted">{event.source}</span>
                        {/* Reconstructed from an import or a correction rather
                            than punched by the employee — worth distinguishing
                            in an audit view. */}
                        {event.isSystemGenerated && (
                          <span className="ml-1.5 text-[11px] text-ink-faint">derived</span>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink-muted">
          <span>
            Page {page} of {totalPages} · {data?.meta.total} days
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(1)}>
              First
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(totalPages)}
            >
              Last
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Comp-off ledger plus a manual credit form.
 *
 * The automatic grant only runs at month finalization, so until the month is
 * closed — and for any day the system never classified as a weekly-off or
 * holiday — HR has no way to credit a worked rest day. This form is that way in.
 */
function CompOffTab() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const employeeOptions = useEmployeeOptions();
  const { data } = useQuery({
    queryKey: ['attendance', 'comp-offs'],
    queryFn: () => api.get('/attendance/comp-offs').then((r) => r.data as CompOffRow[]),
  });

  const [form, setForm] = useState({
    employeeId: '',
    earnedDate: new Date().toISOString().slice(0, 10),
    days: '1',
    expiresAt: '',
    notes: '',
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['attendance', 'comp-offs'] });

  const create = useMutation({
    mutationFn: () =>
      api.post('/attendance/comp-offs', {
        employeeId: form.employeeId,
        earnedDate: form.earnedDate,
        days: Number(form.days),
        // Omitted rather than sent empty, so the API applies its own validity window.
        ...(form.expiresAt && { expiresAt: form.expiresAt }),
        ...(form.notes && { notes: form.notes }),
      }),
    onSuccess: () => {
      toast('Comp-off credited');
      invalidate();
      setForm((f) => ({ ...f, employeeId: '', notes: '' }));
    },
    onError: (err) => toast(apiError(err), 'error'),
  });

  const decide = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'USED' | 'CANCELLED' }) =>
      api.patch(`/attendance/comp-offs/${id}`, { status }),
    onSuccess: () => {
      toast('Comp-off updated');
      invalidate();
    },
    onError: (err) => toast(apiError(err), 'error'),
  });

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <Card className="p-4">
        <h3 className="text-sm font-semibold text-ink">Credit a comp-off</h3>
        <p className="mt-1 text-xs text-ink-muted">
          For a weekly-off or holiday the employee actually worked.
        </p>
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <Select
            value={form.employeeId}
            onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))}
            required
          >
            <option value="">Select employee</option>
            {employeeOptions.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employeeLabel(employee)}
              </option>
            ))}
          </Select>
          <label className="block text-xs text-ink-muted">
            Earned on
            <Input
              type="date"
              value={form.earnedDate}
              onChange={(e) => setForm((f) => ({ ...f, earnedDate: e.target.value }))}
              required
            />
          </label>
          <label className="block text-xs text-ink-muted">
            Days
            <Select value={form.days} onChange={(e) => setForm((f) => ({ ...f, days: e.target.value }))}>
              <option value="0.5">Half day (0.5)</option>
              <option value="1">Full day (1)</option>
            </Select>
          </label>
          <label className="block text-xs text-ink-muted">
            Expires on (optional — defaults to 90 days)
            <Input
              type="date"
              value={form.expiresAt}
              onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
            />
          </label>
          <Input
            placeholder="Note (optional)"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
          <Button type="submit" disabled={!form.employeeId || create.isPending}>
            Credit comp-off
          </Button>
        </form>
      </Card>
      <Card>
        <Table>
          <THead>
            <TR>
              <TH>Employee</TH>
              <TH>Earned</TH>
              <TH>Days</TH>
              <TH>Expires</TH>
              <TH>Status</TH>
              <TH>Actions</TH>
            </TR>
          </THead>
          <TBody>
            {data?.map((c) => (
              <TR key={c.id}>
                <TD>
                  {c.employee.firstName} {c.employee.lastName}
                </TD>
                <TD>{formatDate(c.earnedDate)}</TD>
                <TD>{c.days}</TD>
                <TD>{c.expiresAt ? formatDate(c.expiresAt) : '—'}</TD>
                <TD>
                  <Badge variant={statusVariant(c.status)}>{c.status}</Badge>
                </TD>
                <TD className="space-x-1">
                  {c.status === 'AVAILABLE' ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={decide.isPending}
                        onClick={() => decide.mutate({ id: c.id, status: 'USED' })}
                      >
                        Mark used
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={decide.isPending}
                        onClick={() => decide.mutate({ id: c.id, status: 'CANCELLED' })}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <span className="text-xs text-ink-faint">—</span>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
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

