'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Layers3, Landmark, Pencil, Plus, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Select } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useToast } from '@/components/ui/toaster';

type UnitKind = 'departments' | 'designations' | 'cost-centers' | 'business-units';

interface TenantSummary {
  id: string;
  name: string;
  legalName: string | null;
  country: string;
  industry: string | null;
  companySize: string | null;
  billingPlan: string;
  status: string;
  timezone: string;
  currency: string;
  brandColor: string | null;
  logoUrl: string | null;
  primaryAdmin: { name: string | null; email: string } | null;
  counts: Record<string, number>;
}

interface LegalEntity {
  id: string;
  name: string;
  legalName: string | null;
  pan: string | null;
  tan: string | null;
  gstin: string | null;
  state: string | null;
  country: string;
  employees: number;
}

interface OrgUnit {
  id: string;
  name: string;
  code: string | null;
  grade?: string | null;
  level?: number | null;
  isActive: boolean;
  employees: number;
}

const unitMeta: Array<{ kind: UnitKind; label: string }> = [
  { kind: 'departments', label: 'Departments' },
  { kind: 'designations', label: 'Designations' },
  { kind: 'cost-centers', label: 'Cost centers' },
  { kind: 'business-units', label: 'Business units' },
];

function apiError(err: unknown) {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Request failed');
}

export function OrganizationAdmin() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [tenantForm, setTenantForm] = useState<Record<string, string>>({});

  const { data: tenant, isLoading } = useQuery<TenantSummary>({
    queryKey: ['organization'],
    queryFn: () => api.get('/organization').then((r) => r.data),
  });

  useEffect(() => {
    if (tenant) {
      setTenantForm({
        name: tenant.name ?? '',
        legalName: tenant.legalName ?? '',
        country: tenant.country ?? 'IN',
        industry: tenant.industry ?? '',
        companySize: tenant.companySize ?? '',
        billingPlan: tenant.billingPlan ?? '',
        timezone: tenant.timezone ?? '',
        currency: tenant.currency ?? '',
        brandColor: tenant.brandColor ?? '',
        logoUrl: tenant.logoUrl ?? '',
      });
    }
  }, [tenant]);

  const saveTenant = useMutation({
    mutationFn: () =>
      api.patch('/organization', Object.fromEntries(Object.entries(tenantForm).filter(([, v]) => v !== ''))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization'] });
      toast('Company settings saved');
    },
    onError: (err) => toast(apiError(err), 'error'),
  });

  if (isLoading) return <Skeleton className="h-96 lg:col-span-2" />;

  return (
    <>
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary-600" /> Company settings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-4">
            <Labeled label="Company">
              <Input value={tenantForm.name ?? ''} onChange={setTenant('name')} />
            </Labeled>
            <Labeled label="Legal name">
              <Input value={tenantForm.legalName ?? ''} onChange={setTenant('legalName')} />
            </Labeled>
            <Labeled label="Country">
              <Input value={tenantForm.country ?? ''} onChange={setTenant('country')} />
            </Labeled>
            <Labeled label="Currency">
              <Input value={tenantForm.currency ?? ''} onChange={setTenant('currency')} />
            </Labeled>
            <Labeled label="Industry">
              <Input value={tenantForm.industry ?? ''} onChange={setTenant('industry')} />
            </Labeled>
            <Labeled label="Company size">
              <Input value={tenantForm.companySize ?? ''} onChange={setTenant('companySize')} />
            </Labeled>
            <Labeled label="Billing plan">
              <Input value={tenantForm.billingPlan ?? ''} onChange={setTenant('billingPlan')} />
            </Labeled>
            <Labeled label="Timezone">
              <Input value={tenantForm.timezone ?? ''} onChange={setTenant('timezone')} />
            </Labeled>
            <Labeled label="Brand color">
              <Input value={tenantForm.brandColor ?? ''} onChange={setTenant('brandColor')} />
            </Labeled>
            <Labeled label="Logo URL">
              <Input value={tenantForm.logoUrl ?? ''} onChange={setTenant('logoUrl')} />
            </Labeled>
            <div className="flex items-end gap-3 md:col-span-2">
              <Button onClick={() => saveTenant.mutate()} disabled={saveTenant.isPending}>
                <Save className="h-4 w-4" /> Save company
              </Button>
              <div className="text-xs text-ink-muted">
                Primary admin:{' '}
                <span className="font-medium text-ink">
                  {tenant?.primaryAdmin?.name ?? tenant?.primaryAdmin?.email ?? 'Not assigned'}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <LegalEntitiesCard />

      {unitMeta.map((u) => (
        <OrgUnitCard key={u.kind} kind={u.kind} label={u.label} />
      ))}
    </>
  );

  function setTenant(key: string) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setTenantForm((f) => ({ ...f, [key]: e.target.value }));
  }
}

