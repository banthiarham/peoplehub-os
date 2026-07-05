'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calculator, FileClock, GitCompareArrows, ReceiptText } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { formatINR } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
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
import { apiErrorMessage } from './ops-utils';

interface TaxActionContext {
  tenantId: string | undefined;
  taxYearId: string | undefined;
  financialYear: string | undefined;
}

interface RegimeResult {
  netTaxableIncome: number;
  totalAnnualTax: number;
  monthlyTds: number;
  effectiveTaxRate: number;
}

interface CompareResponse {
  new: RegimeResult;
  old: RegimeResult;
  recommendation: 'NEW' | 'OLD';
}

const AGE_OPTIONS = [
  { value: 'BELOW_60', label: 'Below 60' },
  { value: 'SENIOR_60_80', label: 'Senior (60–80)' },
  { value: 'SUPER_SENIOR_80_PLUS', label: 'Super senior (80+)' },
];

function compareInput(
  ctx: TaxActionContext,
  income: number,
  ded80c: number,
  ded80d: number,
  ageCategory: string,
  employeeId = 'adhoc',
) {
  const now = new Date();
  return {
    tenantId: ctx.tenantId,
    employeeId,
    taxYearId: ctx.taxYearId,
    ageCategory,
    annualFixedSalary: income,
    grossPaidTillDate: 0,
    projectedRemainingGross: 0,
    bonus: 0,
    variablePay: 0,
    arrears: 0,
    taxableReimbursements: 0,
    previousEmployerIncome: 0,
    previousEmployerTds: 0,
    tdsDeductedTillDate: 0,
    approvedDeductions: { '80C': ded80c, '80D': ded80d },
    approvedExemptions: {},
    currentMonth: now.getMonth() + 1,
    currentYear: now.getFullYear(),
    remainingPayrollMonths: 12,
  };
}

function CompareResultView({ result }: { result: CompareResponse }) {
  const rows: Array<{ label: string; key: keyof RegimeResult; money?: boolean }> = [
    { label: 'Net taxable income', key: 'netTaxableIncome', money: true },
    { label: 'Annual tax', key: 'totalAnnualTax', money: true },
    { label: 'Monthly TDS', key: 'monthlyTds', money: true },
    { label: 'Effective rate', key: 'effectiveTaxRate' },
  ];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-6 gap-y-2 text-sm">
        <span />
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">New</span>
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Old</span>
        {rows.flatMap((r) => [
          <span key={r.label} className="text-ink-muted">
            {r.label}
          </span>,
          ...(['new', 'old'] as const).map((regime) => (
            <span key={`${r.label}-${regime}`} className="text-right font-medium tabular-nums">
              {r.money
                ? formatINR(result[regime][r.key])
                : `${(result[regime][r.key] * 100).toFixed(1)}%`}
            </span>
          )),
        ])}
      </div>
      <div className="rounded-lg bg-primary-50 px-3 py-2.5 text-sm">
        Recommended regime: <Badge variant="success">{result.recommendation}</Badge>
        <span className="ml-2 text-xs text-ink-muted">
          saves {formatINR(Math.abs(result.new.totalAnnualTax - result.old.totalAnnualTax))} / year
        </span>
      </div>
    </div>
  );
}

