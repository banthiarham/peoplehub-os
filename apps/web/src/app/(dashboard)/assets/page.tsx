'use client';

import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Laptop, Package, Upload } from 'lucide-react';
import { api } from '@/lib/api';
import { formatINR, formatDate } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { OpsTextarea } from '@/components/forms/ops-textarea';

type Option = { id: string; firstName: string; lastName: string };

interface AssetRow {
  id: string;
  name: string;
  category: string;
  serialNumber: string | null;
  status: string;
  condition: string;
  purchaseCost: number | null;
  assignmentCount?: number;
  documentCount?: number;
  currentHolder: { firstName: string; lastName: string } | null;
}

interface AssetDetail {
  asset: { id: string; name: string; category: string; serialNumber: string | null; status: string; condition: string };
  assignments: Array<{
    id: string;
    assignedAt: string;
    returnedAt: string | null;
    condition: string | null;
    notes: string | null;
    employee: { id: string; firstName: string; lastName: string; employeeCode: string };
  }>;
  documents: Array<{ id: string; fileKey: string; fileName: string | null; mimeType: string | null; createdAt: string }>;
  currentHolder: { firstName: string; lastName: string } | null;
}

const conditions = ['NEW', 'GOOD', 'FAIR', 'DAMAGED', 'WRITTEN_OFF'];
const statuses = ['AVAILABLE', 'ASSIGNED', 'IN_REPAIR', 'RETIRED'];

const employeeName = (employee?: Option | { firstName?: string; lastName?: string }) =>
  `${employee?.firstName ?? ''} ${employee?.lastName ?? ''}`.trim() || 'Employee';