function LegalEntitiesCard() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<LegalEntity | 'new' | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const { data, isLoading } = useQuery<LegalEntity[]>({
    queryKey: ['legal-entities'],
    queryFn: () => api.get('/legal-entities').then((r) => r.data),
  });

  const save = useMutation({
    mutationFn: () => {
      const payload = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== ''));
      return editing === 'new'
        ? api.post('/legal-entities', payload)
        : api.patch(`/legal-entities/${(editing as LegalEntity).id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['legal-entities'] });
      toast(editing === 'new' ? 'Legal entity created' : 'Legal entity updated');
      setEditing(null);
    },
    onError: (err) => toast(apiError(err), 'error'),
  });

  const open = (entity: LegalEntity | 'new') => {
    setEditing(entity);
    setForm(
      entity === 'new'
        ? { country: 'IN' }
        : {
            name: entity.name,
            legalName: entity.legalName ?? '',
            pan: entity.pan ?? '',
            tan: entity.tan ?? '',
            gstin: entity.gstin ?? '',
            state: entity.state ?? '',
            country: entity.country,
          },
    );
  };

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Landmark className="h-4 w-4 text-primary-600" /> Legal entities
        </CardTitle>
        <Button size="sm" onClick={() => open('new')}>
          <Plus className="h-3.5 w-3.5" /> New entity
        </Button>
      </CardHeader>
      {isLoading ? (
        <Skeleton className="m-4 h-28" />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Entity</TH>
              <TH>PAN / TAN</TH>
              <TH>GSTIN</TH>
              <TH className="text-right">Employees</TH>
              <TH></TH>
            </TR>
          </THead>
          <TBody>
            {data?.map((entity) => (
              <TR key={entity.id}>
                <TD>
                  <span className="block font-medium">{entity.name}</span>
                  <span className="text-xs text-ink-muted">{entity.legalName ?? entity.state ?? '—'}</span>
                </TD>
                <TD className="text-ink-muted">{[entity.pan, entity.tan].filter(Boolean).join(' / ') || '—'}</TD>
                <TD className="text-ink-muted">{entity.gstin ?? '—'}</TD>
                <TD className="text-right tabular-nums">{entity.employees}</TD>
                <TD className="text-right">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => open(entity)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      <EntityDialog editing={editing} setEditing={setEditing} form={form} setForm={setForm} save={() => save.mutate()} pending={save.isPending} />
    </Card>
  );
}

function OrgUnitCard({ kind, label }: { kind: UnitKind; label: string }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<OrgUnit | 'new' | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const { data, isLoading } = useQuery<OrgUnit[]>({
    queryKey: [kind],
    queryFn: () => api.get(`/${kind}`).then((r) => r.data),
  });
  const save = useMutation({
    mutationFn: () => {
      const payload = {
        ...Object.fromEntries(Object.entries(form).filter(([, v]) => v !== '')),
        ...(form.level ? { level: Number(form.level) } : {}),
        ...(form.isActive ? { isActive: form.isActive === 'true' } : {}),
      };
      return editing === 'new' ? api.post(`/${kind}`, payload) : api.patch(`/${kind}/${(editing as OrgUnit).id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [kind] });
      queryClient.invalidateQueries({ queryKey: ['employees', 'options'] });
      toast(editing === 'new' ? `${label.slice(0, -1)} created` : `${label.slice(0, -1)} updated`);
      setEditing(null);
    },
    onError: (err) => toast(apiError(err), 'error'),
  });
  const open = (unit: OrgUnit | 'new') => {
    setEditing(unit);
    setForm(
      unit === 'new'
        ? { isActive: 'true' }
        : {
            name: unit.name,
            code: unit.code ?? '',
            grade: unit.grade ?? '',
            level: unit.level ? String(unit.level) : '',
            isActive: String(unit.isActive),
          },
    );
  };
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Layers3 className="h-4 w-4 text-primary-600" /> {label}
        </CardTitle>
        <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => open('new')}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <Skeleton className="h-32" />
        ) : (
          data?.slice(0, 8).map((unit) => (
            <div key={unit.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
              <div>
                <p className="text-sm font-medium">{unit.name}</p>
                <p className="text-xs text-ink-muted">
                  {unit.code ?? 'No code'} · {unit.employees} employees
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={unit.isActive ? 'success' : 'outline'}>{unit.isActive ? 'Active' : 'Off'}</Badge>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => open(unit)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
      <UnitDialog kind={kind} label={label} editing={editing} setEditing={setEditing} form={form} setForm={setForm} save={() => save.mutate()} pending={save.isPending} />
    </Card>
  );
}

function EntityDialog(props: {
  editing: LegalEntity | 'new' | null;
  setEditing: (v: LegalEntity | 'new' | null) => void;
  form: Record<string, string>;
  setForm: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  save: () => void;
  pending: boolean;
}) {
  return (
    <Dialog open={props.editing !== null} onOpenChange={(open) => !open && props.setEditing(null)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{props.editing === 'new' ? 'New legal entity' : 'Edit legal entity'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {['name', 'legalName', 'pan', 'tan', 'gstin', 'state', 'country'].map((key) => (
            <Labeled key={key} label={key}>
              <Input value={props.form[key] ?? ''} onChange={(e) => props.setForm((f) => ({ ...f, [key]: e.target.value }))} />
            </Labeled>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => props.setEditing(null)}>Cancel</Button>
          <Button onClick={props.save} disabled={!props.form.name || props.pending}>{props.pending ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UnitDialog(props: {
  kind: UnitKind;
  label: string;
  editing: OrgUnit | 'new' | null;
  setEditing: (v: OrgUnit | 'new' | null) => void;
  form: Record<string, string>;
  setForm: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  save: () => void;
  pending: boolean;
}) {
  return (
    <Dialog open={props.editing !== null} onOpenChange={(open) => !open && props.setEditing(null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{props.editing === 'new' ? `New ${props.label.toLowerCase().slice(0, -1)}` : `Edit ${props.label.toLowerCase().slice(0, -1)}`}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <Labeled label="Name">
            <Input value={props.form.name ?? ''} onChange={(e) => props.setForm((f) => ({ ...f, name: e.target.value }))} />
          </Labeled>
          <Labeled label="Code">
            <Input value={props.form.code ?? ''} onChange={(e) => props.setForm((f) => ({ ...f, code: e.target.value }))} />
          </Labeled>
          {props.kind === 'designations' && (
            <div className="grid grid-cols-2 gap-3">
              <Labeled label="Grade">
                <Input value={props.form.grade ?? ''} onChange={(e) => props.setForm((f) => ({ ...f, grade: e.target.value }))} />
              </Labeled>
              <Labeled label="Level">
                <Input type="number" value={props.form.level ?? ''} onChange={(e) => props.setForm((f) => ({ ...f, level: e.target.value }))} />
              </Labeled>
            </div>
          )}
          <Labeled label="Status">
            <Select value={props.form.isActive ?? 'true'} onChange={(e) => props.setForm((f) => ({ ...f, isActive: e.target.value }))}>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </Select>
          </Labeled>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => props.setEditing(null)}>Cancel</Button>
          <Button onClick={props.save} disabled={!props.form.name || props.pending}>{props.pending ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium text-ink-muted capitalize">{label}</span>
      {children}
    </label>
  );
}
