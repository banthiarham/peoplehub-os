'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Building2,
  Download,
  Edit3,
  FileText,
  Mail,
  MapPin,
  Phone,
  Send,
  Smartphone,
  Users,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { EmployeeSendEmailDialog } from '@/components/forms/employee-send-email-dialog';
import { PeopleAddDocumentDialog } from '@/components/forms/people-add-document-dialog';
import { Avatar } from '@/components/ui/avatar';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Select } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toaster';

type OptionItem = { id: string; name: string };
type ManagerOption = { id: string; firstName: string; lastName: string };
type EmployeeOptions = {
  departments?: OptionItem[];
  designations?: OptionItem[];
  locations?: OptionItem[];
  legalEntities?: OptionItem[];
  costCenters?: OptionItem[];
  businessUnits?: OptionItem[];
  managers?: ManagerOption[];
};

const editInitial = {
  firstName: '',
  lastName: '',
  workEmail: '',
  phone: '',
  joiningDate: '',
  departmentId: '',
  designationId: '',
  locationId: '',
  legalEntityId: '',
  costCenterId: '',
  businessUnitId: '',
  managerId: '',
  employmentType: '',
  pan: '',
  aadhaar: '',
  uan: '',
  esicNumber: '',
  taxRegime: '',
};

interface DocumentRow {
  id: string;
  type: string;
  name: string;
  fileKey: string;
  isVerified: boolean;
  createdAt: string;
}

interface EmailLogRow {
  id: string;
  subject: string;
  to: string[];
  status: string;
  sentAt: string | null;
  createdAt: string;
}

interface DeviceRow {
  deviceName: string | null;
  platform: string | null;
  registeredAt: string;
  lastSeenAt: string;
}

