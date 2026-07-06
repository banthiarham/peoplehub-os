'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Settings2, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { formatINR } from '@/lib/utils';
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

interface SalaryComponent {
  id?: string;
  code: string;
  name: string;
  type: string;
  calculationType: string;
  value: number;
  isTaxable: boolean;
  isStatutory: boolean;
  statutoryType?: string | null;
  sequence: number;
}

interface SalaryStructure {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  components: SalaryComponent[];
}

interface PreviewLine {
  code: string;
  name: string;
  type: string;
  monthly: number;
  annual: number;
}

interface Preview {
  monthlyCtc: number;
  monthlyGross: number;
  monthlyDeductions: number;
  monthlyNet: number;
  employerContributions: number;
  components: PreviewLine[];
}

const DEFAULT_COMPONENTS: SalaryComponent[] = [
  { name: 'Basic', code: 'BASIC', type: 'EARNING', calculationType: 'PERCENTAGE_OF_GROSS', value: 40, isTaxable: true, isStatutory: false, sequence: 1 },
  { name: 'HRA', code: 'HRA', type: 'EARNING', calculationType: 'PERCENTAGE_OF_BASIC', value: 50, isTaxable: false, isStatutory: false, sequence: 2 },
  { name: 'Special Allowance', code: 'SA', type: 'EARNING', calculationType: 'FIXED', value: 0, isTaxable: true, isStatutory: false, sequence: 3 },
  { name: 'Provident Fund (Employee)', code: 'PF_EMP', type: 'DEDUCTION', calculationType: 'PERCENTAGE_OF_BASIC', value: 12, isTaxable: false, isStatutory: true, statutoryType: 'PF', sequence: 10 },
  { name: 'Provident Fund (Employer)', code: 'PF_EMP_R', type: 'EMPLOYER_CONTRIBUTION', calculationType: 'PERCENTAGE_OF_BASIC', value: 12, isTaxable: false, isStatutory: true, statutoryType: 'PF', sequence: 11 },
  { name: 'ESI (Employee)', code: 'ESI_EMP', type: 'DEDUCTION', calculationType: 'PERCENTAGE_OF_GROSS', value: 0.75, isTaxable: false, isStatutory: true, statutoryType: 'ESI', sequence: 12 },
  { name: 'Professional Tax', code: 'PT', type: 'DEDUCTION', calculationType: 'FIXED', value: 200, isTaxable: false, isStatutory: true, statutoryType: 'PT', sequence: 13 },
  { name: 'Labour Welfare Fund', code: 'LWF', type: 'DEDUCTION', calculationType: 'FIXED', value: 10, isTaxable: false, isStatutory: true, statutoryType: 'LWF', sequence: 14 },
  { name: 'Gratuity Accrual', code: 'GRATUITY', type: 'EMPLOYER_CONTRIBUTION', calculationType: 'PERCENTAGE_OF_BASIC', value: 4.81, isTaxable: false, isStatutory: true, statutoryType: 'GRATUITY', sequence: 15 },
  { name: 'TDS', code: 'TDS', type: 'DEDUCTION', calculationType: 'FIXED', value: 0, isTaxable: false, isStatutory: true, statutoryType: 'TDS', sequence: 16 },
];

