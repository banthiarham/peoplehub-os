'use client';

import { FormEvent, useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Briefcase, CheckCircle2, Send } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { OpsTextarea } from '@/components/forms/ops-textarea';

interface PublicJob {
  id: string;
  title: string;
  openings: number;
  jobDescription?: string | null;
  requirements?: string | null;
  type: string;
}

interface CareersPayload {
  tenant: { name: string; slug: string; brandColor?: string | null };
  jobs: PublicJob[];
}

const emptyForm = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  expectedCTC: '',
  notes: '',
};

export default function CareersPage() {
  const params = useParams<{ tenantSlug: string }>();
  const tenantSlug = params.tenantSlug;
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data, isLoading } = useQuery<CareersPayload>({
    queryKey: ['careers', tenantSlug],
    queryFn: () => api.get(`/recruitment/public/${tenantSlug}/jobs`).then((r) => r.data),
  });

  const apply = useMutation({
    mutationFn: () =>
      api.post(`/recruitment/public/${tenantSlug}/jobs/${selectedJob}/apply`, {
        ...form,
        expectedCTC: form.expectedCTC ? Number(form.expectedCTC) : undefined,
      }),
    onSuccess: () => setForm(emptyForm),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (selectedJob) apply.mutate();
  };

  const selected = data?.jobs.find((job) => job.id === selectedJob) ?? data?.jobs[0];

  return (
    <main className="min-h-screen bg-canvas text-ink">
      <section
        className="border-b border-line"
        style={{ borderTop: `6px solid ${data?.tenant.brandColor ?? '#2F6D5C'}` }}
      >
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 sm:px-6">
          <div className="flex items-center gap-2 text-sm font-medium text-ink-muted">
            <Briefcase className="h-4 w-4" />
            Careers
          </div>
          <h1 className="text-3xl font-semibold tracking-normal sm:text-4xl">
            {data?.tenant.name ?? 'PeopleHub OS'} open roles
          </h1>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          {isLoading ? (
            [...Array(4)].map((_, index) => <Skeleton key={index} className="h-36" />)
          ) : data?.jobs.length ? (
            data.jobs.map((job) => (
              <Card
                key={job.id}
                className={`cursor-pointer p-0 ${selected?.id === job.id ? 'border-primary-500' : ''}`}
                onClick={() => setSelectedJob(job.id)}
              >
                <CardHeader>
                  <CardTitle className="flex items-start justify-between gap-3">
                    <span>{job.title}</span>
                    <span className="shrink-0 rounded border border-line px-2 py-1 text-xs font-medium text-ink-muted">
                      {job.openings} opening{job.openings === 1 ? '' : 's'}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-ink-muted">
                  <p>{job.jobDescription ?? 'Role details will be shared by the hiring team.'}</p>
                  {job.requirements && <p>{job.requirements}</p>}
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="py-10 text-center text-sm text-ink-muted">
                No open roles are currently published.
              </CardContent>
            </Card>
          )}
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>{selected ? `Apply for ${selected.title}` : 'Application'}</CardTitle>
          </CardHeader>
          <CardContent>
            {apply.isSuccess ? (
              <div className="space-y-3 text-sm">
                <CheckCircle2 className="h-8 w-8 text-success" />
                <p className="font-medium">Application submitted.</p>
                <p className="text-ink-muted">The recruiting team can now review it in the hiring pipeline.</p>
                <Button variant="outline" onClick={() => apply.reset()}>
                  Submit another
                </Button>
              </div>
            ) : (
              <form className="space-y-3" onSubmit={submit}>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                  <Input
                    value={form.firstName}
                    onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))}
                    placeholder="First name"
                    required
                  />
                  <Input
                    value={form.lastName}
                    onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))}
                    placeholder="Last name"
                    required
                  />
                </div>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder="Email"
                  required
                />
                <Input
                  value={form.phone}
                  onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                  placeholder="Phone"
                />
                <Input
                  type="number"
                  value={form.expectedCTC}
                  onChange={(e) => setForm((prev) => ({ ...prev, expectedCTC: e.target.value }))}
                  placeholder="Expected CTC"
                />
                <OpsTextarea
                  value={form.notes}
                  onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Portfolio, notice period, or a short note"
                  rows={4}
                />
                <Button className="w-full" disabled={!selected || apply.isPending}>
                  <Send className="h-4 w-4" />
                  {apply.isPending ? 'Submitting...' : 'Submit application'}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
