'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LocateFixed, MapPin, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getDeviceId, getDeviceInfo } from '@/lib/device';
import { TARGET_ACCURACY_M, useLiveLocation, type LiveFix } from '@/lib/geo';
import { formatTime } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toaster';

interface MyAttendanceRecord {
  date: string;
  status: string;
  punchIn: string | null;
  punchOut: string | null;
  workingMinutes: number | null;
  geoAccuracy: number | null;
}

interface PunchEvent {
  id: string;
  eventAt: string;
  direction: 'IN' | 'OUT';
  location: { id: string; name: string } | null;
}

interface PunchDay {
  events: PunchEvent[];
  /** True while the last punch of the day is a check-in. */
  isOpen: boolean;
  firstIn: string | null;
  lastOut: string | null;
  grossMinutes: number | null;
  netMinutes: number | null;
  locations: Array<{ id: string; name: string }>;
}

function apiError(err: unknown): string {
  const e = err as { response?: { data?: { message?: string | string[] } } };
  const m = e?.response?.data?.message;
  return Array.isArray(m) ? m.join(', ') : (m ?? 'Something went wrong');
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

/** Maps an accuracy radius to a 0–100 progress value (log-ish feel). */
function accuracyProgress(accuracy: number): number {
  const clamped = Math.min(Math.max(accuracy, TARGET_ACCURACY_M), 300);
  return Math.round(100 - ((clamped - TARGET_ACCURACY_M) / (300 - TARGET_ACCURACY_M)) * 100);
}

export function CheckInPanel() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [arming, setArming] = useState(false);
  const [armedAt, setArmedAt] = useState(0);
  const { fix, status, isPrecise } = useLiveLocation(arming);

  const { data, isLoading } = useQuery({
    queryKey: ['attendance', 'my-month'],
    queryFn: () => api.get('/attendance/me').then((r) => r.data),
  });
  // Whether the employee is on the clock comes from the punch log, not from the
  // record: with several punches a day the record's `punchOut` holds the last
  // completed check-out even while they are checked back in somewhere else.
  const { data: punchDay } = useQuery<PunchDay>({
    queryKey: ['attendance', 'my-punches', todayKey()],
    queryFn: () => api.get('/attendance/punch-events/me').then((r) => r.data),
  });
  const today: MyAttendanceRecord | undefined = data?.records?.find(
    (r: MyAttendanceRecord) => r.date.slice(0, 10) === todayKey(),
  );

  const checkIn = useMutation({
    mutationFn: (f: LiveFix | null) =>
      api
        .post('/attendance/check-in', {
          deviceId: getDeviceId(),
          ...getDeviceInfo(),
          ...(f
            ? { geoLat: f.lat, geoLng: f.lng, geoAccuracy: f.accuracy, fixAt: f.timestamp }
            : {}),
        })
        .then((r) => r.data),
    onSuccess: (record) => {
      setArming(false);
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      // Not `record.punchIn` — that is the day's *first* check-in, which is not
      // this punch once the day has more than one.
      toast(
        `Checked in at ${formatTime(new Date().toISOString())}${
          record.status === 'LATE' ? ' — marked late' : ''
        }`,
        record.status === 'LATE' ? 'info' : 'success',
      );
    },
    onError: (err) => {
      setArming(false);
      toast(apiError(err), 'error');
    },
  });

  const checkOut = useMutation({
    mutationFn: () =>
      api.post('/attendance/check-out', { deviceId: getDeviceId() }).then((r) => r.data),
    onSuccess: (record) => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      const hours = record.workingMinutes ? (record.workingMinutes / 60).toFixed(1) : null;
      toast(`Checked out${hours ? ` — ${hours}h worked` : ''}`, 'success');
    },
    onError: (err) => toast(apiError(err), 'error'),
  });

  // Submit the moment a precise fresh fix lands (no waiting, no stale data).
  // If location is blocked/unsupported we submit without coordinates and let
  // the server decide whether the geofence makes that acceptable.
  useEffect(() => {
    if (!arming || checkIn.isPending) return;
    if (isPrecise && fix) {
      checkIn.mutate(fix);
    } else if (status === 'denied' || status === 'unavailable') {
      checkIn.mutate(null);
    }
  }, [arming, isPrecise, fix, status, checkIn]);

  if (isLoading) return <Skeleton className="h-44" />;

  const events = punchDay?.events ?? [];
  // On the clock: the day's last punch was a check-in. Falls back to the record
  // for the moment before the punch log loads.
  const onTheClock = punchDay ? punchDay.isOpen : !!today?.punchIn && !today?.punchOut;
  const hasPunched = events.length > 0 || !!today?.punchIn;
  const elapsedSec = arming ? Math.round((Date.now() - armedAt) / 1000) : 0;

  return (
    <Card className="p-5">
      {!onTheClock && !arming && (
        <div className="text-center">
          <p className="text-sm text-ink-muted">
            {hasPunched ? 'You are checked out' : "You haven't checked in today"}
          </p>
          <Button
            size="lg"
            className="mt-3 w-full"
            onClick={() => {
              setArmedAt(Date.now());
              setArming(true);
            }}
          >
            <MapPin className="h-4 w-4" /> {hasPunched ? 'Check in again' : 'Check in'}
          </Button>
          <p className="mt-2 text-[11px] text-ink-faint">
            {hasPunched
              ? 'Checking in again at another site starts a new stretch of the same day'
              : `Uses a fresh GPS fix (≤${TARGET_ACCURACY_M}m) from your registered device`}
          </p>
        </div>
      )}

      {arming && (
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary-50">
            <LocateFixed className="h-6 w-6 animate-pulse text-primary-700" />
          </div>
          <p className="mt-3 text-sm font-medium">
            {checkIn.isPending
              ? 'Checking in…'
              : fix
                ? `Accuracy ±${Math.round(fix.accuracy)}m`
                : 'Acquiring GPS…'}
          </p>
          <div className="mx-auto mt-2 h-1.5 w-48 overflow-hidden rounded-full bg-primary-100">
            <div
              className="h-full rounded-full bg-primary-600 transition-all duration-500"
              style={{ width: `${fix ? accuracyProgress(fix.accuracy) : 5}%` }}
            />
          </div>
          <p className="mt-2 text-[11px] text-ink-faint">
            Waiting for a precise fix (≤{TARGET_ACCURACY_M}m) — checks in automatically
          </p>
          <div className="mt-3 flex justify-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setArming(false)}>
              <XCircle className="h-3.5 w-3.5" /> Cancel
            </Button>
            {fix && !isPrecise && elapsedSec > 12 && !checkIn.isPending && (
              <Button size="sm" variant="secondary" onClick={() => checkIn.mutate(fix)}>
                Use ±{Math.round(fix.accuracy)}m fix
              </Button>
            )}
          </div>
        </div>
      )}

      {hasPunched && !arming && (
        <div className={onTheClock ? '' : 'mt-5 border-t border-line pt-4'}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-ink-muted">Today</p>
              <p className="mt-0.5 text-lg font-semibold">
                {formatTime(punchDay?.firstIn ?? today?.punchIn ?? null)} →{' '}
                {onTheClock ? '…' : formatTime(punchDay?.lastOut ?? today?.punchOut ?? null)}
              </p>
              <p className="mt-0.5 text-xs text-ink-muted">
                {onTheClock
                  ? 'On the clock'
                  : today?.workingMinutes != null
                    ? `${(today.workingMinutes / 60).toFixed(1)}h worked`
                    : '—'}
                {/* Only worth showing once the two differ, i.e. the day was
                    split across more than one stretch. */}
                {punchDay?.netMinutes != null &&
                  punchDay.grossMinutes != null &&
                  punchDay.netMinutes !== punchDay.grossMinutes &&
                  ` · ${(punchDay.netMinutes / 60).toFixed(1)}h on site`}
                {today?.geoAccuracy != null && ` · GPS ±${Math.round(today.geoAccuracy)}m`}
              </p>
            </div>
            {today && (
              <Badge variant={today.status === 'LATE' ? 'warning' : 'success'}>{today.status}</Badge>
            )}
          </div>

          {events.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {events.map((event) => (
                <li key={event.id} className="flex items-center gap-2 text-xs">
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      event.direction === 'IN' ? 'bg-emerald-500' : 'bg-ink-faint'
                    }`}
                  />
                  <span className="font-medium tabular-nums">{formatTime(event.eventAt)}</span>
                  <span className="text-ink-muted">
                    {event.direction === 'IN' ? 'Checked in' : 'Checked out'}
                  </span>
                  {event.location && (
                    <span className="ml-auto truncate text-ink-faint">{event.location.name}</span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {onTheClock && (
            <Button
              variant="outline"
              className="mt-4 w-full"
              disabled={checkOut.isPending}
              onClick={() => checkOut.mutate()}
            >
              {checkOut.isPending ? 'Checking out…' : 'Check out'}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
