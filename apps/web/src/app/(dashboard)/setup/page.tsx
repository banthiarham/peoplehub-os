'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileUp,
  ListChecks,
  Plus,
  ShieldAlert,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

type ReadinessIssue = {
  code: string;
  severity: 'critical' | 'warning';
  message: string;
  count?: number;
};

type ReadinessSection = {
  key: string;
  label: string;
  status: 'ready' | 'warning' | 'blocked';
  score: number;
  completed: number;
  total: number;
  issues: ReadinessIssue[];
};

type Readiness = {
  status: 'ready' | 'warning' | 'blocked';
  score: number;
  totals: {
    legalEntities: number;
    locations: number;
    departments: number;
    employees: number;
    salaryStructures: number;
    leaveTypes: number;
    leavePolicies: number;
    shifts: number;
    payrollRuns: number;
    criticalIssues: number;
    warnings: number;
  };
  sections: ReadinessSection[];
  payrollBlockers: string[];
  updatedAt: string;
};

type TemplateResponse = {
  type: string;
  filename: string;
  columns: string[];
  sampleRows: Array<Record<string, unknown>>;
};

type ImportPreview = {
  localOnly?: boolean;
  summary: {
    totalRows: number;
    validRows: number;
    errors: number;
    warnings: number;
    canCommit: boolean;
  };
  rows: Array<{
    rowNumber: number;
    status: 'ready' | 'warning' | 'error';
    normalized: Record<string, unknown>;
    issues: Array<{ field: string; code: string; severity: 'critical' | 'warning'; message: string }>;
  }>;
};

type ImportType = 'employees' | 'salary';

type EmployeeRow = {
  employeeCode: string;
  firstName: string;
  lastName: string;
  workEmail: string;
  joiningDate: string;
  department: string;
  designation: string;
  location: string;
  legalEntity: string;
  managerEmployeeCode: string;
  employmentType: string;
  pan: string;
  uan: string;
  bankAccountNumber: string;
  bankIfsc: string;
  salaryStructure: string;
  ctc: string;
  createUser: boolean;
};

type SalaryRow = {
  employeeCode: string;
  salaryStructure: string;
  ctc: string;
  effectiveFrom: string;
};

const emptyEmployeeRow: EmployeeRow = {
  employeeCode: '',
  firstName: '',
  lastName: '',
  workEmail: '',
  joiningDate: '',
  department: '',
  designation: '',
  location: '',
  legalEntity: '',
  managerEmployeeCode: '',
  employmentType: 'FULL_TIME',
  pan: '',
  uan: '',
  bankAccountNumber: '',
  bankIfsc: '',
  salaryStructure: '',
  ctc: '',
  createUser: true,
};

const emptySalaryRow: SalaryRow = {
  employeeCode: '',
  salaryStructure: '',
  ctc: '',
  effectiveFrom: '',
};

const sampleEmployeeRows: EmployeeRow[] = [
  {
    employeeCode: 'PH-1001',
    firstName: 'Aarav',
    lastName: 'Sharma',
    workEmail: 'aarav.sharma@example.com',
    joiningDate: '2026-07-01',
    department: 'Engineering',
    designation: 'Software Engineer',
    location: 'Bangalore Office',
    legalEntity: 'Demo Corp India Pvt Ltd',
    managerEmployeeCode: 'PH-1000',
    employmentType: 'FULL_TIME',
    pan: 'ABCDE1234F',
    uan: '100200300400',
    bankAccountNumber: '123456789012',
    bankIfsc: 'HDFC0001234',
    salaryStructure: 'India Standard CTC',
    ctc: '1200000',
    createUser: true,
  },
];

const sampleSalaryRows: SalaryRow[] = [
  {
    employeeCode: 'PH-1001',
    salaryStructure: 'India Standard CTC',
    ctc: '1200000',
    effectiveFrom: '2026-07-01',
  },
];