export default function AssetsPage() {
  const qc = useQueryClient();
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', category: 'LAPTOP', serialNumber: '', purchaseCost: '', condition: 'GOOD' });
  const [assignForm, setAssignForm] = useState({ employeeId: '', notes: '' });
  const [returnForm, setReturnForm] = useState({ condition: 'GOOD', notes: '' });
  const [documentForm, setDocumentForm] = useState({ fileKey: '', fileName: '', mimeType: 'application/pdf' });

  const { data: stats } = useQuery({ queryKey: ['assets', 'stats'], queryFn: () => api.get('/assets/stats').then((r) => r.data) });
  const { data: list } = useQuery({ queryKey: ['assets', 'list'], queryFn: () => api.get('/assets', { params: { pageSize: 50 } }).then((r) => r.data) });
  const { data: selected } = useQuery({
    queryKey: ['assets', 'detail', selectedAssetId],
    enabled: !!selectedAssetId,
    queryFn: () => api.get(`/assets/${selectedAssetId}`).then((r) => r.data as AssetDetail),
  });
  const { data: options } = useQuery({
    queryKey: ['employees', 'meta-options'],
    queryFn: () => api.get('/employees/meta/options').then((r) => r.data as { managers: Option[] }),
  });

  const employees = options?.managers ?? [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ['assets'] });
  const create = useMutation({
    mutationFn: () =>
      api.post('/assets', {
        ...form,
        purchaseCost: form.purchaseCost ? Number(form.purchaseCost) : undefined,
      }),
    onSuccess: () => {
      invalidate();
      setForm({ name: '', category: 'LAPTOP', serialNumber: '', purchaseCost: '', condition: 'GOOD' });
    },
  });
  const assign = useMutation({
    mutationFn: () => api.post(`/assets/${selectedAssetId}/assign`, { employeeId: assignForm.employeeId }),
    onSuccess: () => invalidate(),
  });
  const returnAsset = useMutation({
    mutationFn: () => api.post(`/assets/${selectedAssetId}/return`, { condition: returnForm.condition, notes: returnForm.notes || undefined }),
    onSuccess: () => invalidate(),
  });
  const addDocument = useMutation({
    mutationFn: () => api.post(`/assets/${selectedAssetId}/documents`, documentForm),
    onSuccess: () => invalidate(),
  });

  const submit = (event: FormEvent, fn: () => void) => {
    event.preventDefault();
    fn();
  };

  return (
    <div>
      <PageHeader title="Assets" description="Inventory, assignment history, documents and exit recovery" />
      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total assets" value={stats?.total ?? '—'} icon={Laptop} />
        <StatCard label="Assigned" value={stats?.assigned ?? '—'} />
        <StatCard label="Available" value={stats?.available ?? '—'} />
        <StatCard label="In repair" value={stats?.inRepair ?? '—'} icon={Package} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader><CardTitle>Add asset</CardTitle></CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={(e) => submit(e, () => create.mutate())}>
              <Input placeholder="Asset name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
              <div className="grid grid-cols-2 gap-2">
                <Select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                  <option>LAPTOP</option>
                  <option>MONITOR</option>
                  <option>PHONE</option>
                  <option>ACCESSORY</option>
                  <option>OTHER</option>
                </Select>
                <Select value={form.condition} onChange={(e) => setForm((f) => ({ ...f, condition: e.target.value }))}>
                  {conditions.map((item) => <option key={item}>{item}</option>)}
                </Select>
              </div>
              <Input placeholder="Serial number" value={form.serialNumber} onChange={(e) => setForm((f) => ({ ...f, serialNumber: e.target.value }))} />
              <Input type="number" placeholder="Purchase cost" value={form.purchaseCost} onChange={(e) => setForm((f) => ({ ...f, purchaseCost: e.target.value }))} />
              <Button className="w-full" disabled={create.isPending}>Create asset</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Asset inventory</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {list?.data?.length ? (
              <Table>
                <THead>
                  <TR>
                    <TH>Asset</TH>
                    <TH>Category</TH>
                    <TH>Serial</TH>
                    <TH>Cost</TH>
                    <TH>Holder</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {list.data.map((asset: AssetRow) => (
                    <TR key={asset.id} className="cursor-pointer" onClick={() => setSelectedAssetId(asset.id)}>
                      <TD className="font-medium">{asset.name}</TD>
                      <TD><Badge variant="outline">{asset.category}</Badge></TD>
                      <TD className="text-ink-muted">{asset.serialNumber ?? '—'}</TD>
                      <TD className="text-ink-muted">{asset.purchaseCost ? formatINR(asset.purchaseCost) : '—'}</TD>
                      <TD>
                        {asset.currentHolder ? (
                          <div className="flex items-center gap-2">
                            <Avatar name={`${asset.currentHolder.firstName} ${asset.currentHolder.lastName}`} size="sm" />
                            <span>{asset.currentHolder.firstName} {asset.currentHolder.lastName}</span>
                          </div>
                        ) : (
                          <span className="text-ink-faint">—</span>
                        )}
                      </TD>
                      <TD>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant={statusVariant(asset.status)}>{asset.status.replace(/_/g, ' ')}</Badge>
                          <Badge variant="outline">{asset.condition}</Badge>
                          <Badge variant="info">{asset.assignmentCount ?? 0} moves</Badge>
                          <Badge variant="warning">{asset.documentCount ?? 0} docs</Badge>
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            ) : (
              <div className="py-12 text-center text-sm text-ink-muted">No assets yet.</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Assign / return</CardTitle></CardHeader>
          <CardContent>
            {selected ? (
              <>
                <p className="text-sm font-medium">{selected.asset.name}</p>
                <p className="text-xs text-ink-muted">
                  {selected.asset.category} · {selected.asset.serialNumber ?? 'No serial'} · {selected.currentHolder ? `held by ${employeeName(selected.currentHolder)}` : 'available'}
                </p>
                <form className="mt-3 space-y-3" onSubmit={(e) => submit(e, () => assign.mutate())}>
                  <Select value={assignForm.employeeId} onChange={(e) => setAssignForm((f) => ({ ...f, employeeId: e.target.value }))}>
                    <option value="">Assign to employee</option>
                    {employees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employeeName(employee)}
                      </option>
                    ))}
                  </Select>
                  <Button className="w-full" type="submit" disabled={assign.isPending || !assignForm.employeeId}>
                    Assign asset
                  </Button>
                </form>
                <form className="mt-3 space-y-3" onSubmit={(e) => submit(e, () => returnAsset.mutate())}>
                  <Select value={returnForm.condition} onChange={(e) => setReturnForm((f) => ({ ...f, condition: e.target.value }))}>
                    {conditions.map((item) => <option key={item}>{item}</option>)}
                  </Select>
                  <OpsTextarea placeholder="Return notes" value={returnForm.notes} onChange={(e) => setReturnForm((f) => ({ ...f, notes: e.target.value }))} />
                  <Button className="w-full" type="submit" variant="outline" disabled={returnAsset.isPending}>
                    Return asset
                  </Button>
                </form>
              </>
            ) : (
              <div className="text-sm text-ink-muted">Select an asset from the inventory table.</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Asset documents</CardTitle></CardHeader>
          <CardContent>
            {selected ? (
              <>
                <form className="space-y-3" onSubmit={(e) => submit(e, () => addDocument.mutate())}>
                  <Input placeholder="File key" value={documentForm.fileKey} onChange={(e) => setDocumentForm((f) => ({ ...f, fileKey: e.target.value }))} required />
                  <Input placeholder="File name" value={documentForm.fileName} onChange={(e) => setDocumentForm((f) => ({ ...f, fileName: e.target.value }))} />
                  <Input placeholder="Mime type" value={documentForm.mimeType} onChange={(e) => setDocumentForm((f) => ({ ...f, mimeType: e.target.value }))} />
                  <Button className="w-full" type="submit" disabled={addDocument.isPending}>
                    <Upload className="h-4 w-4" /> Add document
                  </Button>
                </form>
                <div className="mt-4 space-y-2">
                  {selected.documents.map((doc) => (
                    <div key={doc.id} className="rounded-lg border border-line p-3">
                      <p className="text-sm font-medium">{doc.fileName ?? doc.fileKey}</p>
                      <p className="text-xs text-ink-muted">{doc.mimeType ?? 'Unknown mime'} · {formatDate(doc.createdAt)}</p>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-sm text-ink-muted">Select an asset to manage its documents.</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Assignment history</CardTitle></CardHeader>
          <CardContent>
            {selected ? (
              <div className="space-y-3">
                {selected.assignments.map((assignment) => (
                  <div key={assignment.id} className="rounded-lg border border-line p-3">
                    <div className="flex items-center gap-2">
                      <Avatar name={`${assignment.employee.firstName} ${assignment.employee.lastName}`} size="sm" />
                      <div>
                        <p className="text-sm font-medium">{assignment.employee.firstName} {assignment.employee.lastName}</p>
                        <p className="text-xs text-ink-muted">{assignment.employee.employeeCode}</p>
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-ink-muted">
                      Assigned {formatDate(assignment.assignedAt)} {assignment.returnedAt ? `· returned ${formatDate(assignment.returnedAt)}` : '· active'}
                    </p>
                    {assignment.condition && <Badge className="mt-2" variant="outline">{assignment.condition}</Badge>}
                    {assignment.notes && <p className="mt-2 text-sm text-ink-muted">{assignment.notes}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-ink-muted">Click an asset to see full history.</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
