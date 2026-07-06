'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input, Select } from '@/components/ui/input';
import { useToast } from '@/components/ui/toaster';
import { payrollApiError } from './payroll-run-action-button';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface OptionItem {
  id: string;
  name: string;
}

/** "New run" button + dialog that creates a DRAFT payroll run for a month/year. */
export function PayrollNewRunDialog() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const now = new Date();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(String(now.getFullYear()));
  const [runType, setRunType] = useState('MONTHLY');
  const [legalEntityId, setLegalEntityId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [payGroup, setPayGroup] = useState('');

  const { data: options } = useQuery({
    queryKey: ['employees', 'meta', 'payroll-run'],
    queryFn: () => api.get('/employees/meta/options').then((r) => r.data),
    enabled: open,
  });

  const create = useMutation({
    mutationFn: () =>
      api.post('/payroll/runs', {
        month,
        year: Number(year),
        runType,
        legalEntityId: legalEntityId || undefined,
        locationId: locationId || undefined,
        payGroup: payGroup.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payroll'] });
      toast(`Draft payroll run created for ${MONTH_NAMES[month - 1]} ${year}`, 'success');
      setOpen(false);
    },
    onError: (err: unknown) => toast(payrollApiError(err), 'error'),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" /> New run
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New payroll run</DialogTitle>
          <DialogDescription>Creates a draft run for the selected pay period.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1.5 text-xs font-medium text-ink-muted">
            Month
            <Select
              className="w-full"
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
            >
              {MONTH_NAMES.map((name, i) => (
                <option key={name} value={i + 1}>
                  {name}
                </option>
              ))}
            </Select>
          </label>
          <label className="space-y-1.5 text-xs font-medium text-ink-muted">
            Year
            <Input
              type="number"
              min={2000}
              max={2100}
              value={year}
              onChange={(e) => setYear(e.target.value)}
            />
          </label>
          <label className="space-y-1.5 text-xs font-medium text-ink-muted">
            Run type
            <Select className="w-full" value={runType} onChange={(e) => setRunType(e.target.value)}>
              <option value="MONTHLY">Monthly</option>
              <option value="OFF_CYCLE">Off-cycle</option>
              <option value="FULL_AND_FINAL">Full & final</option>
            </Select>
          </label>
          <label className="space-y-1.5 text-xs font-medium text-ink-muted">
            Pay group
            <Input value={payGroup} onChange={(e) => setPayGroup(e.target.value)} placeholder="India Monthly" />
          </label>
          <label className="space-y-1.5 text-xs font-medium text-ink-muted">
            Legal entity
            <Select className="w-full" value={legalEntityId} onChange={(e) => setLegalEntityId(e.target.value)}>
              <option value="">All entities</option>
              {options?.legalEntities?.map((item: OptionItem) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </Select>
          </label>
          <label className="space-y-1.5 text-xs font-medium text-ink-muted">
            Location
            <Select className="w-full" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">All locations</option>
              {options?.locations?.map((item: OptionItem) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </Select>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !year}>
            {create.isPending ? 'Creating…' : 'Create run'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
