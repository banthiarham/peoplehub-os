'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeIndianRupee, Plus } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { formatINR } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input, Select } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useToast } from '@/components/ui/toaster';
import { payrollApiError } from './payroll-run-action-button';

interface SalaryRow {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
  department?: { name: string } | null;
  currentSalary?: { id: string; ctc: number; effectiveFrom: string; components: unknown[] } | null;
}

interface StructureOption {
  id: string;
  name: string;
}

interface SalaryPreview {
  monthlyCtc: number;
  monthlyGross: number;
  monthlyDeductions: number;
  monthlyNet: number;
  components: Array<{ code: string; name: string; type: string; monthly: number; annual: number }>;
}

export function PayrollSalariesTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['payroll', 'salaries'],
    queryFn: () => api.get('/payroll/salaries', { params: { pageSize: 100 } }).then((r) => r.data),
  });
  const rows: SalaryRow[] = data?.data ?? [];
  return (
    <Card>
      <div className="flex items-center justify-end border-b border-line p-4">
        <PayrollAssignSalaryDialog />
      </div>
      {isLoading ? (
        <div className="space-y-2 p-4">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : rows.length ? (
        <Table>
          <THead>
            <TR>
              <TH>Employee</TH>
              <TH>Department</TH>
              <TH>Components</TH>
              <TH className="text-right">Current CTC</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((row) => (
              <TR key={row.id}>
                <TD>
                  <div className="flex items-center gap-3">
                    <Avatar name={`${row.firstName} ${row.lastName}`} size="sm" />
                    <span>
                      <span className="block font-medium">{row.firstName} {row.lastName}</span>
                      <span className="block text-xs text-ink-muted">{row.employeeCode}</span>
                    </span>
                  </div>
                </TD>
                <TD>{row.department?.name ?? '—'}</TD>
                <TD><Badge variant="outline">{row.currentSalary?.components?.length ?? 0} lines</Badge></TD>
                <TD className="text-right font-medium tabular-nums">{row.currentSalary ? formatINR(row.currentSalary.ctc, true) : '—'}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      ) : (
        <EmptyState icon={BadgeIndianRupee} title="No employee salaries" description="Assign CTC templates before payroll processing." />
      )}
    </Card>
  );
}

function PayrollAssignSalaryDialog() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState('');
  const [salaryStructureId, setSalaryStructureId] = useState('');
  const [ctc, setCtc] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));

  const { data: employees } = useQuery({
    queryKey: ['payroll', 'salaries', 'employees'],
    queryFn: () => api.get('/employees', { params: { pageSize: 100 } }).then((r) => r.data.data as SalaryRow[]),
    enabled: open,
  });
  const { data: structures } = useQuery({
    queryKey: ['payroll', 'structures', 'salary-assign'],
    queryFn: () => api.get('/payroll/structures').then((r) => r.data as StructureOption[]),
    enabled: open,
  });
  const { data: preview } = useQuery({
    queryKey: ['payroll', 'structures', salaryStructureId, 'preview', ctc],
    queryFn: () =>
      api
        .post(`/payroll/structures/${salaryStructureId}/preview`, { ctc: Number(ctc) })
        .then((r) => r.data as SalaryPreview),
    enabled: open && !!salaryStructureId && Number(ctc) > 0,
  });

  const assign = useMutation({
    mutationFn: () => api.post('/payroll/salaries', {
      employeeId,
      salaryStructureId,
      ctc: Number(ctc),
      effectiveFrom,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payroll'] });
      toast('Salary assigned', 'success');
      setOpen(false);
      setCtc('');
    },
    onError: (err: unknown) => toast(payrollApiError(err), 'error'),
  });

  const valid = employeeId && salaryStructureId && Number(ctc) > 0 && effectiveFrom;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4" /> Assign salary</Button>
      </DialogTrigger>
        <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Assign salary</DialogTitle>
          <DialogDescription>Assign a CTC template and effective date. Previous active salary closes automatically.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 block space-y-1.5 text-xs font-medium text-ink-muted">
            Employee
            <Select className="w-full" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">Select...</option>
              {employees?.map((employee) => (
                <option key={employee.id} value={employee.id}>{employee.firstName} {employee.lastName} ({employee.employeeCode})</option>
              ))}
            </Select>
          </label>
          <label className="col-span-2 block space-y-1.5 text-xs font-medium text-ink-muted">
            Structure
            <Select className="w-full" value={salaryStructureId} onChange={(e) => setSalaryStructureId(e.target.value)}>
              <option value="">Select...</option>
              {structures?.map((structure) => (
                <option key={structure.id} value={structure.id}>{structure.name}</option>
              ))}
            </Select>
          </label>
          <label className="block space-y-1.5 text-xs font-medium text-ink-muted">
            Annual CTC
            <Input type="number" min={1} value={ctc} onChange={(e) => setCtc(e.target.value)} />
          </label>
          <label className="block space-y-1.5 text-xs font-medium text-ink-muted">
            Effective from
            <Input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
          </label>
        </div>
        {preview && (
          <div className="rounded-lg border border-line p-3">
            <div className="mb-3 grid gap-2 text-sm sm:grid-cols-4">
              <PreviewStat label="Monthly CTC" value={preview.monthlyCtc} />
              <PreviewStat label="Gross" value={preview.monthlyGross} />
              <PreviewStat label="Deductions" value={preview.monthlyDeductions} />
              <PreviewStat label="Net" value={preview.monthlyNet} />
            </div>
            <Table>
              <THead>
                <TR>
                  <TH>Code</TH>
                  <TH>Name</TH>
                  <TH>Type</TH>
                  <TH className="text-right">Monthly</TH>
                </TR>
              </THead>
              <TBody>
                {preview.components.map((line) => (
                  <TR key={`${line.code}-${line.type}`}>
                    <TD>{line.code}</TD>
                    <TD>{line.name}</TD>
                    <TD><Badge variant="outline">{line.type}</Badge></TD>
                    <TD className="text-right tabular-nums">{formatINR(line.monthly)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!valid || assign.isPending} onClick={() => assign.mutate()}>
            {assign.isPending ? 'Assigning...' : 'Assign'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreviewStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-canvas p-2">
      <span className="block text-xs text-ink-muted">{label}</span>
      <span className="font-medium tabular-nums">{formatINR(value)}</span>
    </div>
  );
}
