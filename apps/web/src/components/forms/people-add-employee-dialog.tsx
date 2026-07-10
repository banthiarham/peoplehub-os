'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Select } from '@/components/ui/input';
import { useToast } from '@/components/ui/toaster';
import { apiErrorMessage } from './people-form-utils';

interface OptionItem {
  id: string;
  name: string;
}

interface ManagerOption {
  id: string;
  firstName: string;
  lastName: string;
}

interface MetaOptions {
  departments: OptionItem[];
  designations: OptionItem[];
  locations: OptionItem[];
  legalEntities: OptionItem[];
  costCenters: OptionItem[];
  businessUnits: OptionItem[];
  managers: ManagerOption[];
}

const GENDERS = ['MALE', 'FEMALE', 'OTHER'] as const;
const EMPLOYMENT_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACTOR', 'INTERN', 'CONSULTANT'] as const;
const WORK_MODES = ['OFFICE', 'REMOTE', 'HYBRID'] as const;
const MARITAL_STATUSES = ['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED'] as const;
const TAX_REGIMES = ['NEW', 'OLD'] as const;

const initialForm = {
  firstName: '',
  lastName: '',
  preferredName: '',
  workEmail: '',
  personalEmail: '',
  phone: '',
  dateOfBirth: '',
  gender: '',
  maritalStatus: '',
  bloodGroup: '',
  joiningDate: '',
  confirmationDate: '',
  probationEndDate: '',
  noticePeriodDays: '',
  departmentId: '',
  designationId: '',
  locationId: '',
  legalEntityId: '',
  costCenterId: '',
  businessUnitId: '',
  managerId: '',
  dottedManagerId: '',
  employmentType: '',
  workMode: '',
  pan: '',
  aadhaar: '',
  uan: '',
  esicNumber: '',
  taxRegime: '',
  createUser: true,
};

type FormState = typeof initialForm;
type OnboardingCredentials = { email: string; temporaryPassword: string };