const flowSteps = [
  { label: 'Company setup', detail: 'Legal entity, locations, departments' },
  { label: 'People import', detail: 'Employees, managers, bank and IDs' },
  { label: 'Salary import', detail: 'Structures, CTC, effective dates' },
  { label: 'Payroll readiness', detail: 'Resolve blockers before dry run' },
];

const fallbackEmployeeTemplate: TemplateResponse = {
  type: 'employees',
  filename: 'peoplehub-employee-import-template.csv',
  columns: [
    'employeeCode',
    'firstName',
    'lastName',
    'workEmail',
    'joiningDate',
    'department',
    'designation',
    'location',
    'legalEntity',
    'managerEmployeeCode',
    'employmentType',
    'pan',
    'uan',
    'bankAccountNumber',
    'bankIfsc',
    'salaryStructure',
    'ctc',
    'createUser',
  ],
  sampleRows: sampleEmployeeRows.map((row) => ({ ...row })),
};

const fallbackSalaryTemplate: TemplateResponse = {
  type: 'salary',
  filename: 'peoplehub-salary-import-template.csv',
  columns: ['employeeCode', 'salaryStructure', 'ctc', 'effectiveFrom'],
  sampleRows: sampleSalaryRows.map((row) => ({ ...row })),
};

function badgeForStatus(status: string) {
  if (status === 'ready') return 'success';
  if (status === 'warning') return 'warning';
  return 'destructive';
}

function statusLabel(status: string) {
  return status === 'blocked' ? 'Blocked' : status === 'warning' ? 'Needs attention' : 'Ready';
}

