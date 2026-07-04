'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LocateFixed, MapPin, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { captureFreshFix } from '@/lib/geo';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useToast } from '@/components/ui/toaster';

interface LocationRow {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  geoLat: number | null;
  geoLng: number | null;
  attendanceRadius: number | null;
  isActive: boolean;
  employees: number;
}

interface FormState {
  name: string;
  city: string;
  state: string;
  geoLat: string;
  geoLng: string;
  attendanceRadius: string;
}

const emptyForm: FormState = {
  name: '',
  city: '',
  state: '',
  geoLat: '',
  geoLng: '',
  attendanceRadius: '',
};

function apiError(err: unknown): string {
  const e = err as { response?: { data?: { message?: string | string[] } } };
  const m = e?.response?.data?.message;
  return Array.isArray(m) ? m.join(', ') : (m ?? 'Something went wrong');
}

function toForm(loc: LocationRow): FormState {
  return {
    name: loc.name,
    city: loc.city ?? '',
    state: loc.state ?? '',
    geoLat: loc.geoLat != null ? String(Number(loc.geoLat.toFixed(6))) : '',
    geoLng: loc.geoLng != null ? String(Number(loc.geoLng.toFixed(6))) : '',
    attendanceRadius: loc.attendanceRadius != null ? String(loc.attendanceRadius) : '',
  };
}

export function LocationsGeofencing() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<LocationRow | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [locating, setLocating] = useState(false);
  const [fixAccuracy, setFixAccuracy] = useState<number | null>(null);

  const { data: locations, isLoading } = useQuery<LocationRow[]>({
    queryKey: ['locations'],
    queryFn: () => api.get('/locations').then((r) => r.data),
  });

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name.trim(),
        city: form.city.trim() || undefined,
        state: form.state.trim() || undefined,
        geoLat: form.geoLat === '' ? undefined : Number(form.geoLat),
        geoLng: form.geoLng === '' ? undefined : Number(form.geoLng),
        attendanceRadius: form.attendanceRadius === '' ? 0 : Number(form.attendanceRadius),
      };
      return editing === 'new'
        ? api.post('/locations', payload)
        : api.patch(`/locations/${(editing as LocationRow).id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      toast(editing === 'new' ? 'Location created' : 'Geofence updated');
      closeDialog();
    },
    onError: (err) => toast(apiError(err), 'error'),
  });

  const openDialog = (target: LocationRow | 'new') => {
    setEditing(target);
    setForm(target === 'new' ? emptyForm : toForm(target));
    setFixAccuracy(null);
  };
  const closeDialog = () => {
    setEditing(null);
    setLocating(false);
    setFixAccuracy(null);
  };

  const useMyLocation = async () => {
    setLocating(true);
    const fix = await captureFreshFix();
    setLocating(false);
    if (!fix) {
      toast('Could not get a GPS fix — allow location access and try again', 'error');
      return;
    }
    setForm((f) => ({ ...f, geoLat: fix.lat.toFixed(6), geoLng: fix.lng.toFixed(6) }));
    setFixAccuracy(fix.accuracy);
  };

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const geofenceCell = (loc: LocationRow) => {
    if (loc.geoLat == null || loc.geoLng == null) {
      return <Badge variant="outline">No coordinates</Badge>;
    }
    if (!loc.attendanceRadius) {
      return <Badge variant="outline">Off</Badge>;
    }
    return <Badge variant="success">{loc.attendanceRadius}m radius</Badge>;
  };

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary-600" /> Locations &amp; geofencing
        </CardTitle>
        <Button size="sm" onClick={() => openDialog('new')}>
          <Plus className="h-3.5 w-3.5" /> New location
        </Button>
      </CardHeader>
      {isLoading ? (
        <div className="space-y-2 p-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Location</TH>
              <TH>Coordinates</TH>
              <TH>Geofence</TH>
              <TH className="text-right">Employees</TH>
              <TH></TH>
            </TR>
          </THead>
          <TBody>
            {locations?.map((loc) => (
              <TR key={loc.id}>
                <TD>
                  <span className="block font-medium">{loc.name}</span>
                  <span className="block text-xs text-ink-muted">
                    {[loc.city, loc.state].filter(Boolean).join(', ') || '—'}
                  </span>
                </TD>
                <TD className="tabular-nums text-ink-muted">
                  {loc.geoLat != null && loc.geoLng != null
                    ? `${loc.geoLat.toFixed(4)}, ${loc.geoLng.toFixed(4)}`
                    : '—'}
                </TD>
                <TD>{geofenceCell(loc)}</TD>
                <TD className="text-right tabular-nums">{loc.employees}</TD>
                <TD className="text-right">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => openDialog(loc)}
                    aria-label={`Edit ${loc.name}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      <p className="border-t border-line px-4 py-3 text-[11px] text-ink-faint">
        Geofencing applies to office-mode employees at locations with coordinates and a radius.
        Their check-in then requires a fresh GPS fix inside the radius. Set the radius to 0 to turn
        the fence off.
      </p>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing === 'new' ? 'New location' : `Edit ${form.name}`}</DialogTitle>
            <DialogDescription>
              Coordinates mark the geofence center; the radius is the allowed punch distance.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
            className="space-y-4"
          >
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-ink-muted">Name</span>
              <Input value={form.name} onChange={set('name')} required />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-ink-muted">City</span>
                <Input value={form.city} onChange={set('city')} />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-ink-muted">State</span>
                <Input value={form.state} onChange={set('state')} />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-ink-muted">Latitude</span>
                <Input
                  type="number"
                  step="any"
                  min={-90}
                  max={90}
                  value={form.geoLat}
                  onChange={set('geoLat')}
                  placeholder="28.6139"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-ink-muted">Longitude</span>
                <Input
                  type="number"
                  step="any"
                  min={-180}
                  max={180}
                  value={form.geoLng}
                  onChange={set('geoLng')}
                  placeholder="77.2090"
                />
              </label>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={locating}
                onClick={useMyLocation}
              >
                <LocateFixed className="h-3.5 w-3.5" />
                {locating ? 'Locating…' : 'Use my current location'}
              </Button>
              {fixAccuracy != null && (
                <span className="text-xs text-ink-muted">±{Math.round(fixAccuracy)}m fix</span>
              )}
            </div>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-ink-muted">
                Attendance radius (meters) — 0 or empty disables the geofence
              </span>
              <Input
                type="number"
                min={0}
                max={10000}
                value={form.attendanceRadius}
                onChange={set('attendanceRadius')}
                placeholder="200"
              />
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button type="submit" disabled={!form.name.trim() || save.isPending}>
                {save.isPending ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
