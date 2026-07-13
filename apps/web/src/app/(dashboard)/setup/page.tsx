'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Download,
  ExternalLink,
  FileUp,
  ListChecks,
  Plus,
  Save,
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

type LoginCredential = {
  employeeCode: string;
  name: string;
  email: string;
  temporaryPassword: string;
};

type ImportType = 'employees' | 'salary';
type SetupStepKey = 'company' | 'people' | 'salary' | 'readiness';

type OrganizationSummary = {
  id: string;
  name: string;
  legalName?: string | null;
  country?: string | null;
  industry?: string | null;
  companySize?: string | null;
  timezone?: string | null;
  currency?: string | null;
};

type LegalEntity = {
  id: string;
  name: string;
  legalName?: string | null;
  pan?: string | null;
  tan?: string | null;
  gstin?: string | null;
  pfRegistrationNumber?: string | null;
  esiRegistrationNumber?: string | null;
  ptRegistrationNumber?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
};

type LocationRecord = {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  pincode?: string | null;
  timezone?: string | null;
};

type OrgUnitRecord = {
  id: string;
  name: string;
  code?: string | null;
  isActive?: boolean;
};

type CompanySetupForm = {
  companyName: string;
  legalName: string;
  industry: string;
  companySize: string;
  country: string;
  currency: string;
  timezone: string;
  legalEntityName: string;
  pan: string;
  tan: string;
  gstin: string;
  pfRegistrationNumber: string;
  esiRegistrationNumber: string;
  ptRegistrationNumber: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  locationName: string;
  departmentsText: string;
};

type CompanySetupErrors = Partial<Record<keyof CompanySetupForm, string>>;

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

const emptyCompanySetupForm: CompanySetupForm = {
  companyName: '',
  legalName: '',
  industry: '',
  companySize: '',
  country: 'IN',
  currency: 'INR',
  timezone: 'Asia/Kolkata',
  legalEntityName: '',
  pan: '',
  tan: '',
  gstin: '',
  pfRegistrationNumber: '',
  esiRegistrationNumber: '',
  ptRegistrationNumber: '',
  address: '',
  city: '',
  state: '',
  pincode: '',
  locationName: '',
  departmentsText: '',
};

const sampleEmployeeRows: EmployeeRow[] = [
  {
    employeeCode: 'VH-1001',
    firstName: 'Aarav',
    lastName: 'Sharma',
    workEmail: 'aarav.sharma@example.com',
    joiningDate: '2026-07-01',
    department: 'Engineering',
    designation: 'Software Engineer',
    location: 'Primary Office',
    legalEntity: 'Primary Legal Entity',
    managerEmployeeCode: 'VH-1000',
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
    employeeCode: 'VH-1001',
    salaryStructure: 'India Standard CTC',
    ctc: '1200000',
    effectiveFrom: '2026-07-01',
  },
];

const setupSteps: Array<{ key: SetupStepKey; label: string; detail: string; sectionKey?: string }> = [
  { key: 'company', label: 'Company setup', detail: 'Confirm legal entity, location, departments', sectionKey: 'company' },
  { key: 'people', label: 'People import', detail: 'Add employees, managers, bank and IDs', sectionKey: 'hr' },
  { key: 'salary', label: 'Salary import', detail: 'Assign structures, CTC, effective dates', sectionKey: 'payroll' },
  { key: 'readiness', label: 'Payroll readiness', detail: 'Fix blockers or continue to dry run' },
];