export function PeopleAddEmployeeDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(initialForm);
  const [credentials, setCredentials] = useState<OnboardingCredentials | null>(null);
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data: options } = useQuery<MetaOptions>({
    queryKey: ['employees', 'options'],
    queryFn: () => api.get('/employees/meta/options').then((r) => r.data),
    enabled: open,
  });

  const set =
    (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  const create = useMutation({
    mutationFn: () => {
      const payload = Object.fromEntries(
        Object.entries(form)
          .filter(([, v]) => v !== '')
          .map(([key, value]) => [key, key === 'noticePeriodDays' ? Number(value) : value]),
      );
      return api.post('/employees', payload).then((r) => r.data);
    },
    onSuccess: (employee) => {
      const createdCredentials = employee?.onboardingCredentials ?? null;
      setCredentials(createdCredentials);
      toast(createdCredentials ? 'Employee created with login credentials' : 'Employee created');
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      setForm(initialForm);
      if (!createdCredentials) setOpen(false);
    },
    onError: (err) => toast(apiErrorMessage(err), 'error'),
  });

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Add employee
      </Button>
      <Dialog open={open} onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setCredentials(null);
      }}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add employee</DialogTitle>
            <DialogDescription>
              Create a full employee master record with organization, reporting, statutory, and tax details.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <SectionTitle>Identity</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-3">
              <Labeled label="First name *">
                <Input value={form.firstName} onChange={set('firstName')} required />
              </Labeled>
              <Labeled label="Last name *">
                <Input value={form.lastName} onChange={set('lastName')} required />
              </Labeled>
              <Labeled label="Preferred name">
                <Input value={form.preferredName} onChange={set('preferredName')} />
              </Labeled>
              <Labeled label="Work email">
                <Input type="email" value={form.workEmail} onChange={set('workEmail')} required={form.createUser} />
              </Labeled>
              <Labeled label="Personal email">
                <Input type="email" value={form.personalEmail} onChange={set('personalEmail')} />
              </Labeled>
              <Labeled label="Phone">
                <Input value={form.phone} onChange={set('phone')} />
              </Labeled>
              <Labeled label="Date of birth">
                <Input type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} />
              </Labeled>
              <Labeled label="Gender">
                <EnumSelect value={form.gender} onChange={set('gender')} items={GENDERS} />
              </Labeled>
              <Labeled label="Marital status">
                <EnumSelect value={form.maritalStatus} onChange={set('maritalStatus')} items={MARITAL_STATUSES} />
              </Labeled>
              <Labeled label="Blood group">
                <Input value={form.bloodGroup} onChange={set('bloodGroup')} />
              </Labeled>
            </div>

            <SectionTitle>Work And Organization</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-3">
              <Labeled label="Joining date">
                <Input type="date" value={form.joiningDate} onChange={set('joiningDate')} />
              </Labeled>
              <Labeled label="Confirmation date">
                <Input type="date" value={form.confirmationDate} onChange={set('confirmationDate')} />
              </Labeled>
              <Labeled label="Probation end">
                <Input type="date" value={form.probationEndDate} onChange={set('probationEndDate')} />
              </Labeled>
              <Labeled label="Department">
                <OptionSelect value={form.departmentId} onChange={set('departmentId')} items={options?.departments} />
              </Labeled>
              <Labeled label="Designation">
                <OptionSelect value={form.designationId} onChange={set('designationId')} items={options?.designations} />
              </Labeled>
              <Labeled label="Location">
                <OptionSelect value={form.locationId} onChange={set('locationId')} items={options?.locations} />
              </Labeled>
              <Labeled label="Legal entity">
                <OptionSelect value={form.legalEntityId} onChange={set('legalEntityId')} items={options?.legalEntities} />
              </Labeled>
              <Labeled label="Cost center">
                <OptionSelect value={form.costCenterId} onChange={set('costCenterId')} items={options?.costCenters} />
              </Labeled>
              <Labeled label="Business unit">
                <OptionSelect value={form.businessUnitId} onChange={set('businessUnitId')} items={options?.businessUnits} />
              </Labeled>
              <Labeled label="Reporting manager">
                <ManagerSelect value={form.managerId} onChange={set('managerId')} items={options?.managers} />
              </Labeled>
              <Labeled label="Dotted-line manager">
                <ManagerSelect value={form.dottedManagerId} onChange={set('dottedManagerId')} items={options?.managers} />
              </Labeled>
              <Labeled label="Notice days">
                <Input type="number" min={0} value={form.noticePeriodDays} onChange={set('noticePeriodDays')} />
              </Labeled>
              <Labeled label="Employment type">
                <EnumSelect value={form.employmentType} onChange={set('employmentType')} items={EMPLOYMENT_TYPES} />
              </Labeled>
              <Labeled label="Work mode">
                <EnumSelect value={form.workMode} onChange={set('workMode')} items={WORK_MODES} />
              </Labeled>
            </div>

            <SectionTitle>Statutory And Tax</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-3">
              <Labeled label="PAN">
                <Input value={form.pan} onChange={set('pan')} />
              </Labeled>
              <Labeled label="Aadhaar">
                <Input value={form.aadhaar} onChange={set('aadhaar')} />
              </Labeled>
              <Labeled label="UAN">
                <Input value={form.uan} onChange={set('uan')} />
              </Labeled>
              <Labeled label="ESIC number">
                <Input value={form.esicNumber} onChange={set('esicNumber')} />
              </Labeled>
              <Labeled label="Tax regime">
                <EnumSelect value={form.taxRegime} onChange={set('taxRegime')} items={TAX_REGIMES} />
              </Labeled>
            </div>

            <SectionTitle>Login</SectionTitle>
            <label className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm text-ink-muted">
              <input
                type="checkbox"
                checked={form.createUser}
                onChange={(e) => setForm((current) => ({ ...current, createUser: e.target.checked }))}
              />
              Create employee login
            </label>
            {form.createUser && !form.workEmail.trim() && (
              <p className="mt-2 text-xs text-rose-700">Work email is required when creating a login.</p>
            )}

            {credentials && (
              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
                <p className="font-semibold text-emerald-900">Share these credentials once</p>
                <p className="mt-2 font-mono text-xs text-emerald-900">Email: {credentials.email}</p>
                <p className="mt-1 font-mono text-xs text-emerald-900">Temporary password: {credentials.temporaryPassword}</p>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {credentials ? 'Close' : 'Cancel'}
              </Button>
              <Button
                type="submit"
                disabled={!form.firstName.trim() || !form.lastName.trim() || (form.createUser && !form.workEmail.trim()) || create.isPending}
              >
                {create.isPending ? 'Creating…' : 'Create employee'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-3 mt-5 text-sm font-semibold text-ink first:mt-0">{children}</h3>;
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium text-ink-muted">{label}</span>
      {children}
    </label>
  );
}

function EnumSelect({
  value,
  onChange,
  items,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  items: readonly string[];
}) {
  return (
    <Select className="w-full" value={value} onChange={onChange}>
      <option value="">Select…</option>
      {items.map((item) => (
        <option key={item} value={item}>
          {item.replace(/_/g, ' ')}
        </option>
      ))}
    </Select>
  );
}

function OptionSelect({
  value,
  onChange,
  items,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  items?: OptionItem[];
}) {
  return (
    <Select className="w-full" value={value} onChange={onChange}>
      <option value="">Select…</option>
      {items?.map((i) => (
        <option key={i.id} value={i.id}>
          {i.name}
        </option>
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
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  items?: ManagerOption[];
}) {
  return (
    <Select className="w-full" value={value} onChange={onChange}>
      <option value="">Select…</option>
      {items?.map((m) => (
        <option key={m.id} value={m.id}>
          {m.firstName} {m.lastName}
        </option>
      ))}
    </Select>
  );
}