export default function EmployeeProfilePage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState(editInitial);
  const { data: e, isLoading } = useQuery({
    queryKey: ['employees', id],
    queryFn: () => api.get(`/employees/${id}`).then((r) => r.data),
  });
  const { data: options } = useQuery<EmployeeOptions>({
    queryKey: ['employees', 'options'],
    queryFn: () => api.get('/employees/meta/options').then((r) => r.data),
    enabled: editOpen,
  });
  const { data: documents } = useQuery<DocumentRow[]>({
    queryKey: ['employees', id, 'documents'],
    queryFn: () => api.get(`/employees/${id}/documents`).then((r) => r.data),
    enabled: !!id,
  });
  const { data: device } = useQuery<DeviceRow | null>({
    queryKey: ['employees', id, 'device'],
    queryFn: () => api.get(`/attendance/device/${id}`).then((r) => r.data ?? null),
    enabled: !!id,
  });
  const { data: emailHistory } = useQuery<EmailLogRow[]>({
    queryKey: ['employees', id, 'email-history'],
    queryFn: () => api.get(`/email/employee/${id}/history`).then((r) => r.data),
    enabled: !!id,
  });
  const resetDevice = useMutation({
    mutationFn: () => api.delete(`/attendance/device/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees', id, 'device'] });
      toast('Device binding reset — their next punch registers a new device');
    },
    onError: () => toast('Could not reset device binding', 'error'),
  });
  const updateEmployee = useMutation({
    mutationFn: () => {
      const payload = Object.fromEntries(Object.entries(editForm).filter(([, value]) => value !== ''));
      return api.patch(`/employees/${id}`, payload).then((r) => r.data);
    },
    onSuccess: () => {
      toast('Employee details updated');
      setEditOpen(false);
      queryClient.invalidateQueries({ queryKey: ['employees', id] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
    onError: () => toast('Could not update employee details', 'error'),
  });

  useEffect(() => {
    if (!e) return;
    setEditForm({
      firstName: e.firstName ?? '',
      lastName: e.lastName ?? '',
      workEmail: e.workEmail ?? '',
      phone: e.phone ?? '',
      joiningDate: toDateInput(e.joiningDate),
      departmentId: e.departmentId ?? e.department?.id ?? '',
      designationId: e.designationId ?? e.designation?.id ?? '',
      locationId: e.locationId ?? e.location?.id ?? '',
      legalEntityId: e.legalEntityId ?? e.legalEntity?.id ?? '',
      costCenterId: e.costCenterId ?? e.costCenter?.id ?? '',
      businessUnitId: e.businessUnitId ?? e.businessUnit?.id ?? '',
      managerId: e.managerId ?? e.manager?.id ?? '',
      employmentType: e.employmentType ?? '',
      pan: e.pan ?? '',
      aadhaar: e.aadhaar ?? '',
      uan: e.uan ?? '',
      esicNumber: e.esicNumber ?? '',
      taxRegime: e.taxRegime ?? '',
    });
  }, [e]);

  if (isLoading || !e) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  const name = `${e.firstName} ${e.lastName}`;

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="flex flex-wrap items-center gap-5">
          <Avatar name={name} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-semibold">{name}</h1>
              <Badge variant={statusVariant(e.status)}>{e.status.replace(/_/g, ' ')}</Badge>
            </div>
            <p className="mt-0.5 text-sm text-ink-muted">
              {e.designation?.name ?? '—'} · {e.department?.name ?? '—'} · {e.employeeCode}
            </p>
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-ink-muted">
              <span className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" /> {e.workEmail ?? '—'}
              </span>
              <span className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" /> {e.phone ?? '—'}
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" /> {e.location?.name ?? '—'}
              </span>
              <span className="flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" /> {e.legalEntity?.name ?? '—'}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Edit3 className="h-4 w-4" /> Edit details
            </Button>
            <EmployeeSendEmailDialog employeeId={id} employeeName={name} workEmail={e.workEmail} />
          </div>
        </div>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit employee details</DialogTitle>
            <DialogDescription>Update the employee master record. Sensitive ID changes stay audited.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              updateEmployee.mutate();
            }}
            className="space-y-5"
          >
            <div>
              <p className="mb-3 text-sm font-semibold text-ink">Identity</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <Input value={editForm.firstName} onChange={(event) => setEditFormValue('firstName', event.target.value, setEditForm)} placeholder="First name" required />
                <Input value={editForm.lastName} onChange={(event) => setEditFormValue('lastName', event.target.value, setEditForm)} placeholder="Last name" required />
                <Input value={editForm.workEmail} onChange={(event) => setEditFormValue('workEmail', event.target.value, setEditForm)} placeholder="Work email" type="email" />
                <Input value={editForm.phone} onChange={(event) => setEditFormValue('phone', event.target.value, setEditForm)} placeholder="Phone" />
                <Input value={editForm.joiningDate} onChange={(event) => setEditFormValue('joiningDate', event.target.value, setEditForm)} type="date" />
              </div>
            </div>

            <div>
              <p className="mb-3 text-sm font-semibold text-ink">Organization</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <OptionSelect value={editForm.departmentId} onChange={(value) => setEditFormValue('departmentId', value, setEditForm)} items={options?.departments} placeholder="Department" />
                <OptionSelect value={editForm.designationId} onChange={(value) => setEditFormValue('designationId', value, setEditForm)} items={options?.designations} placeholder="Designation" />
                <OptionSelect value={editForm.locationId} onChange={(value) => setEditFormValue('locationId', value, setEditForm)} items={options?.locations} placeholder="Location" />
                <OptionSelect value={editForm.legalEntityId} onChange={(value) => setEditFormValue('legalEntityId', value, setEditForm)} items={options?.legalEntities} placeholder="Legal entity" />
                <OptionSelect value={editForm.costCenterId} onChange={(value) => setEditFormValue('costCenterId', value, setEditForm)} items={options?.costCenters} placeholder="Cost center" />
                <OptionSelect value={editForm.businessUnitId} onChange={(value) => setEditFormValue('businessUnitId', value, setEditForm)} items={options?.businessUnits} placeholder="Business unit" />
                <ManagerSelect value={editForm.managerId} onChange={(value) => setEditFormValue('managerId', value, setEditForm)} items={options?.managers} />
                <Select value={editForm.employmentType} onChange={(event) => setEditFormValue('employmentType', event.target.value, setEditForm)}>
                  <option value="">Employment type</option>
                  <option value="FULL_TIME">Full time</option>
                  <option value="PART_TIME">Part time</option>
                  <option value="CONTRACTOR">Contractor</option>
                  <option value="INTERN">Intern</option>
                  <option value="CONSULTANT">Consultant</option>
                </Select>
              </div>
            </div>

            <div>
              <p className="mb-3 text-sm font-semibold text-ink">Statutory and tax</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <Input value={editForm.pan} onChange={(event) => setEditFormValue('pan', event.target.value.toUpperCase(), setEditForm)} placeholder="PAN" />
                <Input value={editForm.aadhaar} onChange={(event) => setEditFormValue('aadhaar', event.target.value, setEditForm)} placeholder="Aadhaar" />
                <Input value={editForm.uan} onChange={(event) => setEditFormValue('uan', event.target.value, setEditForm)} placeholder="UAN" />
                <Input value={editForm.esicNumber} onChange={(event) => setEditFormValue('esicNumber', event.target.value, setEditForm)} placeholder="ESIC number" />
                <Select value={editForm.taxRegime} onChange={(event) => setEditFormValue('taxRegime', event.target.value, setEditForm)}>
                  <option value="">Tax regime</option>
                  <option value="NEW">New</option>
                  <option value="OLD">Old</option>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={updateEmployee.isPending || !editForm.firstName.trim() || !editForm.lastName.trim()}>
                {updateEmployee.isPending ? 'Saving...' : 'Save changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Work details</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              <Field label="Joined" value={formatDate(e.joiningDate)} />
              <Field label="Confirmation" value={formatDate(e.confirmationDate)} />
              <Field label="Probation end" value={formatDate(e.probationEndDate)} />
              <Field label="Employment type" value={e.employmentType?.replace(/_/g, ' ')} />
              <Field label="Work mode" value={e.workMode} />
              <Field label="Notice period" value={e.noticePeriodDays ? `${e.noticePeriodDays} days` : '—'} />
              <Field
                label="Reporting manager"
                value={e.manager ? `${e.manager.firstName} ${e.manager.lastName}` : '—'}
              />
              <Field
                label="Dotted-line manager"
                value={e.dottedManager ? `${e.dottedManager.firstName} ${e.dottedManager.lastName}` : '—'}
              />
              <Field label="Legal entity" value={e.legalEntity?.name ?? '—'} />
              <Field label="Cost center" value={e.costCenter?.name ?? '—'} />
              <Field label="Business unit" value={e.businessUnit?.name ?? '—'} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Personal, statutory and tax</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              <Field label="Preferred name" value={e.preferredName ?? '—'} />
              <Field label="Personal email" value={e.personalEmail ?? '—'} />
              <Field label="Date of birth" value={formatDate(e.dateOfBirth)} />
              <Field label="Gender" value={e.gender ?? '—'} />
              <Field label="Marital status" value={e.maritalStatus ?? '—'} />
              <Field label="Blood group" value={e.bloodGroup ?? '—'} />
              <Field label="PAN" value={e.pan ?? '—'} />
              <Field label="Aadhaar" value={e.aadhaar ?? '—'} />
              <Field label="UAN" value={e.uan ?? '—'} />
              <Field label="ESIC" value={e.esicNumber ?? '—'} />
              <Field label="Tax regime" value={e.taxRegime} />
              <Field label="Bank details" value={summarizeObject(e.bankDetails)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Lifecycle timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {e.lifecycleEvents?.length ? (
                <ol className="relative space-y-4 border-l border-line pl-5">
                  {e.lifecycleEvents.map(
                    (ev: {
                      id: string;
                      eventType: string;
                      effectiveDate: string;
                      remarks: string | null;
                    }) => (
                      <li key={ev.id} className="relative">
                        <span className="absolute -left-[26px] top-1 h-2.5 w-2.5 rounded-full bg-primary-500" />
                        <p className="text-sm font-medium">{ev.eventType.replace(/_/g, ' ')}</p>
                        <p className="text-xs text-ink-muted">
                          {formatDate(ev.effectiveDate)}
                          {ev.remarks ? ` — ${ev.remarks}` : ''}
                        </p>
                      </li>
                    ),
                  )}
                </ol>
              ) : (
                <p className="text-sm text-ink-muted">No lifecycle events recorded.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary-600" /> Direct reports (
                {e.directReports?.length ?? 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {e.directReports?.length ? (
                e.directReports.map(
                  (r: {
                    id: string;
                    firstName: string;
                    lastName: string;
                    designation: { name: string } | null;
                  }) => (
                    <div key={r.id} className="flex items-center gap-3">
                      <Avatar name={`${r.firstName} ${r.lastName}`} size="sm" />
                      <div>
                        <p className="text-sm font-medium">
                          {r.firstName} {r.lastName}
                        </p>
                        <p className="text-xs text-ink-muted">{r.designation?.name ?? '—'}</p>
                      </div>
                    </div>
                  ),
                )
              ) : (
                <p className="text-sm text-ink-muted">No direct reports.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary-600" /> Documents (
                {documents?.length ?? 0})
              </CardTitle>
              <PeopleAddDocumentDialog employeeId={id} />
            </CardHeader>
            <CardContent className="space-y-3">
              {documents?.length ? (
                documents.map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{d.name}</p>
                      <p className="text-xs text-ink-muted">
                        {d.type} · {formatDate(d.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge variant={d.isVerified ? 'success' : 'outline'}>
                        {d.isVerified ? 'Verified' : 'Unverified'}
                      </Badge>
                      {d.fileKey.includes('/') && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          aria-label={`Download ${d.name}`}
                          onClick={async () => {
                            try {
                              const { url } = await api
                                .get('/files/download-url', { params: { key: d.fileKey } })
                                .then((r) => r.data);
                              window.open(url, '_blank');
                            } catch {
                              toast('Download failed — file not found in storage', 'error');
                            }
                          }}
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-ink-muted">No documents on file.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-primary-600" /> Punch device
              </CardTitle>
            </CardHeader>
            <CardContent>
              {device ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-medium">
                      {device.deviceName ?? 'Registered device'}
                    </p>
                    <p className="text-xs text-ink-muted">
                      Registered {formatDate(device.registeredAt)} · last punch{' '}
                      {formatDate(device.lastSeenAt)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-danger"
                    disabled={resetDevice.isPending}
                    onClick={() => resetDevice.mutate()}
                  >
                    {resetDevice.isPending ? 'Resetting…' : 'Reset device binding'}
                  </Button>
                  <p className="text-[11px] text-ink-faint">
                    Attendance punches only work from this device. Reset if they changed phones —
                    their next punch registers the new one.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-ink-muted">
                  No punch device registered yet — their first check-in binds one.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-4 w-4 text-primary-600" /> Emails ({emailHistory?.length ?? 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {emailHistory?.length ? (
                emailHistory.map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{m.subject || '(no subject)'}</p>
                      <p className="text-xs text-ink-muted">
                        {formatDate(m.sentAt ?? m.createdAt)}
                      </p>
                    </div>
                    <Badge variant={statusVariant(m.status)}>{m.status}</Badge>
                  </div>
                ))
              ) : (
                <p className="text-sm text-ink-muted">No emails sent yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="mt-0.5 font-medium">{value}</p>
    </div>
  );
}

function summarizeObject(value: unknown) {
  if (!value || typeof value !== 'object') return '—';
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .slice(0, 3);
  return entries.length ? entries.map(([key, v]) => `${key}: ${String(v)}`).join(' · ') : '—';
}

function toDateInput(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function setEditFormValue(
  key: keyof typeof editInitial,
  value: string,
  setEditForm: React.Dispatch<React.SetStateAction<typeof editInitial>>,
) {
  setEditForm((current) => ({ ...current, [key]: value }));
}

function OptionSelect({
  value,
  onChange,
  items,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  items?: OptionItem[];
  placeholder: string;
}) {
  return (
    <Select value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">{placeholder}</option>
      {items?.map((item) => (
        <option key={item.id} value={item.id}>{item.name}</option>
      ))}
    </Select>
  );
}

function ManagerSelect({
  value,
  onChange,
  items,
}: {
  value: string;
  onChange: (value: string) => void;
  items?: ManagerOption[];
}) {
  return (
    <Select value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">Reporting manager</option>
      {items?.map((manager) => (
        <option key={manager.id} value={manager.id}>{manager.firstName} {manager.lastName}</option>
      ))}
    </Select>
  );
}
