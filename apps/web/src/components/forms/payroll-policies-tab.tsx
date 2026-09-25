'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Settings2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input, Select } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useToast } from '@/components/ui/toaster';
import { payrollApiError } from './payroll-run-action-button';

interface LocationOption {
  id: string;
  name: string;
  city: string | null;
}

type SalaryBasis = 'CALENDAR_DAYS' | 'FIXED_DAYS' | 'WORKING_DAYS';
type CompOffUnusedTreatment = 'PAY' | 'UNPAID';
type CompOffUsagePeriod = 'MONTHLY' | 'ANNUAL';

interface PayrollPolicyRow {
  id: string;
  locationId: string | null;
  salaryBasis: SalaryBasis;
  fixedDays: number | null;
  overtimePaymentEnabled: boolean;
  compOffEnabled: boolean;
  compOffUnusedTreatment: CompOffUnusedTreatment;
  compOffUsagePeriod: CompOffUsagePeriod;
  compOffCarryForwardEnabled: boolean;
  isDefault: boolean;
  updatedAt: string;
}

type PolicyFormState = {
  salaryBasis: SalaryBasis;
  fixedDays: number | null;
  overtimePaymentEnabled: boolean;
  compOffEnabled: boolean;
  compOffUnusedTreatment: CompOffUnusedTreatment;
  compOffUsagePeriod: CompOffUsagePeriod;
  compOffCarryForwardEnabled: boolean;
};

/** Mirrors PayrollPolicyService's in-code fallback - what an unconfigured scope resolves to. */
const FALLBACK_POLICY: PolicyFormState = {
  salaryBasis: 'CALENDAR_DAYS',
  fixedDays: null,
  overtimePaymentEnabled: false,
  compOffEnabled: false,
  compOffUnusedTreatment: 'UNPAID',
  compOffUsagePeriod: 'MONTHLY',
  compOffCarryForwardEnabled: false,
};

function toFormState(policy: PayrollPolicyRow | null): PolicyFormState {
  if (!policy) return FALLBACK_POLICY;
  return {
    salaryBasis: policy.salaryBasis,
    fixedDays: policy.fixedDays,
    overtimePaymentEnabled: policy.overtimePaymentEnabled,
    compOffEnabled: policy.compOffEnabled,
    compOffUnusedTreatment: policy.compOffUnusedTreatment,
    compOffUsagePeriod: policy.compOffUsagePeriod,
    compOffCarryForwardEnabled: policy.compOffCarryForwardEnabled,
  };
}