/** Ad-hoc old-vs-new regime comparison using the live TDS engine. */
export function CompareRegimesDialog(ctx: TaxActionContext) {
  const [open, setOpen] = useState(false);
  const [income, setIncome] = useState('1200000');
  const [ded80c, setDed80c] = useState('150000');
  const [ded80d, setDed80d] = useState('25000');
  const [age, setAge] = useState('BELOW_60');
  const toast = useToast();

  const compare = useMutation({
    mutationFn: () =>
      api
        .post(
          '/tax/payroll/compare-regimes',
          compareInput(ctx, Number(income), Number(ded80c), Number(ded80d), age),
        )
        .then((r) => r.data as CompareResponse),
    onError: (err) => toast(apiErrorMessage(err), 'error'),
  });

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} disabled={!ctx.taxYearId}>
        <GitCompareArrows className="h-4 w-4" /> Compare regimes
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Compare tax regimes</DialogTitle>
            <DialogDescription>
              Runs the live TDS engine on published {ctx.financialYear} slabs.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Labeled label="Annual income (₹)">
              <Input
                type="number"
                min={0}
                value={income}
                onChange={(e) => setIncome(e.target.value)}
              />
            </Labeled>
            <Labeled label="Age category">
              <Select className="w-full" value={age} onChange={(e) => setAge(e.target.value)}>
                {AGE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Labeled>
            <Labeled label="80C deductions (₹)">
              <Input
                type="number"
                min={0}
                value={ded80c}
                onChange={(e) => setDed80c(e.target.value)}
              />
            </Labeled>
            <Labeled label="80D deductions (₹)">
              <Input
                type="number"
                min={0}
                value={ded80d}
                onChange={(e) => setDed80d(e.target.value)}
              />
            </Labeled>
          </div>
          {compare.data && <CompareResultView result={compare.data} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button
              onClick={() => compare.mutate()}
              disabled={compare.isPending || !Number(income)}
            >
              {compare.isPending ? 'Calculating…' : 'Compare'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface EmployeeOption {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
}

/** Per-employee TDS check: pulls their live CTC and runs both regimes. */
export function TdsCheckDialog(ctx: TaxActionContext) {
  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState('');
  const [income, setIncome] = useState('');
  const toast = useToast();

  const { data: employees } = useQuery({
    queryKey: ['employees', 'options', 'tds'],
    queryFn: () =>
      api
        .get('/employees', { params: { pageSize: 100 } })
        .then((r) => r.data.data as EmployeeOption[]),
    enabled: open,
  });

  const pickEmployee = async (id: string) => {
    setEmployeeId(id);
    if (!id) return;
    try {
      const salaries = await api.get(`/payroll/salaries/${id}`).then((r) => r.data);
      const ctc = salaries?.[0]?.ctc;
      if (ctc) setIncome(String(Number(ctc)));
      else toast('No salary on file — enter annual income manually', 'info');
    } catch {
      toast('Could not load salary — enter annual income manually', 'info');
    }
  };

  const check = useMutation({
    mutationFn: () =>
      api
        .post(
          '/tax/payroll/compare-regimes',
          compareInput(ctx, Number(income), 150000, 25000, 'BELOW_60', employeeId),
        )
        .then((r) => r.data as CompareResponse),
    onError: (err) => toast(apiErrorMessage(err), 'error'),
  });

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} disabled={!ctx.taxYearId}>
        <Calculator className="h-4 w-4" /> Run TDS check
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>TDS check</DialogTitle>
            <DialogDescription>
              Computes annual tax and monthly TDS from the employee&apos;s current CTC (assumes
              standard 80C/80D declarations).
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Labeled label="Employee">
              <Select
                className="w-full"
                value={employeeId}
                onChange={(e) => pickEmployee(e.target.value)}
              >
                <option value="">Select…</option>
                {employees?.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.firstName} {e.lastName} ({e.employeeCode})
                  </option>
                ))}
              </Select>
            </Labeled>
            <Labeled label="Annual CTC (₹)">
              <Input
                type="number"
                min={0}
                value={income}
                onChange={(e) => setIncome(e.target.value)}
              />
            </Labeled>
          </div>
          {check.data && <CompareResultView result={check.data} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button onClick={() => check.mutate()} disabled={check.isPending || !Number(income)}>
              {check.isPending ? 'Calculating…' : 'Run check'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// FY 2025-26 statutory slabs (India). fixedTax carries the cumulative tax of
// all lower slabs so the engine can compute in one pass.
const STANDARD_SLABS = [
  // New regime — same bands for every age category
  ...['BELOW_60', 'SENIOR_60_80', 'SUPER_SENIOR_80_PLUS'].flatMap((age) => [
    {
      regime: 'NEW',
      ageCategory: age,
      minIncome: 0,
      maxIncome: 300000,
      taxRate: 0,
      fixedTax: 0,
      sortOrder: 1,
    },
    {
      regime: 'NEW',
      ageCategory: age,
      minIncome: 300000,
      maxIncome: 700000,
      taxRate: 0.05,
      fixedTax: 0,
      sortOrder: 2,
    },
    {
      regime: 'NEW',
      ageCategory: age,
      minIncome: 700000,
      maxIncome: 1000000,
      taxRate: 0.1,
      fixedTax: 20000,
      sortOrder: 3,
    },
    {
      regime: 'NEW',
      ageCategory: age,
      minIncome: 1000000,
      maxIncome: 1200000,
      taxRate: 0.15,
      fixedTax: 50000,
      sortOrder: 4,
    },
    {
      regime: 'NEW',
      ageCategory: age,
      minIncome: 1200000,
      maxIncome: 1500000,
      taxRate: 0.2,
      fixedTax: 80000,
      sortOrder: 5,
    },
    {
      regime: 'NEW',
      ageCategory: age,
      minIncome: 1500000,
      maxIncome: undefined,
      taxRate: 0.3,
      fixedTax: 140000,
      sortOrder: 6,
    },
  ]),
  // Old regime — exemption limit varies by age
  {
    regime: 'OLD',
    ageCategory: 'BELOW_60',
    minIncome: 0,
    maxIncome: 250000,
    taxRate: 0,
    fixedTax: 0,
    sortOrder: 1,
  },
  {
    regime: 'OLD',
    ageCategory: 'BELOW_60',
    minIncome: 250000,
    maxIncome: 500000,
    taxRate: 0.05,
    fixedTax: 0,
    sortOrder: 2,
  },
  {
    regime: 'OLD',
    ageCategory: 'BELOW_60',
    minIncome: 500000,
    maxIncome: 1000000,
    taxRate: 0.2,
    fixedTax: 12500,
    sortOrder: 3,
  },
  {
    regime: 'OLD',
    ageCategory: 'BELOW_60',
    minIncome: 1000000,
    maxIncome: undefined,
    taxRate: 0.3,
    fixedTax: 112500,
    sortOrder: 4,
  },
  {
    regime: 'OLD',
    ageCategory: 'SENIOR_60_80',
    minIncome: 0,
    maxIncome: 300000,
    taxRate: 0,
    fixedTax: 0,
    sortOrder: 1,
  },
  {
    regime: 'OLD',
    ageCategory: 'SENIOR_60_80',
    minIncome: 300000,
    maxIncome: 500000,
    taxRate: 0.05,
    fixedTax: 0,
    sortOrder: 2,
  },
  {
    regime: 'OLD',
    ageCategory: 'SENIOR_60_80',
    minIncome: 500000,
    maxIncome: 1000000,
    taxRate: 0.2,
    fixedTax: 10000,
    sortOrder: 3,
  },
  {
    regime: 'OLD',
    ageCategory: 'SENIOR_60_80',
    minIncome: 1000000,
    maxIncome: undefined,
    taxRate: 0.3,
    fixedTax: 110000,
    sortOrder: 4,
  },
  {
    regime: 'OLD',
    ageCategory: 'SUPER_SENIOR_80_PLUS',
    minIncome: 0,
    maxIncome: 500000,
    taxRate: 0,
    fixedTax: 0,
    sortOrder: 1,
  },
  {
    regime: 'OLD',
    ageCategory: 'SUPER_SENIOR_80_PLUS',
    minIncome: 500000,
    maxIncome: 1000000,
    taxRate: 0.2,
    fixedTax: 0,
    sortOrder: 2,
  },
  {
    regime: 'OLD',
    ageCategory: 'SUPER_SENIOR_80_PLUS',
    minIncome: 1000000,
    maxIncome: undefined,
    taxRate: 0.3,
    fixedTax: 100000,
    sortOrder: 3,
  },
];

/** Re-imports the standard statutory slab set for the active FY. */
export function ImportSlabsDialog(ctx: TaxActionContext) {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const queryClient = useQueryClient();

  const importSlabs = useMutation({
    mutationFn: () =>
      api.post(
        '/tax/slabs/import',
        { slabs: STANDARD_SLABS },
        { params: { tenantId: ctx.tenantId, taxYearId: ctx.taxYearId } },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tax'] });
      toast(`Imported ${STANDARD_SLABS.length} standard slabs for ${ctx.financialYear}`);
      setOpen(false);
    },
    onError: (err) => toast(apiErrorMessage(err), 'error'),
  });

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} disabled={!ctx.taxYearId}>
        <ReceiptText className="h-4 w-4" /> Import slabs
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Import standard slabs</DialogTitle>
            <DialogDescription>
              Replaces the published slabs for {ctx.financialYear} with the Indian statutory set —
              new regime bands for all age categories and old regime with age-based exemption
              limits. Existing slabs are archived, not deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => importSlabs.mutate()} disabled={importSlabs.isPending}>
              {importSlabs.isPending ? 'Importing…' : `Import ${STANDARD_SLABS.length} slabs`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Clones the active FY's full rule set into the next financial year. */
export function CloneNextYearDialog(ctx: TaxActionContext) {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const queryClient = useQueryClient();

  // "2025-26" -> { financialYear: "2026-27", assessmentYear: "2027-28" }
  const startYear = Number(ctx.financialYear?.split('-')[0]);
  const nextFy = startYear
    ? `${startYear + 1}-${String((startYear + 2) % 100).padStart(2, '0')}`
    : null;
  const nextAy = startYear
    ? `${startYear + 2}-${String((startYear + 3) % 100).padStart(2, '0')}`
    : null;

  const clone = useMutation({
    mutationFn: () =>
      api.post(
        `/tax/years/${ctx.taxYearId}/clone`,
        { financialYear: nextFy, assessmentYear: nextAy },
        { params: { tenantId: ctx.tenantId } },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tax'] });
      toast(`Cloned ${ctx.financialYear} rules into FY ${nextFy}`);
      setOpen(false);
    },
    onError: (err) => toast(apiErrorMessage(err), 'error'),
  });

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} disabled={!ctx.taxYearId || !nextFy}>
        <FileClock className="h-4 w-4" /> Clone next FY
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Clone into FY {nextFy}</DialogTitle>
            <DialogDescription>
              Copies all {ctx.financialYear} tax rules — slabs, surcharge, rebate, cess, deduction
              and exemption rules — into FY {nextFy} (AY {nextAy}) as a new versioned year.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => clone.mutate()} disabled={clone.isPending}>
              {clone.isPending ? 'Cloning…' : 'Clone year'}
            </Button>
          </DialogFooter>
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