function toCsv(template: TemplateResponse) {
  const lines = [
    template.columns.join(','),
    ...template.sampleRows.map((row) =>
      template.columns
        .map((column) => {
          const value = row[column] ?? '';
          const text = String(value).replace(/"/g, '""');
          return text.includes(',') ? `"${text}"` : text;
        })
        .join(','),
    ),
  ];
  return lines.join('\n');
}

function downloadTemplate(template: TemplateResponse) {
  const blob = new Blob([toCsv(template)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = template.filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function employeePayload(rows: EmployeeRow[]) {
  return {
    rows: rows.map((row) => ({
      ...row,
      ctc: row.ctc ? Number(row.ctc) : undefined,
      createUser: row.createUser,
    })),
  };
}

function salaryPayload(rows: SalaryRow[]) {
  return {
    rows: rows.map((row) => ({
      ...row,
      ctc: row.ctc ? Number(row.ctc) : undefined,
    })),
  };
}

function employeeFromTemplate(row: Record<string, unknown>): EmployeeRow {
  return {
    ...emptyEmployeeRow,
    ...Object.fromEntries(Object.entries(row).map(([key, value]) => [key, String(value ?? '')])),
    createUser: row.createUser === true || String(row.createUser).toLowerCase() === 'true',
  };
}

function salaryFromTemplate(row: Record<string, unknown>): SalaryRow {
  return {
    ...emptySalaryRow,
    ...Object.fromEntries(Object.entries(row).map(([key, value]) => [key, String(value ?? '')])),
  };
}

function localPreview(importType: ImportType, employeeRows: EmployeeRow[], salaryRows: SalaryRow[]): ImportPreview {
  const rows = importType === 'employees'
    ? employeeRows.map((row, index) => localEmployeePreviewRow(row, index, employeeRows))
    : salaryRows.map((row, index) => localSalaryPreviewRow(row, index, salaryRows));
  const errors = rows.filter((row) => row.status === 'error').length;
  const warnings = rows.reduce((sum, row) => sum + row.issues.filter((issue) => issue.severity === 'warning').length, 0);
  return {
    localOnly: true,
    summary: {
      totalRows: rows.length,
      validRows: rows.filter((row) => row.status !== 'error').length,
      errors,
      warnings,
      canCommit: false,
    },
    rows,
  };
}

function localEmployeePreviewRow(row: EmployeeRow, index: number, rows: EmployeeRow[]): ImportPreview['rows'][number] {
  const issues: ImportPreview['rows'][number]['issues'] = [];
  if (!row.firstName.trim()) issues.push({ field: 'firstName', code: 'required', severity: 'critical', message: 'First name is required' });
  if (!row.lastName.trim()) issues.push({ field: 'lastName', code: 'required', severity: 'critical', message: 'Last name is required' });
  if (row.workEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.workEmail)) {
    issues.push({ field: 'workEmail', code: 'invalid_email', severity: 'critical', message: 'Work email is not valid' });
  }
  if (!row.legalEntity.trim()) issues.push({ field: 'legalEntity', code: 'required', severity: 'critical', message: 'Legal entity is required for payroll' });
  if (!row.bankAccountNumber.trim() || !row.bankIfsc.trim()) {
    issues.push({ field: 'bankDetails', code: 'required', severity: 'critical', message: 'Bank account and IFSC are required' });
  }
  if (row.salaryStructure && (!row.ctc || Number(row.ctc) <= 0)) {
    issues.push({ field: 'ctc', code: 'invalid_ctc', severity: 'critical', message: 'CTC must be greater than zero' });
  }
  if (row.employeeCode && rows.some((other, otherIndex) => otherIndex !== index && other.employeeCode && other.employeeCode.trim().toLowerCase() === row.employeeCode.trim().toLowerCase())) {
    issues.push({ field: 'employeeCode', code: 'duplicate_in_file', severity: 'critical', message: 'Employee code repeats in this import' });
  }
  if (row.workEmail && rows.some((other, otherIndex) => otherIndex !== index && other.workEmail && other.workEmail.trim().toLowerCase() === row.workEmail.trim().toLowerCase())) {
    issues.push({ field: 'workEmail', code: 'duplicate_in_file', severity: 'critical', message: 'Work email repeats in this import' });
  }
  if (!row.pan.trim()) issues.push({ field: 'pan', code: 'missing_pan', severity: 'warning', message: 'PAN is missing' });
  if (!row.uan.trim()) issues.push({ field: 'uan', code: 'missing_uan', severity: 'warning', message: 'UAN is missing' });
  if (!row.employeeCode.trim()) issues.push({ field: 'employeeCode', code: 'auto_generated', severity: 'warning', message: 'Employee code will be auto-generated by the API' });
  return {
    rowNumber: index + 1,
    status: issues.some((issue) => issue.severity === 'critical') ? 'error' : issues.length ? 'warning' : 'ready',
    normalized: {
      name: `${row.firstName} ${row.lastName}`.trim(),
      employeeCode: row.employeeCode || 'Auto-generated',
    },
    issues,
  };
}

function localSalaryPreviewRow(row: SalaryRow, index: number, rows: SalaryRow[]): ImportPreview['rows'][number] {
  const issues: ImportPreview['rows'][number]['issues'] = [];
  if (!row.employeeCode.trim()) issues.push({ field: 'employeeCode', code: 'required', severity: 'critical', message: 'Employee code is required' });
  if (!row.salaryStructure.trim()) issues.push({ field: 'salaryStructure', code: 'required', severity: 'critical', message: 'Salary structure is required' });
  if (!row.ctc || Number(row.ctc) <= 0) issues.push({ field: 'ctc', code: 'invalid_ctc', severity: 'critical', message: 'CTC must be greater than zero' });
  if (!row.effectiveFrom || Number.isNaN(new Date(row.effectiveFrom).getTime())) {
    issues.push({ field: 'effectiveFrom', code: 'invalid_date', severity: 'critical', message: 'Effective date is required' });
  }
  if (row.employeeCode && rows.some((other, otherIndex) => otherIndex !== index && other.employeeCode && other.employeeCode.trim().toLowerCase() === row.employeeCode.trim().toLowerCase())) {
    issues.push({ field: 'employeeCode', code: 'duplicate_in_file', severity: 'critical', message: 'Employee has more than one salary row' });
  }
  return {
    rowNumber: index + 1,
    status: issues.some((issue) => issue.severity === 'critical') ? 'error' : 'ready',
    normalized: {
      employeeCode: row.employeeCode,
      salaryStructure: row.salaryStructure,
    },
    issues,
  };
}

export default function SetupPage() {
  const queryClient = useQueryClient();
  const [importType, setImportType] = useState<ImportType>('employees');
  const [employeeRows, setEmployeeRows] = useState<EmployeeRow[]>(sampleEmployeeRows);
  const [salaryRows, setSalaryRows] = useState<SalaryRow[]>(sampleSalaryRows);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState('');

  const readinessQuery = useQuery<Readiness>({
    queryKey: ['setup', 'readiness'],
    queryFn: () => api.get('/setup/readiness').then((r) => r.data),
    retry: 1,
  });
  const employeeTemplate = useQuery<TemplateResponse>({
    queryKey: ['setup', 'template', 'employees'],
    queryFn: () => api.get('/setup/templates/employees').then((r) => r.data),
    retry: 1,
  });
  const salaryTemplate = useQuery<TemplateResponse>({
    queryKey: ['setup', 'template', 'salary'],
    queryFn: () => api.get('/setup/templates/salary').then((r) => r.data),
    retry: 1,
  });

  const endpoint = importType === 'employees' ? '/setup/import/employees' : '/setup/import/salary';
  const currentTemplate = importType === 'employees'
    ? employeeTemplate.data ?? fallbackEmployeeTemplate
    : salaryTemplate.data ?? fallbackSalaryTemplate;
  const currentRows = importType === 'employees' ? employeeRows : salaryRows;
  const readiness = readinessQuery.data;
  const issueList = useMemo(
    () => readiness?.sections.flatMap((section) => section.issues.map((issue) => ({ ...issue, section: section.label }))) ?? [],
    [readiness],
  );

  const previewMutation = useMutation({
    mutationFn: async () => {
      const body = importType === 'employees' ? employeePayload(employeeRows) : salaryPayload(salaryRows);
      try {
        return await api.post(`${endpoint}/preview`, body).then((r) => r.data as ImportPreview);
      } catch (err: any) {
        if (!err?.response) return localPreview(importType, employeeRows, salaryRows);
        throw err;
      }
    },
    onSuccess: (data) => {
      setPreview(data);
      setError(data.localOnly ? 'API is offline, so this is browser-only validation. Start the API before committing rows.' : '');
    },
    onError: (err: any) => {
      setPreview(null);
      setError(err?.response?.data?.message ?? err?.message ?? 'Preview failed');
    },
  });

  const commitMutation = useMutation({
    mutationFn: async () => {
      const body = importType === 'employees' ? employeePayload(employeeRows) : salaryPayload(salaryRows);
      return api.post(`${endpoint}/commit`, body).then((r) => r.data);
    },
    onSuccess: async () => {
      setError('');
      setPreview(null);
      await queryClient.invalidateQueries({ queryKey: ['setup', 'readiness'] });
    },
    onError: (err: any) => {
      setError(err?.response?.data?.message ?? err?.message ?? 'Commit failed');
    },
  });

  function loadSampleRows() {
    setPreview(null);
    setError('');
    if (importType === 'employees') {
      setEmployeeRows(currentTemplate.sampleRows.map(employeeFromTemplate));
    } else {
      setSalaryRows(currentTemplate.sampleRows.map(salaryFromTemplate));
    }
  }

  function addRow() {
    setPreview(null);
    if (importType === 'employees') setEmployeeRows((rows) => [...rows, { ...emptyEmployeeRow }]);
    else setSalaryRows((rows) => [...rows, { ...emptySalaryRow }]);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Implementation Center"
        description="Guided setup, migration validation, and payroll readiness for a new tenant"
      />

      <div className="grid gap-3 lg:grid-cols-4">
        {flowSteps.map((step, index) => {
          const active = importType === 'employees' ? index <= 1 : index <= 2;
          return (
            <div key={step.label} className="rounded-lg border border-line bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-semibold ${active ? 'bg-primary-700 text-white' : 'bg-slate-100 text-ink-muted'}`}>
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{step.label}</p>
                  <p className="truncate text-xs text-ink-muted">{step.detail}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {readinessQuery.isLoading ? (
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, index) => <Skeleton key={index} className="h-28" />)}
        </div>
      ) : readiness ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Setup readiness" value={`${readiness.score}%`} icon={ListChecks}>
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between text-xs text-ink-muted">
                  <span>{statusLabel(readiness.status)}</span>
                  <Badge variant={badgeForStatus(readiness.status) as any}>{readiness.status}</Badge>
                </div>
                <Progress value={readiness.score} />
              </div>
            </StatCard>
            <StatCard label="Active employees" value={readiness.totals.employees} icon={CheckCircle2}>
              <p className="mt-2 text-xs text-ink-muted">{readiness.totals.salaryStructures} salary structures configured</p>
            </StatCard>
            <StatCard label="Critical blockers" value={readiness.totals.criticalIssues} icon={ShieldAlert}>
              <p className="mt-2 text-xs text-ink-muted">Payroll lock should stay blocked until these are fixed</p>
            </StatCard>
            <StatCard label="Warnings" value={readiness.totals.warnings} icon={AlertTriangle}>
              <p className="mt-2 text-xs text-ink-muted">Warnings need review but can be overridden by policy</p>
            </StatCard>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <Card>
              <CardHeader>
                <CardTitle>Readiness checklist</CardTitle>
                <CardDescription>Module gates that tell the admin what to fix next.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-2">
                  {readiness.sections.map((section) => (
                    <div key={section.key} className="rounded-lg border border-line p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-ink">{section.label}</p>
                          <p className="text-xs text-ink-muted">{section.completed} of {section.total} checks complete</p>
                        </div>
                        <Badge variant={badgeForStatus(section.status) as any}>{section.status}</Badge>
                      </div>
                      <div className="mt-3"><Progress value={section.score} /></div>
                      {section.issues.length > 0 && (
                        <p className="mt-2 text-xs text-ink-muted">{section.issues[0]?.message}</p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Payroll blockers</CardTitle>
                <CardDescription>Critical setup issues before the first dry run.</CardDescription>
              </CardHeader>
              <CardContent>
                {issueList.length === 0 ? (
                  <EmptyState icon={CheckCircle2} title="No blockers" description="This tenant is ready for the next payroll dry run." />
                ) : (
                  <div className="space-y-3">
                    {issueList.slice(0, 8).map((issue) => (
                      <div key={`${issue.section}-${issue.code}`} className="rounded-lg border border-line p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-ink">{issue.section}</p>
                          <Badge variant={issue.severity === 'critical' ? 'destructive' : 'warning'}>{issue.severity}</Badge>
                        </div>
                        <p className="mt-1 text-sm text-ink-muted">{issue.message}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <div>
            <p className="font-semibold">Readiness needs the API and database.</p>
            <p className="mt-1">You can still prepare rows and run browser validation below. Start the API to see real blockers and commit imports.</p>
          </div>
          <Button variant="outline" onClick={() => readinessQuery.refetch()} disabled={readinessQuery.isFetching}>
            Retry readiness
          </Button>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Import workspace</CardTitle>
          <CardDescription>Fill the rows below, preview validation, then commit only when the file is clean.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-lg border border-line bg-white p-1">
              {(['employees', 'salary'] as ImportType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    setImportType(type);
                    setPreview(null);
                    setError('');
                  }}
                  className={`rounded-md px-3 py-1.5 text-sm font-semibold ${importType === type ? 'bg-primary-700 text-white' : 'text-ink-muted hover:bg-canvas'}`}
                >
                  {type === 'employees' ? 'Employees' : 'Salary'}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => downloadTemplate(currentTemplate)}>
                <Download className="h-4 w-4" /> CSV template
              </Button>
              <Button variant="outline" onClick={loadSampleRows}>
                <FileUp className="h-4 w-4" /> Load sample
              </Button>
              <Button variant="outline" onClick={addRow}>
                <Plus className="h-4 w-4" /> Add row
              </Button>
            </div>
          </div>

          {importType === 'employees' ? (
            <EmployeeRows rows={employeeRows} setRows={setEmployeeRows} onEdit={() => setPreview(null)} />
          ) : (
            <SalaryRows rows={salaryRows} setRows={setSalaryRows} onEdit={() => setPreview(null)} />
          )}

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => previewMutation.mutate()} disabled={previewMutation.isPending || currentRows.length === 0}>
              <UploadCloud className="h-4 w-4" /> Preview validation
            </Button>
            <Button
              variant="secondary"
              onClick={() => commitMutation.mutate()}
              disabled={!preview?.summary.canCommit || preview.localOnly || commitMutation.isPending}
            >
              <CheckCircle2 className="h-4 w-4" /> Commit valid rows
            </Button>
            {preview && (
              <span className="text-sm text-ink-muted">
                {preview.summary.validRows}/{preview.summary.totalRows} valid, {preview.summary.errors} errors, {preview.summary.warnings} warnings
                {preview.localOnly ? ' · browser check only' : ''}
              </span>
            )}
          </div>

          {preview && <PreviewTable preview={preview} />}
        </CardContent>
      </Card>
    </div>
  );
}

function EmployeeRows({
  rows,
  setRows,
  onEdit,
}: {
  rows: EmployeeRow[];
  setRows: React.Dispatch<React.SetStateAction<EmployeeRow[]>>;
  onEdit: () => void;
}) {
  function update(index: number, patch: Partial<EmployeeRow>) {
    onEdit();
    setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  function remove(index: number) {
    onEdit();
    setRows((current) => current.filter((_, rowIndex) => rowIndex !== index));
  }

  return (
    <Table>
      <THead>
        <TR>
          <TH>Employee</TH>
          <TH>Organization</TH>
          <TH>Payroll essentials</TH>
          <TH>Login</TH>
          <TH />
        </TR>
      </THead>
      <TBody>
        {rows.map((row, index) => (
          <TR key={index}>
            <TD className="min-w-[280px] space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="First name" value={row.firstName} onChange={(e) => update(index, { firstName: e.target.value })} />
                <Input placeholder="Last name" value={row.lastName} onChange={(e) => update(index, { lastName: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Employee code" value={row.employeeCode} onChange={(e) => update(index, { employeeCode: e.target.value })} />
                <Input type="date" value={row.joiningDate} onChange={(e) => update(index, { joiningDate: e.target.value })} />
              </div>
              <Input placeholder="Work email" value={row.workEmail} onChange={(e) => update(index, { workEmail: e.target.value })} />
            </TD>
            <TD className="min-w-[280px] space-y-2">
              <Input placeholder="Department" value={row.department} onChange={(e) => update(index, { department: e.target.value })} />
              <Input placeholder="Designation" value={row.designation} onChange={(e) => update(index, { designation: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Location" value={row.location} onChange={(e) => update(index, { location: e.target.value })} />
                <Input placeholder="Manager code" value={row.managerEmployeeCode} onChange={(e) => update(index, { managerEmployeeCode: e.target.value })} />
              </div>
            </TD>
            <TD className="min-w-[320px] space-y-2">
              <Input placeholder="Legal entity" value={row.legalEntity} onChange={(e) => update(index, { legalEntity: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="PAN" value={row.pan} onChange={(e) => update(index, { pan: e.target.value.toUpperCase() })} />
                <Input placeholder="UAN" value={row.uan} onChange={(e) => update(index, { uan: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Bank account" value={row.bankAccountNumber} onChange={(e) => update(index, { bankAccountNumber: e.target.value })} />
                <Input placeholder="IFSC" value={row.bankIfsc} onChange={(e) => update(index, { bankIfsc: e.target.value.toUpperCase() })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Salary structure" value={row.salaryStructure} onChange={(e) => update(index, { salaryStructure: e.target.value })} />
                <Input placeholder="CTC" inputMode="numeric" value={row.ctc} onChange={(e) => update(index, { ctc: e.target.value })} />
              </div>
            </TD>
            <TD className="min-w-[160px] space-y-2">
              <Select value={row.employmentType} onChange={(e) => update(index, { employmentType: e.target.value })} className="w-full">
                <option value="FULL_TIME">Full time</option>
                <option value="PART_TIME">Part time</option>
                <option value="CONTRACTOR">Contractor</option>
                <option value="INTERN">Intern</option>
              </Select>
              <label className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm text-ink-muted">
                <input type="checkbox" checked={row.createUser} onChange={(e) => update(index, { createUser: e.target.checked })} />
                Create login
              </label>
            </TD>
            <TD>
              <Button variant="ghost" size="icon" onClick={() => remove(index)} aria-label="Remove row">
                <Trash2 className="h-4 w-4" />
              </Button>
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

function SalaryRows({
  rows,
  setRows,
  onEdit,
}: {
  rows: SalaryRow[];
  setRows: React.Dispatch<React.SetStateAction<SalaryRow[]>>;
  onEdit: () => void;
}) {
  function update(index: number, patch: Partial<SalaryRow>) {
    onEdit();
    setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  function remove(index: number) {
    onEdit();
    setRows((current) => current.filter((_, rowIndex) => rowIndex !== index));
  }

  return (
    <Table>
      <THead>
        <TR>
          <TH>Employee code</TH>
          <TH>Salary structure</TH>
          <TH>CTC</TH>
          <TH>Effective from</TH>
          <TH />
        </TR>
      </THead>
      <TBody>
        {rows.map((row, index) => (
          <TR key={index}>
            <TD><Input value={row.employeeCode} onChange={(e) => update(index, { employeeCode: e.target.value })} placeholder="PH-1001" /></TD>
            <TD><Input value={row.salaryStructure} onChange={(e) => update(index, { salaryStructure: e.target.value })} placeholder="India Standard CTC" /></TD>
            <TD><Input value={row.ctc} onChange={(e) => update(index, { ctc: e.target.value })} inputMode="numeric" placeholder="1200000" /></TD>
            <TD><Input type="date" value={row.effectiveFrom} onChange={(e) => update(index, { effectiveFrom: e.target.value })} /></TD>
            <TD>
              <Button variant="ghost" size="icon" onClick={() => remove(index)} aria-label="Remove row">
                <Trash2 className="h-4 w-4" />
              </Button>
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

function PreviewTable({ preview }: { preview: ImportPreview }) {
  return (
    <Table>
      <THead>
        <TR>
          <TH>Row</TH>
          <TH>Status</TH>
          <TH>Record</TH>
          <TH>Issues</TH>
        </TR>
      </THead>
      <TBody>
        {preview.rows.map((row) => (
          <TR key={row.rowNumber}>
            <TD>{row.rowNumber}</TD>
            <TD><Badge variant={badgeForStatus(row.status) as any}>{row.status}</Badge></TD>
            <TD className="max-w-xs truncate">{String(row.normalized.name ?? row.normalized.employeeCode ?? row.normalized.salaryStructure ?? '-')}</TD>
            <TD>
              {row.issues.length === 0 ? (
                <span className="text-sm text-emerald-700">Ready</span>
              ) : (
                <div className="space-y-1">
                  {row.issues.slice(0, 4).map((issue) => (
                    <p key={`${issue.field}-${issue.code}`} className="text-xs text-ink-muted">
                      <span className={issue.severity === 'critical' ? 'text-rose-700' : 'text-amber-700'}>{issue.field}</span>: {issue.message}
                    </p>
                  ))}
                </div>
              )}
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