export function PayrollPoliciesTab() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [scope, setScope] = useState('tenant');
  const locationId = scope === 'tenant' ? null : scope;

  const { data: locations } = useQuery({
    queryKey: ['locations'],
    queryFn: () => api.get('/locations').then((r) => r.data as LocationOption[]),
  });
  const { data: policies, isLoading } = useQuery({
    queryKey: ['payroll', 'policies'],
    queryFn: () => api.get('/payroll/policies').then((r) => r.data as PayrollPolicyRow[]),
  });

  const tenantDefault = policies?.find((p) => p.locationId === null) ?? null;
  const scopedPolicy = locationId ? (policies?.find((p) => p.locationId === locationId) ?? null) : tenantDefault;
  // A location scope with no row of its own is inheriting the tenant default (or the
  // built-in fallback, if the tenant hasn't configured anything either) - the same
  // precedence PayrollPolicyService.resolve() applies server-side.
  const inherited = locationId !== null && !scopedPolicy;
  const effective = toFormState(scopedPolicy ?? tenantDefault);

  const [form, setForm] = useState<PolicyFormState>(effective);

  // Reloads the form whenever the selected scope changes, or the underlying data for it
  // changes (e.g. after a save) - never while the admin is mid-edit of the same scope.
  useEffect(() => {
    setForm(toFormState(scopedPolicy ?? tenantDefault));
  }, [scope, policies]);

  const fixedDaysNumber = Number(form.fixedDays);
  const fixedDaysValid =
    form.salaryBasis !== 'FIXED_DAYS' ||
    (Number.isInteger(fixedDaysNumber) && fixedDaysNumber >= 1 && fixedDaysNumber <= 31);

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        ...(locationId ? { locationId } : {}),
        salaryBasis: form.salaryBasis,
        // Omitted (not null) when the basis isn't FIXED_DAYS, so the existing backend
        // contract's own clearing rule applies rather than a value invented here - sending
        // a stale number here would be rejected by the API once the basis has changed away.
        fixedDays: form.salaryBasis === 'FIXED_DAYS' ? fixedDaysNumber : undefined,
        overtimePaymentEnabled: form.overtimePaymentEnabled,
        compOffEnabled: form.compOffEnabled,
        compOffUnusedTreatment: form.compOffUnusedTreatment,
        compOffUsagePeriod: form.compOffUsagePeriod,
        compOffCarryForwardEnabled: form.compOffCarryForwardEnabled,
      };
      return scopedPolicy
        ? api.patch(`/payroll/policies/${scopedPolicy.id}`, payload)
        : api.post('/payroll/policies', payload);
    },
    onSuccess: () => {
      toast(scopedPolicy ? 'Payroll policy updated' : 'Payroll policy saved', 'success');
      queryClient.invalidateQueries({ queryKey: ['payroll', 'policies'] });
    },
    onError: (err: unknown) => toast(payrollApiError(err), 'error'),
  });

  const scopeLabel = (row: PayrollPolicyRow) =>
    row.locationId === null ? 'Tenant default' : (locations?.find((l) => l.id === row.locationId)?.name ?? 'Location');

  return (
    <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
      <Card className="p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Payroll policy</h2>
          {inherited ? (
            <Badge variant="info">Inherited</Badge>
          ) : scopedPolicy ? (
            <Badge variant="success">Configured</Badge>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-ink-muted">
          Controls the salary denominator, overtime payment, and Comp-Off rules payroll processing uses.
          A location without its own policy inherits the tenant default.
        </p>

        <label className="mt-3 block space-y-1.5 text-xs font-medium text-ink-muted">
          Scope
          <Select className="w-full" value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="tenant">Tenant default</option>
            {locations?.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
                {location.city ? ` · ${location.city}` : ''}
              </option>
            ))}
          </Select>
        </label>

        {isLoading ? (
          <div className="mt-4 space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : (
          <form
            className="mt-4 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (fixedDaysValid) save.mutate();
            }}
          >
            <label className="block space-y-1.5 text-xs font-medium text-ink-muted">
              Salary basis
              <Select
                className="w-full"
                value={form.salaryBasis}
                onChange={(e) =>
                  setForm((f) => ({ ...f, salaryBasis: e.target.value as SalaryBasis }))
                }
              >
                <option value="CALENDAR_DAYS">Calendar days</option>
                <option value="FIXED_DAYS">Fixed days</option>
                <option value="WORKING_DAYS">Working days</option>
              </Select>
            </label>

            {form.salaryBasis === 'FIXED_DAYS' && (
              <label className="block space-y-1.5 text-xs font-medium text-ink-muted">
                Fixed days per month
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={form.fixedDays ?? ''}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, fixedDays: e.target.value === '' ? null : Number(e.target.value) }))
                  }
                  required
                />
                {!fixedDaysValid && (
                  <span className="block text-[11px] font-normal text-danger">
                    Enter a whole number of days between 1 and 31.
                  </span>
                )}
              </label>
            )}

            <label className="flex items-center gap-2 text-sm text-ink-muted">
              <input
                type="checkbox"
                checked={form.overtimePaymentEnabled}
                onChange={(e) => setForm((f) => ({ ...f, overtimePaymentEnabled: e.target.checked }))}
              />
              Pay approved overtime
            </label>

            <label className="flex items-center gap-2 text-sm text-ink-muted">
              <input
                type="checkbox"
                checked={form.compOffEnabled}
                onChange={(e) => setForm((f) => ({ ...f, compOffEnabled: e.target.checked }))}
              />
              Enable Comp-Off
            </label>

            <label className="block space-y-1.5 text-xs font-medium text-ink-muted">
              Unused Comp-Off treatment
              <Select
                className="w-full"
                value={form.compOffUnusedTreatment}
                onChange={(e) =>
                  setForm((f) => ({ ...f, compOffUnusedTreatment: e.target.value as CompOffUnusedTreatment }))
                }
              >
                <option value="UNPAID">Unpaid (forfeited)</option>
                <option value="PAY">Paid out at payroll</option>
              </Select>
              <span className="block font-normal text-ink-faint">Applies only while Comp-Off is enabled.</span>
            </label>

            <label className="block space-y-1.5 text-xs font-medium text-ink-muted">
              Comp-Off usage period
              <Select
                className="w-full"
                value={form.compOffUsagePeriod}
                onChange={(e) =>
                  setForm((f) => ({ ...f, compOffUsagePeriod: e.target.value as CompOffUsagePeriod }))
                }
              >
                <option value="MONTHLY">Monthly</option>
                <option value="ANNUAL">Annual</option>
              </Select>
            </label>

            <label className="flex items-center gap-2 text-sm text-ink-muted">
              <input
                type="checkbox"
                checked={form.compOffCarryForwardEnabled}
                onChange={(e) => setForm((f) => ({ ...f, compOffCarryForwardEnabled: e.target.checked }))}
              />
              Allow Comp-Off to carry forward past its usage period
            </label>

            <Button type="submit" disabled={!fixedDaysValid || save.isPending} className="w-full">
              {save.isPending ? 'Saving...' : 'Save policy'}
            </Button>
          </form>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">Configured policies</h2>
          <p className="mt-1 text-xs text-ink-muted">Tenant default plus any location-specific overrides.</p>
        </div>
        {isLoading ? (
          <div className="space-y-2 p-4">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : policies?.length ? (
          <Table>
            <THead>
              <TR>
                <TH>Scope</TH>
                <TH>Salary basis</TH>
                <TH>Overtime</TH>
                <TH>Comp-Off</TH>
                <TH></TH>
              </TR>
            </THead>
            <TBody>
              {policies.map((row) => (
                <TR key={row.id}>
                  <TD>
                    <span className="block font-medium">{scopeLabel(row)}</span>
                    {row.isDefault && <Badge variant="outline">Default</Badge>}
                  </TD>
                  <TD>
                    {row.salaryBasis === 'FIXED_DAYS'
                      ? `Fixed (${row.fixedDays} days)`
                      : row.salaryBasis.replace(/_/g, ' ').toLowerCase()}
                  </TD>
                  <TD>
                    <Badge variant={row.overtimePaymentEnabled ? 'success' : 'outline'}>
                      {row.overtimePaymentEnabled ? 'Paid' : 'Unpaid'}
                    </Badge>
                  </TD>
                  <TD>
                    {row.compOffEnabled ? (
                      <Badge variant="success">
                        {row.compOffUnusedTreatment === 'PAY' ? 'Enabled · pays out' : 'Enabled · unpaid'}
                      </Badge>
                    ) : (
                      <Badge variant="outline">Disabled</Badge>
                    )}
                  </TD>
                  <TD className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setScope(row.locationId ?? 'tenant')}
                    >
                      Edit
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyState
            icon={Settings2}
            title="No payroll policy configured yet"
            description="Every location currently uses the built-in default: calendar-days salary, overtime unpaid, Comp-Off disabled. Save the tenant default to configure it."
          />
        )}
      </Card>
    </div>
  );
}
