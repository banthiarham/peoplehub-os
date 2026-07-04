'use client';

import { useQuery } from '@tanstack/react-query';
import { signOut, useSession } from 'next-auth/react';
import { LogOut, Smartphone } from 'lucide-react';
import { api } from '@/lib/api';
import { getDeviceId } from '@/lib/device';
import { formatDate } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface DeviceInfo {
  deviceId: string;
  deviceName: string | null;
  platform: string | null;
  registeredAt: string;
  lastSeenAt: string;
}

export default function MyProfilePage() {
  const { data: session } = useSession();
  const employeeId = session?.user?.employeeId;

  const { data: employee, isLoading } = useQuery({
    queryKey: ['employees', employeeId],
    queryFn: () => api.get(`/employees/${employeeId}`).then((r) => r.data),
    enabled: !!employeeId,
  });
  const { data: device } = useQuery<DeviceInfo | null>({
    queryKey: ['attendance', 'my-device'],
    queryFn: () => api.get('/attendance/device/me').then((r) => r.data ?? null),
  });

  if (isLoading || !employee) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  const name = `${employee.firstName} ${employee.lastName}`;
  const isThisDevice = !!device && device.deviceId === getDeviceId();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">Profile</h1>

      <Card className="flex items-center gap-4 p-4">
        <Avatar name={name} size="lg" />
        <div className="min-w-0">
          <p className="truncate font-semibold">{name}</p>
          <p className="truncate text-xs text-ink-muted">
            {employee.designation?.name ?? '—'} · {employee.department?.name ?? '—'}
          </p>
          <Badge className="mt-1" variant={statusVariant(employee.status)}>
            {employee.status.replace(/_/g, ' ')}
          </Badge>
        </div>
      </Card>

      <Card className="divide-y divide-line">
        <Row label="Employee code" value={employee.employeeCode} />
        <Row label="Work email" value={employee.workEmail ?? '—'} />
        <Row label="Location" value={employee.location?.name ?? '—'} />
        <Row
          label="Manager"
          value={
            employee.manager ? `${employee.manager.firstName} ${employee.manager.lastName}` : '—'
          }
        />
        <Row label="Joined" value={formatDate(employee.joiningDate)} />
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50">
            <Smartphone className="h-5 w-5 text-primary-700" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Punch device</p>
            {device ? (
              <p className="text-xs text-ink-muted">
                {device.deviceName ?? 'Registered device'} · since {formatDate(device.registeredAt)}
              </p>
            ) : (
              <p className="text-xs text-ink-muted">
                Not registered yet — your first check-in binds this device
              </p>
            )}
          </div>
          {device && (
            <Badge variant={isThisDevice ? 'success' : 'destructive'}>
              {isThisDevice ? 'This device' : 'Other device'}
            </Badge>
          )}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
          Attendance punches only work from your registered device. Changed phones? Ask HR to reset
          your device binding.
        </p>
      </Card>

      <Button
        variant="outline"
        className="w-full text-danger"
        onClick={() => signOut({ callbackUrl: '/login' })}
      >
        <LogOut className="h-4 w-4" /> Sign out
      </Button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="max-w-[60%] truncate text-sm font-medium">{value}</p>
    </div>
  );
}
