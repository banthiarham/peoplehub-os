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
  managers: ManagerOption[];
}

const GENDERS = ['MALE', 'FEMALE', 'OTHER'] as const;
const EMPLOYMENT_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACTOR', 'INTERN', 'CONSULTANT'] as const;
const WORK_MODES = ['OFFICE', 'REMOTE', 'HYBRID'] as const;

const initialForm = {
  firstName: '',
  lastName: '',
  workEmail: '',
  phone: '',
  gender: '',
  joiningDate: '',
  departmentId: '',
  designationId: '',
  locationId: '',
  managerId: '',
  employmentType: '',
  workMode: '',
};

type FormState = typeof initialForm;

export function PeopleAddEmployeeDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(initialForm);
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
      const payload = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== ''));
      return api.post('/employees', payload).then((r) => r.data);
    },
    onSuccess: () => {
      toast('Employee created');
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      setForm(initialForm);
      setOpen(false);
    },
    onError: (err) => toast(apiErrorMessage(err), 'error'),
  });

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Add employee
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add employee</DialogTitle>
            <DialogDescription>Create a new employee record in the directory.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Labeled label="First name *">
                <Input value={form.firstName} onChange={set('firstName')} required />
              </Labeled>
              <Labeled label="Last name *">
                <Input value={form.lastName} onChange={set('lastName')} required />
              </Labeled>
              <Labeled label="Work email">
                <Input type="email" value={form.workEmail} onChange={set('workEmail')} />
              </Labeled>
              <Labeled label="Phone">
                <Input value={form.phone} onChange={set('phone')} />
              </Labeled>
              <Labeled label="Gender">
                <Select className="w-full" value={form.gender} onChange={set('gender')}>
                  <option value="">Select…</option>
                  {GENDERS.map((g) => (
                    <option key={g} value={g}>
                      {g.charAt(0) + g.slice(1).toLowerCase()}
                    </option>
                  ))}
                </Select>
              </Labeled>
              <Labeled label="Joining date">
                <Input type="date" value={form.joiningDate} onChange={set('joiningDate')} />
              </Labeled>
              <Labeled label="Department">
                <OptionSelect
                  value={form.departmentId}
                  onChange={set('departmentId')}
                  items={options?.departments}
                />
              </Labeled>
              <Labeled label="Designation">
                <OptionSelect
                  value={form.designationId}
                  onChange={set('designationId')}
                  items={options?.designations}
                />
              </Labeled>
              <Labeled label="Location">
                <OptionSelect
                  value={form.locationId}
                  onChange={set('locationId')}
                  items={options?.locations}
                />
              </Labeled>
              <Labeled label="Reporting manager">
                <Select className="w-full" value={form.managerId} onChange={set('managerId')}>
                  <option value="">Select…</option>
                  {options?.managers?.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.firstName} {m.lastName}
                    </option>
                  ))}
                </Select>
              </Labeled>
              <Labeled label="Employment type">
                <Select
                  className="w-full"
                  value={form.employmentType}
                  onChange={set('employmentType')}
                >
                  <option value="">Select…</option>
                  {EMPLOYMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.replace(/_/g, ' ')}
                    </option>
                  ))}
                </Select>
              </Labeled>
              <Labeled label="Work mode">
                <Select className="w-full" value={form.workMode} onChange={set('workMode')}>
                  <option value="">Select…</option>
                  {WORK_MODES.map((m) => (
                    <option key={m} value={m}>
                      {m.charAt(0) + m.slice(1).toLowerCase()}
                    </option>
                  ))}
                </Select>
              </Labeled>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!form.firstName.trim() || !form.lastName.trim() || create.isPending}
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

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium text-ink-muted">{label}</span>
      {children}
    </label>
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
