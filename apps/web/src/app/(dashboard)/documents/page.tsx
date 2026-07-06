'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import {
  CheckCircle2,
  FileSignature,
  FileText,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

interface TemplateVersion {
  id: string;
  version: number;
  title: string;
  subject?: string | null;
  bodyHtml: string;
  bodyText?: string | null;
  createdAt: string;
}

interface DocumentTemplate {
  id: string;
  templateKey: string;
  name: string;
  module: string;
  documentType: string;
  title: string;
  subject?: string | null;
  bodyHtml: string;
  bodyText?: string | null;
  language: string;
  status: string;
  version: number;
  isMandatory: boolean;
  eSignatureRequired: boolean;
  variables: unknown;
  versions: TemplateVersion[];
}

interface GeneratedDocument {
  id: string;
  title: string;
  documentType: string;
  fileKey: string;
  fileName: string;
  downloadUrl?: string;
  version: number;
  createdAt: string;
  acknowledgedAt?: string | null;
  employee: { id: string; firstName: string; lastName: string; employeeCode: string } | null;
  template: { name: string; templateKey: string; documentType: string } | null;
}

interface CustomFormRow {
  id: string;
  name: string;
  description?: string | null;
  fields: Array<{ label: string; name: string; type: string; required?: boolean }>;
  isActive: boolean;
  updatedAt: string;
}

const templateInitialState = {
  templateKey: '',
  name: '',
  module: 'compliance',
  documentType: 'LETTER',
  title: '',
  subject: '',
  bodyHtml: '<p>Hello {{employee.firstName}} {{employee.lastName}},</p>',
  bodyText: '',
  language: 'en',
  isMandatory: false,
  eSignatureRequired: false,
  status: 'DRAFT',
};