export function PayrollStructuresTab() {
  const [editing, setEditing] = useState<SalaryStructure | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['payroll', 'structures'],
    queryFn: () => api.get('/payroll/structures').then((r) => r.data as SalaryStructure[]),
  });

  const rows = data ?? [];
  return (
    <Card>
      <div className="flex items-center justify-end border-b border-line p-4">
        <PayrollStructureDialog />
      </div>
      {isLoading ? (
        <div className="space-y-2 p-4">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : rows.length ? (
        <Table>
          <THead>
            <TR>
              <TH>Template</TH>
              <TH>Components</TH>
              <TH>Status</TH>
              <TH></TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((row) => (
              <TR key={row.id}>
                <TD>
                  <span className="block font-medium">{row.name}</span>
                  <span className="block text-xs text-ink-muted">{row.description ?? 'CTC template'}</span>
                </TD>
                <TD>
                  <div className="flex flex-wrap gap-1">
                    {row.components.map((component) => (
                      <Badge key={component.id ?? component.code} variant="outline">
                        {component.code} {component.value ? `${component.value}${component.calculationType.includes('PERCENTAGE') ? '%' : ''}` : 'balancer'}
                      </Badge>
                    ))}
                  </div>
                </TD>
                <TD><Badge variant={row.isActive ? 'success' : 'outline'}>{row.isActive ? 'ACTIVE' : 'INACTIVE'}</Badge></TD>
                <TD className="text-right">
                  <Button size="sm" variant="outline" onClick={() => setEditing(row)}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      ) : (
        <EmptyState icon={Settings2} title="No salary structures" description="Create a CTC template to assign salary components." />
      )}
      <PayrollStructureDialog structure={editing} onClose={() => setEditing(null)} />
    </Card>
  );
}

function PayrollStructureDialog({ structure, onClose }: { structure?: SalaryStructure | null; onClose?: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const controlled = structure !== undefined;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(structure?.name ?? 'India Standard CTC');
  const [description, setDescription] = useState(structure?.description ?? 'Basic, HRA, special allowance, PF, ESI, PT, LWF and gratuity');
  const [isActive, setIsActive] = useState(structure?.isActive ?? true);
  const [components, setComponents] = useState<SalaryComponent[]>(cloneComponents(structure?.components ?? DEFAULT_COMPONENTS));
  const [previewCtc, setPreviewCtc] = useState('1200000');
  const [preview, setPreview] = useState<Preview | null>(null);

  const visibleOpen = controlled ? !!structure : open;

  const resetFromStructure = () => {
    setName(structure?.name ?? 'India Standard CTC');
    setDescription(structure?.description ?? 'Basic, HRA, special allowance, PF, ESI, PT, LWF and gratuity');
    setIsActive(structure?.isActive ?? true);
    setComponents(cloneComponents(structure?.components ?? DEFAULT_COMPONENTS));
    setPreview(null);
  };

  useEffect(() => {
    if (!structure) return;
    setName(structure.name);
    setDescription(structure.description ?? '');
    setIsActive(structure.isActive);
    setComponents(cloneComponents(structure.components));
    setPreview(null);
  }, [structure]);

  const payload = useMemo(() => ({
    name: name.trim(),
    description: description.trim() || undefined,
    isActive,
    components: components.map((component, index) => ({
      name: component.name.trim(),
      code: component.code.trim().toUpperCase(),
      type: component.type,
      calculationType: component.calculationType,
      value: Number(component.value),
      isTaxable: component.isTaxable,
      isStatutory: component.isStatutory,
      statutoryType: component.statutoryType?.trim() || undefined,
      sequence: Number(component.sequence || index + 1),
    })),
  }), [components, description, isActive, name]);

  const save = useMutation({
    mutationFn: () => structure
      ? api.patch(`/payroll/structures/${structure.id}`, payload)
      : api.post('/payroll/structures', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payroll'] });
      toast(structure ? 'Salary structure updated' : 'Salary structure created', 'success');
      if (controlled) onClose?.();
      else setOpen(false);
    },
    onError: (err: unknown) => toast(payrollApiError(err), 'error'),
  });

  const runPreview = useMutation({
    mutationFn: async () => {
      let id = structure?.id;
      if (!id) {
        const created = await api.post('/payroll/structures', payload).then((r) => r.data as SalaryStructure);
        id = created.id;
        queryClient.invalidateQueries({ queryKey: ['payroll'] });
      }
      return api.post(`/payroll/structures/${id}/preview`, { ctc: Number(previewCtc) }).then((r) => r.data as Preview);
    },
    onSuccess: (data) => setPreview(data),
    onError: (err: unknown) => toast(payrollApiError(err), 'error'),
  });

  const setComponent = (index: number, patch: Partial<SalaryComponent>) => {
    setComponents((current) => current.map((component, i) => i === index ? { ...component, ...patch } : component));
  };
  const addComponent = () => {
    setComponents((current) => [
      ...current,
      { name: 'New Component', code: `COMP_${current.length + 1}`, type: 'EARNING', calculationType: 'FIXED', value: 0, isTaxable: true, isStatutory: false, sequence: current.length + 1 },
    ]);
  };
  const removeComponent = (index: number) => setComponents((current) => current.filter((_, i) => i !== index));

  return (
    <Dialog
      open={visibleOpen}
      onOpenChange={(next) => {
        if (!next) {
          if (controlled) onClose?.();
          else setOpen(false);
        } else {
          resetFromStructure();
          setOpen(true);
        }
      }}
    >
      {!controlled && (
        <DialogTrigger asChild>
          <Button size="sm"><Plus className="h-4 w-4" /> New structure</Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[88vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{structure ? 'Edit salary structure' : 'Salary structure'}</DialogTitle>
          <DialogDescription>Configure every salary component used by CTC assignment and payroll calculation.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <label className="block space-y-1.5 text-xs font-medium text-ink-muted">
            Name
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block space-y-1.5 text-xs font-medium text-ink-muted">
            Description
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <label className="flex items-end gap-2 pb-2 text-sm text-ink-muted">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Active
          </label>
        </div>

        <div className="overflow-x-auto rounded-lg border border-line">
          <Table>
            <THead>
              <TR>
                <TH>Seq</TH>
                <TH>Name</TH>
                <TH>Code</TH>
                <TH>Type</TH>
                <TH>Calc</TH>
                <TH>Value</TH>
                <TH>Flags</TH>
                <TH></TH>
              </TR>
            </THead>
            <TBody>
              {components.map((component, index) => (
                <TR key={`${component.code}-${index}`}>
                  <TD><Input className="w-16" type="number" value={component.sequence} onChange={(e) => setComponent(index, { sequence: Number(e.target.value) })} /></TD>
                  <TD><Input className="min-w-44" value={component.name} onChange={(e) => setComponent(index, { name: e.target.value })} /></TD>
                  <TD><Input className="w-32" value={component.code} onChange={(e) => setComponent(index, { code: e.target.value.toUpperCase() })} /></TD>
                  <TD>
                    <Select className="w-44" value={component.type} onChange={(e) => setComponent(index, { type: e.target.value })}>
                      <option value="EARNING">Earning</option>
                      <option value="DEDUCTION">Deduction</option>
                      <option value="EMPLOYER_CONTRIBUTION">Employer contribution</option>
                    </Select>
                  </TD>
                  <TD>
                    <Select className="w-44" value={component.calculationType} onChange={(e) => setComponent(index, { calculationType: e.target.value })}>
                      <option value="FIXED">Fixed</option>
                      <option value="PERCENTAGE_OF_BASIC">% of basic</option>
                      <option value="PERCENTAGE_OF_GROSS">% of gross</option>
                    </Select>
                  </TD>
                  <TD><Input className="w-24" type="number" step="0.01" value={component.value} onChange={(e) => setComponent(index, { value: Number(e.target.value) })} /></TD>
                  <TD>
                    <div className="flex min-w-44 flex-wrap gap-2 text-xs text-ink-muted">
                      <label className="flex items-center gap-1"><input type="checkbox" checked={component.isTaxable} onChange={(e) => setComponent(index, { isTaxable: e.target.checked })} />Taxable</label>
                      <label className="flex items-center gap-1"><input type="checkbox" checked={component.isStatutory} onChange={(e) => setComponent(index, { isStatutory: e.target.checked })} />Statutory</label>
                      <Input className="h-7 w-24" placeholder="PF" value={component.statutoryType ?? ''} onChange={(e) => setComponent(index, { statutoryType: e.target.value.toUpperCase() })} />
                    </div>
                  </TD>
                  <TD>
                    <Button size="icon" variant="outline" className="h-8 w-8 text-danger" onClick={() => removeComponent(index)} aria-label="Remove component">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button size="sm" variant="outline" onClick={addComponent}><Plus className="h-3.5 w-3.5" /> Add component</Button>
          <div className="flex items-center gap-2">
            <Input className="w-32" type="number" min={1} value={previewCtc} onChange={(e) => setPreviewCtc(e.target.value)} />
            <Button size="sm" variant="secondary" disabled={runPreview.isPending || Number(previewCtc) <= 0} onClick={() => runPreview.mutate()}>
              {runPreview.isPending ? 'Previewing...' : 'Preview CTC'}
            </Button>
          </div>
        </div>

        {preview && (
          <div className="rounded-lg border border-line p-3">
            <div className="mb-3 grid gap-2 text-sm sm:grid-cols-4">
              <PreviewStat label="Monthly CTC" value={preview.monthlyCtc} />
              <PreviewStat label="Gross" value={preview.monthlyGross} />
              <PreviewStat label="Deductions" value={preview.monthlyDeductions} />
              <PreviewStat label="Net" value={preview.monthlyNet} />
            </div>
            <div className="max-h-48 overflow-y-auto">
              <Table>
                <THead>
                  <TR><TH>Code</TH><TH>Name</TH><TH>Type</TH><TH className="text-right">Monthly</TH><TH className="text-right">Annual</TH></TR>
                </THead>
                <TBody>
                  {preview.components.map((line) => (
                    <TR key={`${line.code}-${line.type}`}>
                      <TD>{line.code}</TD>
                      <TD>{line.name}</TD>
                      <TD><Badge variant="outline">{line.type}</Badge></TD>
                      <TD className="text-right tabular-nums">{formatINR(line.monthly)}</TD>
                      <TD className="text-right tabular-nums">{formatINR(line.annual)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => controlled ? onClose?.() : setOpen(false)}>Cancel</Button>
          <Button disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving...' : 'Save structure'}
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

function cloneComponents(components: SalaryComponent[]): SalaryComponent[] {
  return components
    .map((component, index) => ({
      name: component.name,
      code: component.code,
      type: component.type,
      calculationType: component.calculationType,
      value: Number(component.value),
      isTaxable: component.isTaxable,
      isStatutory: component.isStatutory,
      statutoryType: component.statutoryType,
      sequence: component.sequence ?? index + 1,
    }))
    .sort((a, b) => a.sequence - b.sequence);
}
