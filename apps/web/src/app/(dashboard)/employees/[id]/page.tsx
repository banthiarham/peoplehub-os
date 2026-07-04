'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { Building2, FileText, Mail, MapPin, Phone, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { PeopleAddDocumentDialog } from '@/components/forms/people-add-document-dialog';
import { Avatar } from '@/components/ui/avatar';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface DocumentRow {
  id: string;
  type: string;
  name: string;
  isVerified: boolean;
  createdAt: string;
}

export default function EmployeeProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { data: e, isLoading } = useQuery({
    queryKey: ['employees', id],
    queryFn: () => api.get(`/employees/${id}`).then((r) => r.data),
  });
  const { data: documents } = useQuery<DocumentRow[]>({
    queryKey: ['employees', id, 'documents'],
    queryFn: () => api.get(`/employees/${id}/documents`).then((r) => r.data),
    enabled: !!id,
  });

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
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Work details</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              <Field label="Joined" value={formatDate(e.joiningDate)} />
              <Field label="Employment type" value={e.employmentType?.replace(/_/g, ' ')} />
              <Field label="Work mode" value={e.workMode} />
              <Field
                label="Reporting manager"
                value={e.manager ? `${e.manager.firstName} ${e.manager.lastName}` : '—'}
              />
              <Field label="PAN" value={e.pan ?? '—'} />
              <Field label="Tax regime" value={e.taxRegime} />
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
                    <Badge variant={d.isVerified ? 'success' : 'outline'}>
                      {d.isVerified ? 'Verified' : 'Unverified'}
                    </Badge>
                  </div>
                ))
              ) : (
                <p className="text-sm text-ink-muted">No documents on file.</p>
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