export default function DocumentsPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const tenantId = session?.user?.tenant?.id;
  const sessionEmployeeId = session?.user?.employeeId ?? '';

  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [formState, setFormState] = useState(templateInitialState);
  const [generateEmployeeId, setGenerateEmployeeId] = useState(sessionEmployeeId);
  const [generateTemplateId, setGenerateTemplateId] = useState('');
  const [generateTitle, setGenerateTitle] = useState('');
  const [generateVars, setGenerateVars] = useState('{\n  "employee": {\n    "firstName": "",\n    "lastName": ""\n  }\n}');
  const [ackTemplateId, setAckTemplateId] = useState('');
  const [ackEmployeeId, setAckEmployeeId] = useState(sessionEmployeeId);
  const [ackComments, setAckComments] = useState('');
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formFields, setFormFields] = useState('[\n  {"label":"Full name","name":"fullName","type":"text","required":true}\n]');
  const [editingFormId, setEditingFormId] = useState<string | null>(null);

  const templatesQuery = useQuery({
    queryKey: ['documents', 'templates', tenantId],
    queryFn: () => api.get('/documents/templates').then((r) => r.data as DocumentTemplate[]),
    enabled: Boolean(tenantId),
  });

  const generatedQuery = useQuery({
    queryKey: ['documents', 'generated', tenantId],
    queryFn: () => api.get('/documents/generated').then((r) => r.data as GeneratedDocument[]),
    enabled: Boolean(tenantId),
  });

  const formsQuery = useQuery({
    queryKey: ['documents', 'forms', tenantId],
    queryFn: () => api.get('/documents/forms').then((r) => r.data as CustomFormRow[]),
    enabled: Boolean(tenantId),
  });

  const selectedTemplate = useMemo(
    () => templatesQuery.data?.find((template) => template.id === selectedTemplateId) ?? null,
    [templatesQuery.data, selectedTemplateId],
  );

  useEffect(() => {
    if (!selectedTemplate) return;
    setFormState({
      templateKey: selectedTemplate.templateKey,
      name: selectedTemplate.name,
      module: selectedTemplate.module,
      documentType: selectedTemplate.documentType,
      title: selectedTemplate.title,
      subject: selectedTemplate.subject ?? '',
      bodyHtml: selectedTemplate.bodyHtml,
      bodyText: selectedTemplate.bodyText ?? '',
      language: selectedTemplate.language,
      isMandatory: selectedTemplate.isMandatory,
      eSignatureRequired: selectedTemplate.eSignatureRequired,
      status: selectedTemplate.status,
    });
  }, [selectedTemplate]);

  useEffect(() => {
    if (!selectedTemplateId) return;
    if (!ackTemplateId) setAckTemplateId(selectedTemplateId);
  }, [selectedTemplateId, ackTemplateId]);

  const saveTemplate = useMutation({
    mutationFn: async () => {
      const payload = {
        ...formState,
        isMandatory: Boolean(formState.isMandatory),
        eSignatureRequired: Boolean(formState.eSignatureRequired),
      };
      if (selectedTemplateId) {
        return api.patch(`/documents/templates/${selectedTemplateId}`, payload);
      }
      return api.post('/documents/templates', payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['documents'] });
      setSelectedTemplateId(null);
      setFormState(templateInitialState);
    },
  });

  const cloneTemplate = useMutation({
    mutationFn: async (templateId: string) => api.post(`/documents/templates/${templateId}/clone`),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['documents'] }),
  });

  const generateDocument = useMutation({
    mutationFn: async () => {
      const vars = JSON.parse(generateVars || '{}');
      return api.post(`/documents/templates/${generateTemplateId}/generate`, {
        employeeId: generateEmployeeId,
        title: generateTitle || undefined,
        vars,
      });
    },
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['documents'] }),
  });

  const acknowledgePolicy = useMutation({
    mutationFn: async () => {
      const vars = JSON.parse(generateVars || '{}');
      return api.post(`/documents/templates/${ackTemplateId}/acknowledge`, {
        employeeId: ackEmployeeId || undefined,
        comments: ackComments || undefined,
        vars,
      });
    },
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['documents'] }),
  });

  const saveForm = useMutation({
    mutationFn: async () => {
      const fields = JSON.parse(formFields || '[]');
      const payload = {
        name: formName,
        description: formDescription || undefined,
        fields,
        isActive: true,
      };
      if (editingFormId) {
        return api.patch(`/documents/forms/${editingFormId}`, payload);
      }
      return api.post('/documents/forms', payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['documents', 'forms'] });
      setEditingFormId(null);
      setFormName('');
      setFormDescription('');
      setFormFields('[\n  {"label":"Full name","name":"fullName","type":"text","required":true}\n]');
    },
  });

  const deleteForm = useMutation({
    mutationFn: async (id: string) => api.delete(`/documents/forms/${id}`),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['documents', 'forms'] }),
  });

  if (templatesQuery.isLoading || generatedQuery.isLoading || formsQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-80" />
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  const templates = templatesQuery.data ?? [];
  const generated = generatedQuery.data ?? [];
  const forms = formsQuery.data ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Documents"
        description="Template-driven letters, policy acknowledgements and custom forms"
        actions={
          <Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ['documents'] })}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Templates" value={templates.length} icon={FileText}>
          <p className="text-xs text-ink-muted">Offer, appointment, review and policy letters</p>
        </StatCard>
        <StatCard label="Generated docs" value={generated.length} icon={FileSignature}>
          <p className="text-xs text-ink-muted">Stored in employee profile and file storage</p>
        </StatCard>
        <StatCard label="Policy acknowledgements" value={generated.filter((row) => row.documentType.includes('POLICY')).length} icon={ShieldCheck}>
          <p className="text-xs text-ink-muted">Track signed policy acceptance and timestamps</p>
        </StatCard>
        <StatCard label="Custom forms" value={forms.length} icon={Sparkles}>
          <p className="text-xs text-ink-muted">Reusable HR forms with JSON field schema</p>
        </StatCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader>
            <CardTitle>{selectedTemplateId ? 'Edit template' : 'Create template'}</CardTitle>
            <CardDescription>Templates are versioned on every update.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <Field label="Template key">
              <Input value={formState.templateKey} onChange={(e) => setFormState((s) => ({ ...s, templateKey: e.target.value }))} />
            </Field>
            <Field label="Name">
              <Input value={formState.name} onChange={(e) => setFormState((s) => ({ ...s, name: e.target.value }))} />
            </Field>
            <Field label="Module">
              <Input value={formState.module} onChange={(e) => setFormState((s) => ({ ...s, module: e.target.value }))} />
            </Field>
            <Field label="Document type">
              <Input value={formState.documentType} onChange={(e) => setFormState((s) => ({ ...s, documentType: e.target.value }))} />
            </Field>
            <Field label="Title">
              <Input value={formState.title} onChange={(e) => setFormState((s) => ({ ...s, title: e.target.value }))} />
            </Field>
            <Field label="Language">
              <Input value={formState.language} onChange={(e) => setFormState((s) => ({ ...s, language: e.target.value }))} />
            </Field>
            <Field label="Subject">
              <Input className="md:col-span-2" value={formState.subject} onChange={(e) => setFormState((s) => ({ ...s, subject: e.target.value }))} />
            </Field>
            <Field label="Body HTML" className="md:col-span-2">
              <textarea
                className="min-h-40 w-full rounded-lg border border-line bg-white p-3 text-sm"
                value={formState.bodyHtml}
                onChange={(e) => setFormState((s) => ({ ...s, bodyHtml: e.target.value }))}
              />
            </Field>
            <Field label="Body text" className="md:col-span-2">
              <textarea
                className="min-h-28 w-full rounded-lg border border-line bg-white p-3 text-sm"
                value={formState.bodyText}
                onChange={(e) => setFormState((s) => ({ ...s, bodyText: e.target.value }))}
              />
            </Field>
            <div className="flex flex-wrap items-center gap-3 md:col-span-2">
              <label className="flex items-center gap-2 text-sm text-ink-muted">
                <input
                  type="checkbox"
                  checked={formState.isMandatory}
                  onChange={(e) => setFormState((s) => ({ ...s, isMandatory: e.target.checked }))}
                />
                Mandatory
              </label>
              <label className="flex items-center gap-2 text-sm text-ink-muted">
                <input
                  type="checkbox"
                  checked={formState.eSignatureRequired}
                  onChange={(e) => setFormState((s) => ({ ...s, eSignatureRequired: e.target.checked }))}
                />
                E-signature required
              </label>
              <Select value={formState.status} onChange={(e) => setFormState((s) => ({ ...s, status: e.target.value }))}>
                <option value="DRAFT">DRAFT</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="ARCHIVED">ARCHIVED</option>
              </Select>
              <div className="ml-auto flex gap-2">
                {selectedTemplateId && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setSelectedTemplateId(null);
                      setFormState(templateInitialState);
                    }}
                  >
                    Clear
                  </Button>
                )}
                <Button onClick={() => saveTemplate.mutate()} disabled={saveTemplate.isPending}>
                  {selectedTemplateId ? 'Update template' : 'Save template'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Generate and acknowledge</CardTitle>
            <CardDescription>Render employee-specific letters and policy acknowledgements.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Template">
              <Select value={generateTemplateId} onChange={(e) => setGenerateTemplateId(e.target.value)}>
                <option value="">Select template</option>
                {templates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Employee ID">
              <Input value={generateEmployeeId} onChange={(e) => setGenerateEmployeeId(e.target.value)} />
            </Field>
            <Field label="Generated title">
              <Input value={generateTitle} onChange={(e) => setGenerateTitle(e.target.value)} />
            </Field>
            <Field label="Variables JSON">
              <textarea
                className="min-h-40 w-full rounded-lg border border-line bg-white p-3 text-sm"
                value={generateVars}
                onChange={(e) => setGenerateVars(e.target.value)}
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => generateDocument.mutate()} disabled={generateDocument.isPending || !generateTemplateId || !generateEmployeeId}>
                Generate document
              </Button>
              <Button
                variant="outline"
                onClick={() => acknowledgePolicy.mutate()}
                disabled={acknowledgePolicy.isPending || !ackTemplateId || !ackEmployeeId}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Acknowledge policy
              </Button>
            </div>
            <Field label="Policy template">
              <Select value={ackTemplateId} onChange={(e) => setAckTemplateId(e.target.value)}>
                <option value="">Select policy template</option>
                {templates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Acknowledge employee ID">
              <Input value={ackEmployeeId} onChange={(e) => setAckEmployeeId(e.target.value)} />
            </Field>
            <Field label="Comments">
              <textarea
                className="min-h-24 w-full rounded-lg border border-line bg-white p-3 text-sm"
                value={ackComments}
                onChange={(e) => setAckComments(e.target.value)}
              />
            </Field>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Template library</CardTitle>
          <CardDescription>Template version history and cloning are available on every row.</CardDescription>
        </CardHeader>
        {templates.length ? (
          <Table>
            <THead>
              <TR>
                <TH>Template</TH>
                <TH>Module</TH>
                <TH>Type</TH>
                <TH>Version</TH>
                <TH>Status</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {templates.map((template) => (
                <TR key={template.id}>
                  <TD>
                    <button
                      className="text-left"
                      onClick={() => setSelectedTemplateId(template.id)}
                    >
                      <p className="font-medium">{template.name}</p>
                      <p className="text-xs text-ink-muted">{template.templateKey}</p>
                    </button>
                  </TD>
                  <TD>{template.module}</TD>
                  <TD>{template.documentType}</TD>
                  <TD>v{template.version}</TD>
                  <TD>
                    <Badge variant={statusVariant(template.status)}>{template.status}</Badge>
                  </TD>
                  <TD>
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => cloneTemplate.mutate(template.id)}>
                        Clone
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyState icon={FileText} title="No document templates" description="Create offer letters, policy documents and HR forms." />
        )}
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Generated documents</CardTitle>
            <CardDescription>Stored on the employee profile as well as in file storage.</CardDescription>
          </CardHeader>
          {generated.length ? (
            <Table>
              <THead>
                <TR>
                  <TH>Document</TH>
                  <TH>Employee</TH>
                  <TH>Template</TH>
                  <TH>Version</TH>
                  <TH>Created</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {generated.map((doc) => (
                  <TR key={doc.id}>
                    <TD>
                      <p className="font-medium">{doc.title}</p>
                      <p className="text-xs text-ink-muted">{doc.documentType}</p>
                    </TD>
                    <TD>{doc.employee ? `${doc.employee.firstName} ${doc.employee.lastName}` : '—'}</TD>
                    <TD>{doc.template?.name ?? '—'}</TD>
                    <TD>{doc.version}</TD>
                    <TD>{formatDate(doc.createdAt)}</TD>
                    <TD>
                      {doc.downloadUrl ? (
                        <a className="text-sm text-primary-700 hover:underline" href={doc.downloadUrl} target="_blank" rel="noreferrer">
                          Download
                        </a>
                      ) : (
                        <span className="text-sm text-ink-muted">Stored</span>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : (
            <EmptyState icon={FileSignature} title="No generated documents" description="Render a document for an employee to see it here." />
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Custom forms</CardTitle>
            <CardDescription>Versioned JSON schema for HR forms and intake flows.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Form name">
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} />
            </Field>
            <Field label="Description">
              <Input value={formDescription} onChange={(e) => setFormDescription(e.target.value)} />
            </Field>
            <Field label="Fields JSON">
              <textarea
                className="min-h-40 w-full rounded-lg border border-line bg-white p-3 text-sm"
                value={formFields}
                onChange={(e) => setFormFields(e.target.value)}
              />
            </Field>
            <div className="flex gap-2">
              <Button onClick={() => saveForm.mutate()} disabled={saveForm.isPending || !formName}>
                {editingFormId ? 'Update form' : 'Save form'}
              </Button>
              {editingFormId && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditingFormId(null);
                    setFormName('');
                    setFormDescription('');
                    setFormFields('[\n  {"label":"Full name","name":"fullName","type":"text","required":true}\n]');
                  }}
                >
                  Clear
                </Button>
              )}
            </div>

            <div className="pt-4">
              {forms.length ? (
                <Table>
                  <THead>
                    <TR>
                      <TH>Form</TH>
                      <TH>Fields</TH>
                      <TH>Status</TH>
                      <TH />
                    </TR>
                  </THead>
                  <TBody>
                    {forms.map((form) => (
                      <TR key={form.id}>
                        <TD>
                          <button
                            className="text-left"
                            onClick={() => {
                              setEditingFormId(form.id);
                              setFormName(form.name);
                              setFormDescription(form.description ?? '');
                              setFormFields(JSON.stringify(form.fields, null, 2));
                            }}
                          >
                            <p className="font-medium">{form.name}</p>
                            <p className="text-xs text-ink-muted">{form.description ?? 'No description'}</p>
                          </button>
                        </TD>
                        <TD>{form.fields.length}</TD>
                        <TD>
                          <Badge variant={form.isActive ? 'success' : 'outline'}>
                            {form.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </TD>
                        <TD>
                          <Button size="sm" variant="outline" onClick={() => deleteForm.mutate(form.id)}>
                            Delete
                          </Button>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              ) : (
                <EmptyState icon={Sparkles} title="No custom forms" description="Create a JSON form for onboarding or policy collection." />
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={className}>
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</span>
      {children}
    </label>
  );
}
