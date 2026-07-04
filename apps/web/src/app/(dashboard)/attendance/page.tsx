'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Clock, LogIn, LogOut, MapPin } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { getDeviceId, getDeviceInfo } from '@/lib/device';
import { captureFreshFix } from '@/lib/geo';
import { formatTime } from '@/lib/utils';
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
import { Input } from '@/components/ui/input';
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

function apiError(err: unknown): string {
  const e = err as { response?: { data?: { message?: string | string[] } } };
  const m = e?.response?.data?.message;
  return Array.isArray(m) ? m.join(', ') : (m ?? 'Something went wrong');
}

export default function AttendancePage() {
  const queryClient = useQueryClient();
  const toast = useToast();
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
      toast('Attendance regularized');
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

      {isLoading || !data ? (
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
      )}

      <Dialog open={regularizeOpen} onOpenChange={setRegularizeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Regularize attendance</DialogTitle>
            <DialogDescription>
              Correct a missed or wrong punch — this updates the record with a MANUAL source.
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