const fallbackEmployeeTemplate: TemplateResponse = {
  type: 'employees',
  filename: 'viohr-employee-import-template.csv',
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
  filename: 'viohr-salary-import-template.csv',
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

function errorMessage(err: any, fallback: string) {
  const message = err?.response?.data?.message ?? err?.message;
  return Array.isArray(message) ? message.join(', ') : message ?? fallback;
}

function departmentNames(text: string) {
  return text
    .split(/\n|,/)
    .map((name) => name.trim())
    .filter(Boolean);
}

const panPattern = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const tanPattern = /^[A-Z]{4}[0-9]{5}[A-Z]$/;
const gstinPattern = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/;
const registrationPattern = /^[A-Z0-9/.-]+$/;
const employeeCodePattern = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const ifscPattern = /^[A-Z]{4}0[A-Z0-9]{6}$/;

function validateCompanySetup(form: CompanySetupForm): CompanySetupErrors {
  const errors: CompanySetupErrors = {};
  const required = (field: keyof CompanySetupForm, label: string, maxLength: number) => {
    const value = form[field].trim();
    if (!value) errors[field] = `${label} is required`;
    else if (value.length > maxLength) errors[field] = `${label} must be ${maxLength} characters or fewer`;
  };
  const optionalMax = (field: keyof CompanySetupForm, label: string, maxLength: number) => {
    if (form[field].trim().length > maxLength) errors[field] = `${label} must be ${maxLength} characters or fewer`;
  };
  const optionalPattern = (field: keyof CompanySetupForm, label: string, pattern: RegExp, message: string) => {
    const value = form[field].trim();
    if (value && !pattern.test(value)) errors[field] = `${label} ${message}`;
  };

  required('companyName', 'Company name', 160);
  if (form.country && !/^[A-Z]{2}$/.test(form.country.trim())) errors.country = 'Country code must contain 2 uppercase letters';
  if (form.currency && !/^[A-Z]{3}$/.test(form.currency.trim())) errors.currency = 'Currency must contain 3 uppercase letters';
  if (form.timezone && !/^(?:UTC|[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)+)$/.test(form.timezone.trim())) errors.timezone = 'Timezone must be an IANA name such as Asia/Kolkata';
  optionalMax('legalName', 'Legal name', 200);
  optionalMax('industry', 'Industry', 100);
  optionalMax('legalEntityName', 'Legal entity name', 160);
  optionalMax('locationName', 'Location name', 160);
  optionalMax('address', 'Address', 500);
  optionalMax('city', 'City', 100);
  optionalMax('state', 'State', 100);
  optionalPattern('pan', 'PAN', panPattern, 'must have the format ABCDE1234F');
  optionalPattern('tan', 'TAN', tanPattern, 'must have the format ABCD12345E');
  optionalPattern('gstin', 'GSTIN', gstinPattern, 'must be a valid 15-character GSTIN');
  optionalPattern('pfRegistrationNumber', 'PF registration number', registrationPattern, 'contains invalid characters');
  optionalPattern('esiRegistrationNumber', 'ESI registration number', /^\d{17}$/, 'must contain 17 digits');
  optionalPattern('ptRegistrationNumber', 'PT registration number', registrationPattern, 'contains invalid characters');
  optionalPattern('pincode', 'Pincode', /^\d{6}$/, 'must contain 6 digits');
  for (const department of departmentNames(form.departmentsText)) {
    if (department.length > 120) {
      errors.departmentsText = 'Department names must be 120 characters or fewer';
      break;
    }
  }
  return errors;
}

const companyFieldLabels: Record<keyof CompanySetupForm, string> = {
  companyName: 'Company name', legalName: 'Legal name', industry: 'Industry', companySize: 'Company size',
  country: 'Country code', currency: 'Currency', timezone: 'Timezone', legalEntityName: 'Legal entity name',
  pan: 'PAN', tan: 'TAN', gstin: 'GSTIN', pfRegistrationNumber: 'PF registration number',
  esiRegistrationNumber: 'ESI registration number', ptRegistrationNumber: 'PT registration number',
  address: 'Address', city: 'City', state: 'State', pincode: 'Pincode', locationName: 'Location name',
  departmentsText: 'Departments',
};

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

function copyCredentials(credentials: LoginCredential[]) {
  const text = credentials
    .map((credential) => `${credential.name} (${credential.employeeCode})\nEmail: ${credential.email}\nTemporary password: ${credential.temporaryPassword}`)
    .join('\n\n');
  void navigator.clipboard?.writeText(text);
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

function applyCompanyDefaults(row: EmployeeRow, form: CompanySetupForm): EmployeeRow {
  const departments = departmentNames(form.departmentsText);
  return {
    ...row,
    department: row.department === sampleEmployeeRows[0].department ? departments[0] ?? row.department : row.department,
    location: row.location === sampleEmployeeRows[0].location ? form.locationName || row.location : row.location,
    legalEntity: row.legalEntity === sampleEmployeeRows[0].legalEntity
      ? form.legalEntityName || form.legalName || form.companyName || row.legalEntity
      : row.legalEntity,
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
  else if (row.firstName.trim().length > 100) issues.push({ field: 'firstName', code: 'too_long', severity: 'critical', message: 'First name must be 100 characters or fewer' });
  if (row.lastName.trim().length > 100) issues.push({ field: 'lastName', code: 'too_long', severity: 'critical', message: 'Last name must be 100 characters or fewer' });
  if (row.employeeCode && (!employeeCodePattern.test(row.employeeCode.trim()) || row.employeeCode.trim().length > 50)) {
    issues.push({ field: 'employeeCode', code: 'invalid_format', severity: 'critical', message: 'Employee code must be 50 characters or fewer and use only letters, numbers, dot, underscore, slash or hyphen' });
  }
  if (row.createUser && !row.workEmail.trim()) {
    issues.push({ field: 'workEmail', code: 'login_email_required', severity: 'critical', message: 'Work email is required when Create login is selected' });
  }
  if (row.workEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.workEmail)) {
    issues.push({ field: 'workEmail', code: 'invalid_email', severity: 'critical', message: 'Work email is not valid' });
  }
  if (row.workEmail.trim().length > 254) issues.push({ field: 'workEmail', code: 'too_long', severity: 'critical', message: 'Work email must be 254 characters or fewer' });
  if (row.joiningDate && Number.isNaN(new Date(row.joiningDate).getTime())) {
    issues.push({ field: 'joiningDate', code: 'invalid_date', severity: 'critical', message: 'Joining date must be a valid date' });
  }
  for (const [field, value, maxLength] of [
    ['department', row.department, 120],
    ['designation', row.designation, 120],
    ['location', row.location, 160],
    ['legalEntity', row.legalEntity, 160],
    ['salaryStructure', row.salaryStructure, 160],
  ] as const) {
    if (value.trim().length > maxLength) issues.push({ field, code: 'too_long', severity: 'critical', message: `${field} must be ${maxLength} characters or fewer` });
  }
  if (row.managerEmployeeCode && (!employeeCodePattern.test(row.managerEmployeeCode.trim()) || row.managerEmployeeCode.trim().length > 50)) {
    issues.push({ field: 'managerEmployeeCode', code: 'invalid_format', severity: 'critical', message: 'Manager code has an invalid format' });
  }
  if (!row.legalEntity.trim()) issues.push({ field: 'legalEntity', code: 'required', severity: 'critical', message: 'Legal entity is required for payroll' });
  if (!row.bankAccountNumber.trim() || !row.bankIfsc.trim()) {
    issues.push({ field: 'bankDetails', code: 'missing_bank_details', severity: 'warning', message: 'Bank details are missing; payroll readiness will stay blocked' });
  }
  if (row.pan && !panPattern.test(row.pan.trim())) issues.push({ field: 'pan', code: 'invalid_format', severity: 'critical', message: 'PAN must have the format ABCDE1234F' });
  if (row.uan && !/^\d{12}$/.test(row.uan.trim())) issues.push({ field: 'uan', code: 'invalid_format', severity: 'critical', message: 'UAN must contain 12 digits' });
  if (row.bankAccountNumber && !/^\d{6,34}$/.test(row.bankAccountNumber.trim())) issues.push({ field: 'bankAccountNumber', code: 'invalid_format', severity: 'critical', message: 'Bank account number must contain 6 to 34 digits' });
  if (row.bankIfsc && !ifscPattern.test(row.bankIfsc.trim())) issues.push({ field: 'bankIfsc', code: 'invalid_format', severity: 'critical', message: 'IFSC must have the format ABCD0123456' });
  if (row.salaryStructure && (!row.ctc || Number(row.ctc) <= 0)) {
    issues.push({ field: 'ctc', code: 'invalid_ctc', severity: 'critical', message: 'CTC must be greater than zero' });
  }
  if (row.ctc && !Number.isFinite(Number(row.ctc))) issues.push({ field: 'ctc', code: 'invalid_type', severity: 'critical', message: 'CTC must be a number' });
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
  const [activeStep, setActiveStep] = useState<SetupStepKey>('company');
  const [importType, setImportType] = useState<ImportType>('employees');
  const [employeeRows, setEmployeeRows] = useState<EmployeeRow[]>(sampleEmployeeRows);
  const [salaryRows, setSalaryRows] = useState<SalaryRow[]>(sampleSalaryRows);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [loginCredentials, setLoginCredentials] = useState<LoginCredential[]>([]);
  const [error, setError] = useState('');
  const [companyError, setCompanyError] = useState('');
  const [companyFieldErrors, setCompanyFieldErrors] = useState<CompanySetupErrors>({});
  const [companyTouched, setCompanyTouched] = useState(false);
  const [companyForm, setCompanyForm] = useState<CompanySetupForm>(emptyCompanySetupForm);

  const readinessQuery = useQuery<Readiness>({
    queryKey: ['setup', 'readiness'],
    queryFn: () => api.get('/setup/readiness').then((r) => r.data),
    retry: 1,
  });
  const organizationQuery = useQuery<OrganizationSummary>({
    queryKey: ['organization'],
    queryFn: () => api.get('/organization').then((r) => r.data),
    retry: 1,
  });
  const legalEntitiesQuery = useQuery<LegalEntity[]>({
    queryKey: ['legal-entities'],
    queryFn: () => api.get('/legal-entities').then((r) => r.data),
    retry: 1,
  });
  const locationsQuery = useQuery<LocationRecord[]>({
    queryKey: ['locations'],
    queryFn: () => api.get('/locations').then((r) => r.data),
    retry: 1,
  });
  const departmentsQuery = useQuery<OrgUnitRecord[]>({
    queryKey: ['departments'],
    queryFn: () => api.get('/departments').then((r) => r.data),
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
  const firstLegalEntity = legalEntitiesQuery.data?.[0];
  const firstLocation = locationsQuery.data?.[0];
  const companySection = readiness?.sections.find((section) => section.key === 'company');

  useEffect(() => {
    if (companyTouched) return;
    const organization = organizationQuery.data;
    const legalEntity = legalEntitiesQuery.data?.[0];
    const location = locationsQuery.data?.[0];
    const departments = departmentsQuery.data ?? [];
    if (!organization && !legalEntity && !location && departments.length === 0) return;

    setCompanyForm({
      companyName: organization?.name ?? '',
      legalName: organization?.legalName ?? legalEntity?.legalName ?? '',
      industry: organization?.industry ?? '',
      companySize: organization?.companySize ?? '',
      country: organization?.country ?? legalEntity?.country ?? location?.country ?? 'IN',
      currency: organization?.currency ?? 'INR',
      timezone: organization?.timezone ?? location?.timezone ?? 'Asia/Kolkata',
      legalEntityName: legalEntity?.name ?? organization?.legalName ?? organization?.name ?? '',
      pan: legalEntity?.pan ?? '',
      tan: legalEntity?.tan ?? '',
      gstin: legalEntity?.gstin ?? '',
      pfRegistrationNumber: legalEntity?.pfRegistrationNumber ?? '',
      esiRegistrationNumber: legalEntity?.esiRegistrationNumber ?? '',
      ptRegistrationNumber: legalEntity?.ptRegistrationNumber ?? '',
      address: legalEntity?.address ?? location?.address ?? '',
      city: legalEntity?.city ?? location?.city ?? '',
      state: legalEntity?.state ?? location?.state ?? '',
      pincode: location?.pincode ?? '',
      locationName: location?.name ?? '',
      departmentsText: departments.map((department) => department.name).join('\n'),
    });
  }, [companyTouched, departmentsQuery.data, legalEntitiesQuery.data, locationsQuery.data, organizationQuery.data]);

  useEffect(() => {
    if (!companyForm.companyName && !companyForm.legalEntityName && !companyForm.locationName) return;
    setEmployeeRows((rows) => rows.map((row) => applyCompanyDefaults(row, companyForm)));
  }, [
    companyForm.companyName,
    companyForm.departmentsText,
    companyForm.legalEntityName,
    companyForm.legalName,
    companyForm.locationName,
  ]);

  const saveCompanyMutation = useMutation({
    mutationFn: async () => {
      const validationErrors = validateCompanySetup(companyForm);
      setCompanyFieldErrors(validationErrors);
      if (Object.keys(validationErrors).length) throw new Error('Correct the highlighted company fields before saving');
      const companyName = companyForm.companyName.trim();
      if (!companyName) throw new Error('Company name is required');

      const legalEntityName = companyForm.legalEntityName.trim() || companyForm.legalName.trim() || companyName;
      const locationName = companyForm.locationName.trim() || companyForm.city.trim() || 'Primary office';
      const country = companyForm.country.trim() || 'IN';
      const timezone = companyForm.timezone.trim() || 'Asia/Kolkata';

      await api.patch('/organization', {
        name: companyName,
        legalName: companyForm.legalName.trim() || undefined,
        industry: companyForm.industry.trim() || undefined,
        companySize: companyForm.companySize.trim() || undefined,
        country,
        currency: companyForm.currency.trim() || 'INR',
        timezone,
      });

      const legalEntityBody = {
        name: legalEntityName,
        legalName: companyForm.legalName.trim() || legalEntityName,
        pan: companyForm.pan.trim() || undefined,
        tan: companyForm.tan.trim() || undefined,
        gstin: companyForm.gstin.trim() || undefined,
        pfRegistrationNumber: companyForm.pfRegistrationNumber.trim() || undefined,
        esiRegistrationNumber: companyForm.esiRegistrationNumber.trim() || undefined,
        ptRegistrationNumber: companyForm.ptRegistrationNumber.trim() || undefined,
        address: companyForm.address.trim() || undefined,
        city: companyForm.city.trim() || undefined,
        state: companyForm.state.trim() || undefined,
        country,
      };
      if (firstLegalEntity?.id) await api.patch(`/legal-entities/${firstLegalEntity.id}`, legalEntityBody);
      else await api.post('/legal-entities', legalEntityBody);

      const locationBody = {
        name: locationName,
        address: companyForm.address.trim() || undefined,
        city: companyForm.city.trim() || undefined,
        state: companyForm.state.trim() || undefined,
        country,
        pincode: companyForm.pincode.trim() || undefined,
        timezone,
        isActive: true,
      };
      if (firstLocation?.id) await api.patch(`/locations/${firstLocation.id}`, locationBody);
      else await api.post('/locations', locationBody);

      const existingDepartments = new Set(
        (departmentsQuery.data ?? []).map((department) => department.name.trim().toLowerCase()),
      );
      for (const name of departmentNames(companyForm.departmentsText)) {
        if (!existingDepartments.has(name.toLowerCase())) {
          await api.post('/departments', { name, isActive: true });
        }
      }
    },
    onSuccess: async () => {
      setCompanyError('');
      setCompanyTouched(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['organization'] }),
        queryClient.invalidateQueries({ queryKey: ['legal-entities'] }),
        queryClient.invalidateQueries({ queryKey: ['locations'] }),
        queryClient.invalidateQueries({ queryKey: ['departments'] }),
        queryClient.invalidateQueries({ queryKey: ['setup', 'readiness'] }),
      ]);
      setActiveStep('people');
      setImportType('employees');
    },
    onError: (err: any) => {
      setCompanyError(errorMessage(err, 'Company setup could not be saved'));
    },
  });

  const previewMutation = useMutation({
    mutationFn: async () => {
      const body = importType === 'employees' ? employeePayload(employeeRows) : salaryPayload(salaryRows);
      const browserPreview = localPreview(importType, employeeRows, salaryRows);
      if (browserPreview.summary.errors > 0) return { ...browserPreview, localOnly: false };
      try {
        return await api.post(`${endpoint}/preview`, body).then((r) => r.data as ImportPreview);
      } catch (err: any) {
        if (!err?.response) return localPreview(importType, employeeRows, salaryRows);
        throw err;
      }
    },
    onSuccess: (data) => {
      setPreview(data);
      setLoginCredentials([]);
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
    onSuccess: async (data) => {
      setError('');
      setPreview(null);
      setLoginCredentials(data?.loginCredentials ?? []);
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
      setEmployeeRows(currentTemplate.sampleRows.map(employeeFromTemplate).map((row) => applyCompanyDefaults(row, companyForm)));
    } else {
      setSalaryRows(currentTemplate.sampleRows.map(salaryFromTemplate));
    }
  }

  function addRow() {
    setPreview(null);
    setLoginCredentials([]);
    if (importType === 'employees') setEmployeeRows((rows) => [...rows, { ...emptyEmployeeRow }]);
    else setSalaryRows((rows) => [...rows, { ...emptySalaryRow }]);
  }

  function openStep(step: SetupStepKey) {
    setActiveStep(step);
    if (step === 'people') setImportType('employees');
    if (step === 'salary') setImportType('salary');
    setPreview(null);
    setLoginCredentials([]);
    setError('');
  }

  function updateCompanyForm(patch: Partial<CompanySetupForm>) {
    setCompanyTouched(true);
    setCompanyForm((current) => ({ ...current, ...patch }));
    setCompanyFieldErrors((current) => {
      const next = { ...current };
      for (const field of Object.keys(patch) as Array<keyof CompanySetupForm>) delete next[field];
      return next;
    });
  }

  function actionForIssue(issue: ReadinessIssue & { section: string }) {
    if (
      [
        'missing_legal_entities',
        'missing_locations',
        'missing_departments',
        'missing_entity_tax_ids',
      ].includes(issue.code)
    ) {
      return { label: 'Open company setup', onClick: () => openStep('company') };
    }
    if (
      [
        'missing_employees',
        'duplicate_employee_codes',
        'duplicate_work_emails',
        'employees_missing_legal_entity',
        'employees_missing_bank',
        'employees_missing_pan',
        'employees_missing_uan',
      ].includes(issue.code)
    ) {
      return { label: 'Open people import', onClick: () => openStep('people') };
    }
    if (['missing_salary_structures', 'employees_missing_salary'].includes(issue.code)) {
      return { label: 'Open salary import', onClick: () => openStep('salary') };
    }
    if (['missing_leave_types', 'missing_leave_policies'].includes(issue.code)) {
      return { label: 'Open leave setup', onClick: () => { window.location.href = '/leave'; } };
    }
    if (['missing_shifts', 'missing_attendance_capture'].includes(issue.code)) {
      return { label: 'Open attendance setup', onClick: () => { window.location.href = '/attendance'; } };
    }
    return { label: 'Open payroll', onClick: () => { window.location.href = '/payroll'; } };
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Client onboarding"
        description="Create the tenant, confirm company records, import people and salaries, then clear payroll blockers"
      />

      <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
        Signup details now prefill this flow. Confirm what is known, skip what is not ready, and return to the exact step that has a blocker.
      </div>

      <div className="grid gap-3 lg:grid-cols-4">
        {setupSteps.map((step, index) => {
          const section = step.sectionKey ? readiness?.sections.find((item) => item.key === step.sectionKey) : undefined;
          const active = activeStep === step.key;
          return (
            <button
              key={step.key}
              type="button"
              onClick={() => openStep(step.key)}
              className={`rounded-lg border p-4 text-left shadow-sm transition ${active ? 'border-primary-700 bg-white ring-2 ring-primary-100' : 'border-line bg-white hover:border-primary-200'}`}
            >
              <div className="flex items-center gap-3">
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-semibold ${active ? 'bg-primary-700 text-white' : section?.status === 'ready' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-ink-muted'}`}>
                  {section?.status === 'ready' ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{step.label}</p>
                  <p className="truncate text-xs text-ink-muted">{step.detail}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {readinessQuery.isLoading ? (
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, index) => <Skeleton key={index} className="h-28" />)}
        </div>
      ) : readiness ? (
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
            <p className="mt-2 text-xs text-ink-muted">Fix these before locking payroll</p>
          </StatCard>
          <StatCard label="Warnings" value={readiness.totals.warnings} icon={AlertTriangle}>
            <p className="mt-2 text-xs text-ink-muted">Review before first live run</p>
          </StatCard>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <div>
            <p className="font-semibold">Readiness needs the API and database.</p>
            <p className="mt-1">You can still prepare rows and run browser validation. Start the API to see real blockers and commit imports.</p>
          </div>
          <Button variant="outline" onClick={() => readinessQuery.refetch()} disabled={readinessQuery.isFetching}>
            Retry readiness
          </Button>
        </div>
      )}

      {activeStep === 'company' && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>Company setup</CardTitle>
                <CardDescription>These fields are created from signup and can be corrected before importing employees.</CardDescription>
              </div>
              {companySection && <Badge variant={badgeForStatus(companySection.status) as any}>{companySection.completed} of {companySection.total} ready</Badge>}
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {organizationQuery.isLoading || legalEntitiesQuery.isLoading || locationsQuery.isLoading || departmentsQuery.isLoading ? (
              <div className="grid gap-3 md:grid-cols-3">
                {[...Array(6)].map((_, index) => <Skeleton key={index} className="h-10" />)}
              </div>
            ) : (
              <>
                <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
                  <div className="space-y-4">
                    <div>
                      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                        <Building2 className="h-4 w-4 text-primary-700" /> Company profile
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <Input placeholder="Company name" value={companyForm.companyName} onChange={(e) => updateCompanyForm({ companyName: e.target.value })} />
                        <Input placeholder="Legal name" value={companyForm.legalName} onChange={(e) => updateCompanyForm({ legalName: e.target.value })} />
                        <Input placeholder="Industry" value={companyForm.industry} onChange={(e) => updateCompanyForm({ industry: e.target.value })} />
                        <Select value={companyForm.companySize} onChange={(e) => updateCompanyForm({ companySize: e.target.value })}>
                          <option value="">Company size</option>
                          <option value="1-50">1-50</option>
                          <option value="51-200">51-200</option>
                          <option value="201-500">201-500</option>
                          <option value="501-2000">501-2000</option>
                          <option value="2000+">2000+</option>
                        </Select>
                        <Input placeholder="Country code" value={companyForm.country} onChange={(e) => updateCompanyForm({ country: e.target.value.toUpperCase() })} />
                        <div className="grid grid-cols-2 gap-3">
                          <Input placeholder="Currency" value={companyForm.currency} onChange={(e) => updateCompanyForm({ currency: e.target.value.toUpperCase() })} />
                          <Input placeholder="Timezone" value={companyForm.timezone} onChange={(e) => updateCompanyForm({ timezone: e.target.value })} />
                        </div>
                      </div>
                    </div>

                    <div>
                      <p className="mb-3 text-sm font-semibold text-ink">Legal entity and statutory IDs</p>
                      <div className="grid gap-3 md:grid-cols-2">
                        <Input placeholder="Legal entity name" value={companyForm.legalEntityName} onChange={(e) => updateCompanyForm({ legalEntityName: e.target.value })} />
                        <Input placeholder="PAN" value={companyForm.pan} onChange={(e) => updateCompanyForm({ pan: e.target.value.toUpperCase() })} />
                        <Input placeholder="TAN" value={companyForm.tan} onChange={(e) => updateCompanyForm({ tan: e.target.value.toUpperCase() })} />
                        <Input placeholder="GSTIN" value={companyForm.gstin} onChange={(e) => updateCompanyForm({ gstin: e.target.value.toUpperCase() })} />
                        <Input placeholder="PF registration number" value={companyForm.pfRegistrationNumber} onChange={(e) => updateCompanyForm({ pfRegistrationNumber: e.target.value.toUpperCase() })} />
                        <Input placeholder="ESI registration number" value={companyForm.esiRegistrationNumber} onChange={(e) => updateCompanyForm({ esiRegistrationNumber: e.target.value.toUpperCase() })} />
                        <Input placeholder="PT registration number" value={companyForm.ptRegistrationNumber} onChange={(e) => updateCompanyForm({ ptRegistrationNumber: e.target.value.toUpperCase() })} />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <p className="mb-3 text-sm font-semibold text-ink">Primary office</p>
                      <div className="grid gap-3">
                        <Input placeholder="Location name" value={companyForm.locationName} onChange={(e) => updateCompanyForm({ locationName: e.target.value })} />
                        <Input placeholder="Address" value={companyForm.address} onChange={(e) => updateCompanyForm({ address: e.target.value })} />
                        <div className="grid grid-cols-2 gap-3">
                          <Input placeholder="City" value={companyForm.city} onChange={(e) => updateCompanyForm({ city: e.target.value })} />
                          <Input placeholder="State" value={companyForm.state} onChange={(e) => updateCompanyForm({ state: e.target.value })} />
                        </div>
                        <Input placeholder="Pincode" value={companyForm.pincode} onChange={(e) => updateCompanyForm({ pincode: e.target.value })} />
                      </div>
                    </div>
                    <div>
                      <p className="mb-3 text-sm font-semibold text-ink">Departments</p>
                      <textarea
                        className="min-h-36 w-full rounded-2xl border border-line bg-white px-3.5 py-3 text-sm shadow-sm placeholder:text-ink-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                        placeholder={'Engineering\nSales\nFinance'}
                        value={companyForm.departmentsText}
                        onChange={(e) => updateCompanyForm({ departmentsText: e.target.value })}
                      />
                      <p className="mt-2 text-xs text-ink-muted">One department per line. Existing departments stay in place; new names are added.</p>
                    </div>
                  </div>
                </div>

                {Object.keys(companyFieldErrors).length > 0 && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
                    <p className="font-semibold">Correct these fields before saving:</p>
                    <ul className="mt-1 list-disc pl-5">
                      {(Object.entries(companyFieldErrors) as Array<[keyof CompanySetupForm, string]>).map(([field, message]) => (
                        <li key={field}><span className="font-medium">{companyFieldLabels[field]}:</span> {message}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {companyError && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{companyError}</div>}

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                  <Button variant="outline" onClick={() => openStep('people')}>
                    Skip for now <ArrowRight className="h-4 w-4" />
                  </Button>
                  <Button onClick={() => saveCompanyMutation.mutate()} disabled={saveCompanyMutation.isPending}>
                    <Save className="h-4 w-4" /> Save and continue
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {(activeStep === 'people' || activeStep === 'salary') && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>{activeStep === 'people' ? 'People import' : 'Salary import'}</CardTitle>
                <CardDescription>
                  {activeStep === 'people'
                    ? 'Add employees for login and attendance first. Payroll details can be completed now or left as warnings until payroll readiness.'
                    : 'Assign salary structures and effective-dated CTC rows before payroll readiness is calculated.'}
                </CardDescription>
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
          </CardHeader>
          <CardContent className="space-y-4">
            {importType === 'employees' ? (
              <EmployeeRows rows={employeeRows} setRows={setEmployeeRows} onEdit={() => { setPreview(null); setLoginCredentials([]); }} />
            ) : (
              <SalaryRows rows={salaryRows} setRows={setSalaryRows} onEdit={() => { setPreview(null); setLoginCredentials([]); }} />
            )}

            {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

            {loginCredentials.length > 0 && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-emerald-900">Employee login credentials</p>
                    <p className="mt-1 text-xs text-emerald-800">
                      Share these once with the tester. Passwords are generated only at creation time and are not stored in plain text.
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => copyCredentials(loginCredentials)}>
                    Copy all
                  </Button>
                </div>
                <div className="mt-3 overflow-x-auto">
                  <Table>
                    <THead>
                      <TR>
                        <TH>Employee</TH>
                        <TH>Email</TH>
                        <TH>Temporary password</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {loginCredentials.map((credential) => (
                        <TR key={`${credential.employeeCode}-${credential.email}`}>
                          <TD>{credential.name} · {credential.employeeCode}</TD>
                          <TD className="font-mono text-xs">{credential.email}</TD>
                          <TD className="font-mono text-xs">{credential.temporaryPassword}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </div>
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

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <Button variant="outline" onClick={() => openStep(activeStep === 'people' ? 'company' : 'people')}>
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button onClick={() => openStep(activeStep === 'people' ? 'salary' : 'readiness')}>
                {activeStep === 'people' ? 'Continue to salary import' : 'Continue to payroll readiness'} <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {activeStep === 'readiness' && (
        <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <Card>
            <CardHeader>
              <CardTitle>Readiness summary</CardTitle>
              <CardDescription>Each module shows what is passing and what still blocks a payroll dry run.</CardDescription>
            </CardHeader>
            <CardContent>
              {readiness ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {readiness.sections.map((section) => (
                    <button key={section.key} type="button" onClick={() => {
                      if (section.key === 'company') openStep('company');
                      else if (section.key === 'hr') openStep('people');
                      else if (section.key === 'payroll') openStep('salary');
                    }} className="rounded-lg border border-line p-3 text-left hover:border-primary-200">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-ink">{section.label}</p>
                          <p className="text-xs text-ink-muted">{section.completed} of {section.total} checks passing</p>
                        </div>
                        <Badge variant={badgeForStatus(section.status) as any}>{section.status}</Badge>
                      </div>
                      <div className="mt-3"><Progress value={section.score} /></div>
                      {section.issues.length > 0 && <p className="mt-2 text-xs text-ink-muted">{section.issues[0]?.message}</p>}
                    </button>
                  ))}
                </div>
              ) : (
                <EmptyState icon={ListChecks} title="Readiness unavailable" description="Start the API and database to calculate tenant readiness." />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Action queue</CardTitle>
              <CardDescription>Use these actions to jump directly to the configuration that clears each blocker.</CardDescription>
            </CardHeader>
            <CardContent>
              {issueList.length === 0 ? (
                <EmptyState icon={CheckCircle2} title="Ready for dry run" description="No setup blockers were detected for this tenant." />
              ) : (
                <div className="space-y-3">
                  {issueList.map((issue) => {
                    const action = actionForIssue(issue);
                    return (
                      <div key={`${issue.section}-${issue.code}`} className="rounded-lg border border-line p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-ink">{issue.section}</p>
                          <Badge variant={issue.severity === 'critical' ? 'destructive' : 'warning'}>{issue.severity}</Badge>
                        </div>
                        <p className="mt-1 text-sm text-ink-muted">{issue.message}</p>
                        <Button className="mt-3" variant="outline" size="sm" onClick={action.onClick}>
                          {action.label} <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                <Button variant="outline" onClick={() => openStep('salary')}>
                  <ArrowLeft className="h-4 w-4" /> Back
                </Button>
                <Button onClick={() => { window.location.href = '/dashboard'; }}>
                  Finish for now
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
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
              <Input placeholder={row.createUser ? 'Work email required for login' : 'Work email'} value={row.workEmail} onChange={(e) => update(index, { workEmail: e.target.value })} />
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
              {row.createUser && !row.workEmail.trim() && (
                <p className="text-xs text-rose-700">Work email is required for login.</p>
              )}
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
            <TD><Input value={row.employeeCode} onChange={(e) => update(index, { employeeCode: e.target.value })} placeholder="VH-1001" /></TD>
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
