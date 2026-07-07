'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { FileClock, Landmark, LockKeyhole, ReceiptText } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate, formatINR } from '@/lib/utils';
import {
  CloneNextYearDialog,
  CompareRegimesDialog,
  ImportSlabsDialog,
  TdsCheckDialog,
} from '@/components/forms/tax-actions';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

interface TaxYear {
  id: string;
  financialYear: string;
  assessmentYear: string;
  country: string;
  isActive: boolean;
  isDefault: boolean;
  effectiveFrom: string;
  effectiveTo?: string | null;
}

interface RegimeConfig {
  id: string;
  regime: 'NEW' | 'OLD';
  name: string;
  isDefault: boolean;
  employeeCanSelect: boolean;
}

interface TaxSlab {
  id: string;
  regime: 'NEW' | 'OLD';
  ageCategory: string;
  minIncome: number;
  maxIncome: number | null;
  taxRate: string | number;
  fixedTax: string | number;
  sortOrder: number;
  status: string;
}

const ageLabels: Record<string, string> = {
  BELOW_60: 'Below 60',
  SENIOR_60_80: 'Senior 60-80',
  SUPER_SENIOR_80_PLUS: 'Super senior 80+',
};

export default function TaxPage() {
  const { data: session } = useSession();
  const tenantId = session?.user?.tenant?.id;

  const { data: years, isLoading: yearsLoading } = useQuery({
    queryKey: ['tax', 'years', tenantId],
    queryFn: () => api.get('/tax/years', { params: { tenantId } }).then((r) => r.data as TaxYear[]),
    enabled: Boolean(tenantId),
  });

  const activeYear = useMemo(
    () =>
      years?.find((year) => year.isDefault) ?? years?.find((year) => year.isActive) ?? years?.[0],
    [years],
  );

  const { data: regimes } = useQuery({
    queryKey: ['tax', 'regimes', tenantId, activeYear?.id],
    queryFn: () =>
      api
        .get('/tax/regimes', { params: { tenantId, taxYearId: activeYear?.id } })
        .then((r) => r.data as RegimeConfig[]),
    enabled: Boolean(tenantId && activeYear?.id),
  });

  const { data: slabs, isLoading: slabsLoading } = useQuery({
    queryKey: ['tax', 'slabs', tenantId, activeYear?.id],
    queryFn: () =>
      api
        .get('/tax/slabs', { params: { tenantId, taxYearId: activeYear?.id } })
        .then((r) => r.data as TaxSlab[]),
    enabled: Boolean(tenantId && activeYear?.id),
  });

  const below60New =
    slabs?.filter((slab) => slab.regime === 'NEW' && slab.ageCategory === 'BELOW_60') ?? [];
  const below60Old =
    slabs?.filter((slab) => slab.regime === 'OLD' && slab.ageCategory === 'BELOW_60') ?? [];

  if (yearsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tax Engine"
        description="Versioned income tax slabs, regime controls, deductions and TDS administration"
        actions={
          <div className="flex flex-wrap gap-2">
            <CompareRegimesDialog
              tenantId={tenantId}
              taxYearId={activeYear?.id}
              financialYear={activeYear?.financialYear}
            />
            <ImportSlabsDialog
              tenantId={tenantId}
              taxYearId={activeYear?.id}
              financialYear={activeYear?.financialYear}
            />
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Financial year"
          value={activeYear?.financialYear ?? 'Not set'}
          icon={FileClock}
        >
          <p className="text-xs text-ink-muted">AY {activeYear?.assessmentYear ?? '-'}</p>
        </StatCard>
        <StatCard
          label="Default regime"
          value={regimes?.find((r) => r.isDefault)?.regime ?? 'NEW'}
          icon={Landmark}
        >
          <p className="text-xs text-ink-muted">
            Section 115BAC default, old regime opt-out supported
          </p>
        </StatCard>
        <StatCard label="Published slabs" value={slabs?.length ?? 0} icon={ReceiptText}>
          <p className="text-xs text-ink-muted">Versioned by country, age category and regime</p>
        </StatCard>
        <StatCard label="Regime lock" value="Admin" icon={LockKeyhole}>
          <p className="text-xs text-ink-muted">Audit-ready employee selection window</p>
        </StatCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_1.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Rule Control Plane</CardTitle>
            <CardDescription>
              PRD-required controls for tax-year governance and payroll readiness.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-line bg-slate-50 p-4">
              <p className="text-sm font-semibold text-ink">
                {activeYear?.country ?? 'IN'} tax year
              </p>
              <div className="mt-3 grid gap-3 text-sm">
                <Row label="Effective from" value={formatDate(activeYear?.effectiveFrom)} />
                <Row label="Effective to" value={formatDate(activeYear?.effectiveTo)} />
                <Row
                  label="Status"
                  value={
                    <Badge variant={activeYear?.isActive ? 'success' : 'outline'}>
                      {activeYear?.isActive ? 'Active' : 'Draft'}
                    </Badge>
                  }
                />
                <Row
                  label="Default year"
                  value={
                    <Badge variant={activeYear?.isDefault ? 'success' : 'outline'}>
                      {activeYear?.isDefault ? 'Yes' : 'No'}
                    </Badge>
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              {(regimes ?? []).map((regime) => (
                <div
                  key={regime.id}
                  className="flex items-center justify-between rounded-lg border border-line px-3 py-2.5"
                >
                  <div>
                    <p className="text-sm font-semibold">{regime.name}</p>
                    <p className="text-xs text-ink-muted">
                      Employees can select: {regime.employeeCanSelect ? 'Yes' : 'No'}
                    </p>
                  </div>
                  <Badge variant={regime.isDefault ? 'success' : 'outline'}>{regime.regime}</Badge>
                </div>
              ))}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <TdsCheckDialog
                tenantId={tenantId}
                taxYearId={activeYear?.id}
                financialYear={activeYear?.financialYear}
              />
              <CloneNextYearDialog
                tenantId={tenantId}
                taxYearId={activeYear?.id}
                financialYear={activeYear?.financialYear}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Published Slabs - Individual Below 60</CardTitle>
            <CardDescription>
              AY {activeYear?.assessmentYear ?? '-'} slab configuration from the database.
            </CardDescription>
          </CardHeader>
          <Table>
            <THead>
              <TR>
                <TH>Regime</TH>
                <TH>Income band</TH>
                <TH>Rate</TH>
                <TH>Fixed tax</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {slabsLoading && (
                <TR>
                  <TD colSpan={5}>Loading slabs...</TD>
                </TR>
              )}
              {[...below60New, ...below60Old].map((slab) => (
                <TR key={slab.id}>
                  <TD>
                    <Badge variant={slab.regime === 'NEW' ? 'success' : 'info'}>
                      {slab.regime}
                    </Badge>
                  </TD>
                  <TD className="font-medium">
                    {formatINR(slab.minIncome)} -{' '}
                    {slab.maxIncome ? formatINR(slab.maxIncome) : 'Above'}
                  </TD>
                  <TD>{(Number(slab.taxRate) * 100).toFixed(0)}%</TD>
                  <TD className="text-ink-muted">{formatINR(Number(slab.fixedTax))}</TD>
                  <TD>
                    <Badge variant={statusVariant(slab.status)}>{slab.status}</Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {['BELOW_60', 'SENIOR_60_80', 'SUPER_SENIOR_80_PLUS'].map((age) => {
          const count = slabs?.filter((slab) => slab.ageCategory === age).length ?? 0;
          return (
            <Card key={age}>
              <CardHeader>
                <CardTitle>{ageLabels[age]}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold">{count}</p>
                <p className="mt-1 text-sm text-ink-muted">
                  Published slab rows across old and new regimes
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-ink-muted">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
