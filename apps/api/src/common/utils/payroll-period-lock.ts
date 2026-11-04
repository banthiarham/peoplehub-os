import { BadRequestException } from '@nestjs/common';
import { PayrollRunStatus, Prisma } from '@prisma/client';

/**
 * The payroll-period lock: what may no longer be changed once payroll has been frozen, and
 * who exactly it was frozen for.
 *
 * Lives in `common` rather than in either module because both the attendance service and the
 * approval workflow have to apply the same rule, and the workflow applies it inside an
 * interactive transaction. The client is therefore a parameter, the same convention
 * `syncSystemPunchEvents` and `missingCatalogRoleNames` already use, so one implementation
 * serves `PrismaService` and a `Prisma.TransactionClient` alike.
 */

/**
 * Payroll run statuses past the point of no return. `PayrollService.lockRun` records loan
 * installments and `reprocessRun` refuses anything beyond `APPROVED`, so from `LOCKED` onwards
 * a run can never be recomputed: whatever attendance and comp-off data it was processed from
 * is what it paid. `REVIEW` and `APPROVED` are deliberately absent - those can still be
 * reprocessed, which is how a late attendance correction is meant to reach payroll.
 */
export const PAYROLL_PERIOD_LOCK_STATUSES: PayrollRunStatus[] = [
  PayrollRunStatus.LOCKED,
  PayrollRunStatus.PUBLISHED,
  PayrollRunStatus.CLOSED,
];

/** Any Prisma client or transaction client able to read payroll runs. */
export type PayrollRunReader = Pick<Prisma.TransactionClient, 'payrollRun'>;

export interface PayrollPeriod {
  /** 1-12. */
  month: number;
  year: number;
}

export interface FrozenRunQuery {
  tenantId: string;
  period: PayrollPeriod;
  /**
   * The employees the operation would affect. Membership is read from the run's own
   * `PayrollRunEmployee` entries rather than inferred from the employees' current location or
   * legal entity: `PayrollService.executeRun` writes one entry per employee it processed
   * (including a zeroed one for an employee it could not pay) and deletes the entries of
   * employees who left its scope, so the entries are what the run actually covered - and they
   * stay correct after an employee moves location or entity.
   */
  employeeIds: string[];
}

/** `2026-07`, the form the finalization DTO and the error messages both use. */
export function formatPayrollPeriod(period: PayrollPeriod): string {
  return `${period.year}-${String(period.month).padStart(2, '0')}`;
}

/** Map key for {@link frozenPayrollPeriodsFor}. */
export function payrollPeriodKey(employeeId: string, period: PayrollPeriod): string {
  return `${employeeId}|${formatPayrollPeriod(period)}`;
}

/** The period a date falls in, in the UTC day space attendance dates are anchored to. */
export function payrollPeriodOf(date: Date): PayrollPeriod {
  return { month: date.getUTCMonth() + 1, year: date.getUTCFullYear() };
}

/**
 * The frozen run covering any of `employeeIds` for the period, or `null` when none does.
 *
 * An empty `employeeIds` is not a wildcard: an operation that affects nobody cannot
 * contradict a frozen run, so it short-circuits without a query.
 */
export async function findFrozenPayrollRun(
  client: PayrollRunReader,
  { tenantId, period, employeeIds }: FrozenRunQuery,
): Promise<{ status: PayrollRunStatus } | null> {
  if (employeeIds.length === 0) return null;
  return client.payrollRun.findFirst({
    where: {
      tenantId,
      month: period.month,
      year: period.year,
      status: { in: PAYROLL_PERIOD_LOCK_STATUSES },
      entries: { some: { employeeId: { in: employeeIds } } },
    },
    select: { status: true },
  });
}

/**
 * Refuses an operation that would change what an already-frozen payroll run was computed
 * from. `consequence` completes the sentence `Payroll for 2026-07 is already locked; ...`.
 */
export async function assertPayrollPeriodOpen(
  client: PayrollRunReader,
  query: FrozenRunQuery,
  consequence: string,
): Promise<void> {
  const frozen = await findFrozenPayrollRun(client, query);
  if (frozen) {
    throw new BadRequestException(
      `Payroll for ${formatPayrollPeriod(query.period)} is already ` +
        `${frozen.status.toLowerCase()}; ${consequence}`,
    );
  }
}

/**
 * The frozen status per (employee, period) across several periods at once, for a bulk
 * operation such as an attendance import: one query for the whole upload rather than one per
 * row. Keyed by {@link payrollPeriodKey}; a key is absent when that employee's period is not
 * frozen.
 */
export async function frozenPayrollPeriodsFor(
  client: PayrollRunReader,
  { tenantId, periods, employeeIds }: { tenantId: string; periods: PayrollPeriod[]; employeeIds: string[] },
): Promise<Map<string, PayrollRunStatus>> {
  const frozen = new Map<string, PayrollRunStatus>();
  const distinctPeriods = [...new Map(periods.map((period) => [formatPayrollPeriod(period), period])).values()];
  if (employeeIds.length === 0 || distinctPeriods.length === 0) return frozen;

  const runs = await client.payrollRun.findMany({
    where: {
      tenantId,
      status: { in: PAYROLL_PERIOD_LOCK_STATUSES },
      OR: distinctPeriods.map(({ month, year }) => ({ month, year })),
      entries: { some: { employeeId: { in: employeeIds } } },
    },
    select: {
      month: true,
      year: true,
      status: true,
      // Narrowed to the uploaded employees: a tenant-wide run's full entry list is the whole
      // headcount, which this lookup has no use for.
      entries: { where: { employeeId: { in: employeeIds } }, select: { employeeId: true } },
    },
  });

  for (const run of runs) {
    for (const entry of run.entries) {
      frozen.set(payrollPeriodKey(entry.employeeId, run), run.status);
    }
  }
  return frozen;
}
