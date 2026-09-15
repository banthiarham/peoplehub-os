import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PayrollService } from './payroll.service';
import { PayrollPolicyService } from './payroll-policy.service';
import { SalaryDenominatorService } from './salary-denominator.service';
import { AuthUser } from '../../common/types/auth-user';

type FinalizationFixture = {
  tenantId: string;
  month: number;
  year: number;
  locationId: string | null;
  status: string;
};

/**
 * Denominator double for the specs that never reach `processRun`. An empty map leaves every
 * employee on the calendar-days fallback, which is what those specs assumed before the
 * denominator became configurable.
 */
function stubDenominators() {
  return { resolveForMonth: jest.fn().mockResolvedValue(new Map()) };
}

/**
 * Minimal prisma double for `processRun`. The attendance finalization lookup
 * matches the fixtures against the real `where` clause so tenant, month, year
 * and location scoping are exercised rather than stubbed away.
 */
function buildProcessRunHarness(options: {
  run?: Record<string, unknown>;
  finalizations?: FinalizationFixture[];
  leaveRequests?: Array<Record<string, unknown>>;
  employeeOverrides?: Record<string, unknown>;
  attendanceRecords?: Array<{ employeeId: string; status: string; isFinalized: boolean; date?: Date }>;
  /** Resolved by the real PayrollPolicyService; null (the default) means CALENDAR_DAYS. */
  payrollPolicies?: Array<Record<string, unknown>>;
  holidays?: Date[];
  /** Weekly offs of the shift every employee resolves to; undefined means "no shift". */
  weeklyOffDays?: number[];
  /** One entry per employee in the run, merged over the default fixture. */
  extraEmployees?: Array<Record<string, unknown>>;
  /** USED Comp-Off grants; matched against the real `where` (tenant/employee/status/date range). */
  usedCompOffGrants?: Array<{ employeeId: string; usedOnDate: Date; status?: string; tenantId?: string }>;
  /** AVAILABLE Comp-Off grants; matched against the real `where` (tenant/employee/status only). */
  availableCompOffGrants?: Array<{
    id?: string;
    employeeId: string;
    earnedDate: Date;
    expiresAt?: Date | null;
    days?: number;
    status?: string;
    tenantId?: string;
  }>;
} = {}) {
  const run = {
    id: 'run-1',
    tenantId: 'tenant-1',
    status: 'DRAFT',
    runType: 'MONTHLY',
    month: 7,
    year: 2026,
    legalEntityId: null,
    locationId: null,
    ...options.run,
  };
  const finalizations = options.finalizations ?? [];
  // Backs the payrollVariableInput mock below with real create/delete/read semantics (rather
  // than a static empty array) so a Comp-Off payout this run creates is genuinely visible to
  // the same query that later folds variable inputs into gross/net pay - the same integration
  // a real database gives for free.
  let compOffPayoutStore: Array<Record<string, unknown>> = [];
  const prisma = {
    payrollRun: {
      findFirst: jest.fn().mockResolvedValue(run),
      update: jest.fn().mockResolvedValue(run),
    },
    employee: {
      findMany: jest.fn().mockResolvedValue(
        (options.extraEmployees ?? [{}]).map((overrides, index) => ({
          id: 'emp-1',
          employeeCode: `PH00${index + 1}`,
          firstName: 'Asha',
          lastName: 'Shah',
          status: 'ACTIVE',
          joiningDate: new Date('2024-01-01'),
          exitDate: null,
          noticePeriodDays: 30,
          dateOfBirth: new Date('1990-01-01'),
          pan: 'ABCDE1234F',
          taxRegime: 'NEW',
          uan: '100200300400',
          bankDetails: { account: '123' },
          legalEntityId: null,
          locationId: run.locationId,
          employeeSalaries: [{ ctc: 1200000, components: [] }],
          loans: [],
          ...options.employeeOverrides,
          ...overrides,
        })),
      ),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    attendanceRecord: {
      groupBy: jest.fn().mockResolvedValue([]),
      // Honours the LOP projection filters so leave-reconciled days are excluded
      // by the query under test rather than by the fixture. A record without an explicit
      // `date` defaults to the 10th of the run month, so fixtures written before Comp-Off
      // offsetting needed day-level detail keep working unchanged.
      findMany: jest.fn(({ where }: { where: Record<string, any> }) =>
        Promise.resolve(
          (options.attendanceRecords ?? [])
            .filter(
              (record) =>
                record.isFinalized === where.isFinalized &&
                (where.status?.in ?? []).includes(record.status),
            )
            .map((record) => ({
              ...record,
              date: record.date ?? new Date(Date.UTC(run.year as number, (run.month as number) - 1, 10)),
            })),
        ),
      ),
    },
    attendanceFinalization: {
      findFirst: jest.fn(({ where }: { where: Record<string, any> }) =>
        Promise.resolve(
          finalizations.find(
            (finalization) =>
              finalization.tenantId === where.tenantId &&
              finalization.month === where.month &&
              finalization.year === where.year &&
              finalization.status === where.status &&
              (where.OR
                ? where.OR.some(
                    (clause: { locationId: string | null }) =>
                      clause.locationId === finalization.locationId,
                  )
                : finalization.locationId === where.locationId),
          ) ?? null,
        ),
      ),
    },
    leaveRequest: {
      findMany: jest.fn().mockResolvedValue(options.leaveRequests ?? []),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    payrollVariableInput: {
      findMany: jest.fn(({ where }: { where: Record<string, any> }) =>
        Promise.resolve(
          compOffPayoutStore.filter(
            (input) =>
              input.tenantId === where.tenantId &&
              (where.employeeId?.in ?? []).includes(input.employeeId) &&
              input.status === where.status &&
              (where.OR ?? []).some(
                (clause: { payrollRunId: string | null; month?: number; year?: number }) =>
                  clause.payrollRunId === input.payrollRunId &&
                  (clause.month === undefined || (clause.month === input.month && clause.year === input.year)),
              ),
          ),
        ),
      ),
      deleteMany: jest.fn(({ where }: { where: Record<string, any> }) => {
        const before = compOffPayoutStore.length;
        compOffPayoutStore = compOffPayoutStore.filter(
          (input) =>
            !(
              input.tenantId === where.tenantId &&
              input.payrollRunId === where.payrollRunId &&
              input.type === where.type &&
              input.source === where.source
            ),
        );
        return Promise.resolve({ count: before - compOffPayoutStore.length });
      }),
      createMany: jest.fn(({ data }: { data: Array<Record<string, unknown>> }) => {
        compOffPayoutStore.push(...data);
        return Promise.resolve({ count: data.length });
      }),
    },
    expenseClaim: {
      findMany: jest.fn().mockResolvedValue([]),
      groupBy: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    taxYear: { findFirst: jest.fn().mockResolvedValue(null) },
    payrollRunEmployee: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({}),
    },
    // Matched against the real `where` so location-scoped policies resolve by precedence
    // instead of every lookup returning the same row.
    payrollPolicy: {
      findFirst: jest.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(
          (options.payrollPolicies ?? []).find((policy) =>
            Object.entries(where).every(([key, value]) => policy[key] === value),
          ) ?? null,
        ),
      ),
    },
    holiday: {
      findMany: jest.fn().mockResolvedValue((options.holidays ?? []).map((date) => ({ date }))),
    },
    // Matched against the real `where` so tenant scoping, the employeeId allowlist and the
    // status/usedOnDate filters are genuinely exercised rather than assumed. Branches on the
    // requested status: USED grants (Phase 5 LOP offset) carry a usedOnDate range filter,
    // AVAILABLE grants (Phase 6 unused payout) do not.
    compOffGrant: {
      findMany: jest.fn(({ where }: { where: Record<string, any> }) => {
        if (where.status === 'AVAILABLE') {
          return Promise.resolve(
            (options.availableCompOffGrants ?? [])
              .filter((grant) => (grant.tenantId ?? 'tenant-1') === where.tenantId)
              .filter((grant) => (where.employeeId?.in ?? []).includes(grant.employeeId))
              .filter((grant) => (grant.status ?? 'AVAILABLE') === where.status)
              .map((grant, index) => ({
                id: grant.id ?? `grant-${index}`,
                employeeId: grant.employeeId,
                earnedDate: grant.earnedDate,
                expiresAt: grant.expiresAt ?? null,
                days: grant.days ?? 1,
              })),
          );
        }
        return Promise.resolve(
          (options.usedCompOffGrants ?? [])
            .filter((grant) => (grant.tenantId ?? 'tenant-1') === where.tenantId)
            .filter((grant) => (where.employeeId?.in ?? []).includes(grant.employeeId))
            .filter((grant) => (grant.status ?? 'USED') === where.status)
            .filter((grant) => grant.usedOnDate >= where.usedOnDate.gte && grant.usedOnDate <= where.usedOnDate.lte)
            .map((grant) => ({ employeeId: grant.employeeId, usedOnDate: grant.usedOnDate })),
        );
      }),
    },
    $transaction: jest.fn((ops: Array<Promise<unknown>>) => Promise.all(ops)),
  };
  const calculator = {
    calculateMonth: jest.fn().mockReturnValue({
      grossPay: 90000,
      totalDeductions: 1800,
      netPay: 88200,
      components: [
        { code: 'BASIC', name: 'Basic', type: 'EARNING', monthly: 40000, annual: 480000 },
        { code: 'SA', name: 'Special Allowance', type: 'EARNING', monthly: 50000, annual: 600000 },
        { code: 'PF_EMP', name: 'PF', type: 'DEDUCTION', monthly: 1800, annual: 21600 },
      ],
    }),
    buildComponents: jest.fn().mockReturnValue([
      { code: 'BASIC', type: 'EARNING', monthly: 40000 },
      { code: 'SA', type: 'EARNING', monthly: 50000 },
    ]),
  };
  // The real policy + denominator services, so `processRun` exercises actual policy
  // resolution and day counting rather than a stubbed number.
  const shifts = {
    resolverForRange: jest.fn().mockResolvedValue(() => ({
      shift: options.weeklyOffDays ? { weeklyOffDays: options.weeklyOffDays } : null,
      assignedLocationId: null,
      assignment: null,
    })),
  };
  const payrollPolicyService = new PayrollPolicyService(prisma as any);
  const denominators = new SalaryDenominatorService(prisma as any, payrollPolicyService, shifts as any);
  const service = new PayrollService(prisma as any, calculator as any, {} as any, denominators as any, payrollPolicyService);
  const entryFor = (employeeId: string) => {
    const call = prisma.payrollRunEmployee.upsert.mock.calls.find(
      ([args]: [{ create: { employeeId: string } }]) => args.create.employeeId === employeeId,
    );
    if (!call) throw new Error(`No payroll entry upserted for ${employeeId}`);
    return call[0].create as {
      errors: string[];
      warnings: string[];
      lopDays: number;
      payableDays: number;
      grossPay: number;
      netPay: number;
      components: Array<{ code: string; type: string; monthly: number }>;
    };
  };
  return { prisma, service, calculator, entryFor };
}

/** Minimal prisma double for `assignSalary` / `deleteSalary`. */
function salaryHarness(
  options: {
    existingSalary?: Record<string, unknown> | null;
    runs?: Array<Record<string, unknown>>;
    otherRevisions?: Array<{ id: string; effectiveFrom: Date; effectiveTo: Date | null }>;
  } = {},
) {
  const employee = { id: 'emp-1', tenantId: 'tenant-1' };
  const structure = {
    id: 'structure-1',
    tenantId: 'tenant-1',
    isActive: true,
    components: [
      {
        name: 'Basic',
        code: 'BASIC',
        type: 'EARNING',
        calculationType: 'PERCENTAGE_OF_GROSS',
        value: 40,
        isTaxable: true,
        isStatutory: false,
        statutoryType: null,
        sequence: 1,
      },
    ],
  };
  const existing = options.existingSalary === undefined ? null : options.existingSalary;
  const runs = options.runs ?? [];
  const otherRevisions = options.otherRevisions ?? [];
  const prisma = {
    employee: { findFirst: jest.fn().mockResolvedValue(employee) },
    salaryStructure: { findFirst: jest.fn().mockResolvedValue(structure) },
    employeeSalary: {
      findFirst: jest.fn().mockResolvedValue(existing),
      findMany: jest.fn(({ where }: { where: { id?: { not: string } } }) =>
        Promise.resolve(otherRevisions.filter((r) => !where.id || r.id !== where.id.not)),
      ),
      update: jest.fn(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
        Promise.resolve({ ...existing, ...data, id: where.id }),
      ),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 'salary-new', ...data })),
      delete: jest.fn(({ where }: { where: { id: string } }) => Promise.resolve({ id: where.id })),
    },
    payrollRun: {
      findFirst: jest.fn(({ where }: { where: Record<string, any> }) =>
        Promise.resolve(
          runs.find(
            (run) =>
              run.tenantId === where.tenantId &&
              run.month === where.month &&
              run.year === where.year &&
              (where.status.in as string[]).includes(run.status as string),
          ) ?? null,
        ),
      ),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  return { prisma, service: new PayrollService(prisma as any, {} as any, {} as any, stubDenominators() as any, {} as any) };
}

describe('PayrollService', () => {
  it('rejects salary structures without a BASIC earning component', async () => {
    const service = new PayrollService({} as any, {} as any, {} as any, stubDenominators() as any, {} as any);

    await expect(
      service.createStructure('tenant-1', 'user-1', {
        name: 'Bad structure',
        components: [
          {
            name: 'Allowance',
            code: 'ALLOW',
            type: 'EARNING',
            calculationType: 'FIXED',
            value: 1000,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('previews configured salary structure components', async () => {
    const prisma = {
      salaryStructure: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'structure-1',
          tenantId: 'tenant-1',
          components: [
            { name: 'Basic', code: 'BASIC', type: 'EARNING', calculationType: 'PERCENTAGE_OF_GROSS', value: 50, isTaxable: true, isStatutory: false, statutoryType: null, sequence: 1 },
            { name: 'Allowance', code: 'ALLOW', type: 'EARNING', calculationType: 'FIXED', value: 0, isTaxable: true, isStatutory: false, statutoryType: null, sequence: 2 },
            { name: 'PF', code: 'PF_EMP', type: 'DEDUCTION', calculationType: 'PERCENTAGE_OF_BASIC', value: 12, isTaxable: false, isStatutory: true, statutoryType: 'PF', sequence: 3 },
          ],
        }),
      },
    };
    const service = new PayrollService(prisma as any, {} as any, {} as any, stubDenominators() as any, {} as any);

    await expect(service.previewStructure('tenant-1', 'structure-1', { ctc: 1200000 })).resolves.toEqual(
      expect.objectContaining({
        monthlyCtc: 100000,
        monthlyGross: expect.any(Number),
        monthlyNet: expect.any(Number),
        components: expect.arrayContaining([
          expect.objectContaining({ code: 'BASIC' }),
          expect.objectContaining({ code: 'PF_EMP' }),
        ]),
      }),
    );
  });

  describe('assignSalary', () => {
    it('updates the existing revision when assigned again with the same effectiveFrom', async () => {
      const existing = {
        id: 'salary-1',
        employeeId: 'emp-1',
        salaryStructureId: 'structure-old',
        ctc: 1000000,
        effectiveFrom: new Date('2026-07-01'),
        effectiveTo: null,
        components: [],
      };
      const { prisma, service } = salaryHarness({ existingSalary: existing });

      const result = await service.assignSalary('tenant-1', {
        employeeId: 'emp-1',
        salaryStructureId: 'structure-1',
        ctc: 1200000,
        effectiveFrom: '2026-07-01',
      } as any);

      expect(prisma.employeeSalary.update).toHaveBeenCalledWith({
        where: { id: 'salary-1' },
        data: { salaryStructureId: 'structure-1', ctc: 1200000, components: expect.anything() },
      });
      // effectiveTo was omitted from the request, so it must not appear in the update payload
      // at all - Prisma leaves the column untouched, preserving the existing value.
      expect(Object.prototype.hasOwnProperty.call(prisma.employeeSalary.update.mock.calls[0][0].data, 'effectiveTo')).toBe(false);
      expect(prisma.employeeSalary.create).not.toHaveBeenCalled();
      expect(prisma.employeeSalary.updateMany).not.toHaveBeenCalled();
      expect(result.id).toBe('salary-1');
    });

    it('creates a new revision and closes the previously open one for a different effectiveFrom', async () => {
      const { prisma, service } = salaryHarness({ existingSalary: null });

      await service.assignSalary('tenant-1', {
        employeeId: 'emp-1',
        salaryStructureId: 'structure-1',
        ctc: 1500000,
        effectiveFrom: '2026-08-01',
      } as any);

      expect(prisma.employeeSalary.updateMany).toHaveBeenCalledWith({
        where: { employeeId: 'emp-1', effectiveTo: null },
        data: { effectiveTo: new Date('2026-08-01') },
      });
      expect(prisma.employeeSalary.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ effectiveFrom: new Date('2026-08-01'), effectiveTo: null }),
        }),
      );
      expect(prisma.employeeSalary.update).not.toHaveBeenCalled();
    });

    it('preserves the existing effectiveTo when the request omits it entirely', async () => {
      const existing = {
        id: 'salary-1',
        employeeId: 'emp-1',
        ctc: 1000000,
        effectiveFrom: new Date('2026-07-01'),
        effectiveTo: new Date('2026-08-01'),
        components: [],
      };
      const { prisma, service } = salaryHarness({ existingSalary: existing });

      await service.assignSalary('tenant-1', {
        employeeId: 'emp-1',
        salaryStructureId: 'structure-1',
        ctc: 1000000,
        effectiveFrom: '2026-07-01',
        // effectiveTo intentionally omitted
      } as any);

      const data = prisma.employeeSalary.update.mock.calls[0][0].data;
      expect(Object.prototype.hasOwnProperty.call(data, 'effectiveTo')).toBe(false);
    });

    it('clears effectiveTo (open-ended) when explicitly passed null', async () => {
      const existing = {
        id: 'salary-1',
        employeeId: 'emp-1',
        ctc: 1000000,
        effectiveFrom: new Date('2026-07-01'),
        effectiveTo: new Date('2026-08-01'),
        components: [],
      };
      const { prisma, service } = salaryHarness({ existingSalary: existing });

      await service.assignSalary('tenant-1', {
        employeeId: 'emp-1',
        salaryStructureId: 'structure-1',
        ctc: 1000000,
        effectiveFrom: '2026-07-01',
        effectiveTo: null,
      } as any);

      expect(prisma.employeeSalary.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ effectiveTo: null }) }),
      );
    });

    it('updates effectiveTo to the given date when one is provided', async () => {
      const existing = {
        id: 'salary-1',
        employeeId: 'emp-1',
        ctc: 1000000,
        effectiveFrom: new Date('2026-07-01'),
        effectiveTo: null,
        components: [],
      };
      const { prisma, service } = salaryHarness({ existingSalary: existing });

      await service.assignSalary('tenant-1', {
        employeeId: 'emp-1',
        salaryStructureId: 'structure-1',
        ctc: 1000000,
        effectiveFrom: '2026-07-01',
        effectiveTo: '2026-07-16',
      } as any);

      expect(prisma.employeeSalary.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ effectiveTo: new Date('2026-07-16') }) }),
      );
    });

    it('does not affect a brand new revision when effectiveTo is omitted (still open-ended)', async () => {
      const { prisma, service } = salaryHarness({ existingSalary: null });

      await service.assignSalary('tenant-1', {
        employeeId: 'emp-1',
        salaryStructureId: 'structure-1',
        ctc: 1500000,
        effectiveFrom: '2026-09-01',
        // effectiveTo intentionally omitted
      } as any);

      expect(prisma.employeeSalary.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ effectiveTo: null }) }),
      );
    });

    it('does not touch unrelated salary history rows when editing one revision by effectiveFrom', async () => {
      const existing = {
        id: 'salary-2',
        employeeId: 'emp-1',
        ctc: 1000000,
        effectiveFrom: new Date('2026-07-16'),
        effectiveTo: null,
        components: [],
      };
      const { prisma, service } = salaryHarness({ existingSalary: existing });

      await service.assignSalary('tenant-1', {
        employeeId: 'emp-1',
        salaryStructureId: 'structure-1',
        ctc: 1300000,
        effectiveFrom: '2026-07-16',
      } as any);

      expect(prisma.employeeSalary.updateMany).not.toHaveBeenCalled();
      expect(prisma.employeeSalary.create).not.toHaveBeenCalled();
      expect(prisma.employeeSalary.update).toHaveBeenCalledTimes(1);
    });

    it('refuses to edit a revision once payroll for its period is locked', async () => {
      const existing = {
        id: 'salary-1',
        employeeId: 'emp-1',
        ctc: 1000000,
        effectiveFrom: new Date('2026-07-01'),
        effectiveTo: null,
        components: [],
      };
      const { prisma, service } = salaryHarness({
        existingSalary: existing,
        runs: [{ tenantId: 'tenant-1', month: 7, year: 2026, status: 'LOCKED' }],
      });

      await expect(
        service.assignSalary('tenant-1', {
          employeeId: 'emp-1',
          salaryStructureId: 'structure-1',
          ctc: 1300000,
          effectiveFrom: '2026-07-01',
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.employeeSalary.update).not.toHaveBeenCalled();
    });

    it.each(['PUBLISHED', 'CLOSED'])('also refuses to edit once the run is %s', async (status) => {
      const existing = {
        id: 'salary-1',
        employeeId: 'emp-1',
        ctc: 1000000,
        effectiveFrom: new Date('2026-07-01'),
        effectiveTo: null,
        components: [],
      };
      const { prisma, service } = salaryHarness({
        existingSalary: existing,
        runs: [{ tenantId: 'tenant-1', month: 7, year: 2026, status }],
      });

      await expect(
        service.assignSalary('tenant-1', {
          employeeId: 'emp-1',
          salaryStructureId: 'structure-1',
          ctc: 1300000,
          effectiveFrom: '2026-07-01',
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.employeeSalary.update).not.toHaveBeenCalled();
    });

    it('still allows editing while payroll for its period has not reached LOCKED (e.g. REVIEW)', async () => {
      const existing = {
        id: 'salary-1',
        employeeId: 'emp-1',
        ctc: 1000000,
        effectiveFrom: new Date('2026-07-01'),
        effectiveTo: null,
        components: [],
      };
      const { prisma, service } = salaryHarness({
        existingSalary: existing,
        runs: [{ tenantId: 'tenant-1', month: 7, year: 2026, status: 'REVIEW' }],
      });

      await service.assignSalary('tenant-1', {
        employeeId: 'emp-1',
        salaryStructureId: 'structure-1',
        ctc: 1300000,
        effectiveFrom: '2026-07-01',
      } as any);

      expect(prisma.employeeSalary.update).toHaveBeenCalled();
    });

    it('does not lock-check a brand new revision (no existing row at that effectiveFrom)', async () => {
      const { prisma, service } = salaryHarness({
        existingSalary: null,
        runs: [{ tenantId: 'tenant-1', month: 8, year: 2026, status: 'LOCKED' }],
      });

      await service.assignSalary('tenant-1', {
        employeeId: 'emp-1',
        salaryStructureId: 'structure-1',
        ctc: 1500000,
        effectiveFrom: '2026-08-01',
      } as any);

      expect(prisma.employeeSalary.create).toHaveBeenCalled();
    });

    it('rejects effectiveFrom after effectiveTo when creating a new revision', async () => {
      const { prisma, service } = salaryHarness({ existingSalary: null });

      await expect(
        service.assignSalary('tenant-1', {
          employeeId: 'emp-1',
          salaryStructureId: 'structure-1',
          ctc: 1000000,
          effectiveFrom: '2026-08-01',
          effectiveTo: '2026-07-01',
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.employeeSalary.create).not.toHaveBeenCalled();
    });

    it('rejects effectiveFrom after effectiveTo when editing an existing revision', async () => {
      const existing = {
        id: 'salary-1',
        employeeId: 'emp-1',
        ctc: 1000000,
        effectiveFrom: new Date('2026-07-01'),
        effectiveTo: null,
        components: [],
      };
      const { prisma, service } = salaryHarness({ existingSalary: existing });

      await expect(
        service.assignSalary('tenant-1', {
          employeeId: 'emp-1',
          salaryStructureId: 'structure-1',
          ctc: 1000000,
          effectiveFrom: '2026-07-01',
          effectiveTo: '2026-06-01',
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.employeeSalary.update).not.toHaveBeenCalled();
    });

    it('rejects a new revision that overlaps an existing closed revision', async () => {
      const { prisma, service } = salaryHarness({
        existingSalary: null,
        otherRevisions: [
          { id: 'salary-old', effectiveFrom: new Date('2026-01-01'), effectiveTo: new Date('2026-06-01') },
        ],
      });

      await expect(
        service.assignSalary('tenant-1', {
          employeeId: 'emp-1',
          salaryStructureId: 'structure-1',
          ctc: 1000000,
          effectiveFrom: '2026-03-01',
          effectiveTo: '2026-09-01',
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.employeeSalary.create).not.toHaveBeenCalled();
    });

    it('allows a new revision that starts exactly when a prior closed revision ends (contiguous, not overlapping)', async () => {
      const { prisma, service } = salaryHarness({
        existingSalary: null,
        otherRevisions: [
          { id: 'salary-old', effectiveFrom: new Date('2026-01-01'), effectiveTo: new Date('2026-06-01') },
        ],
      });

      await service.assignSalary('tenant-1', {
        employeeId: 'emp-1',
        salaryStructureId: 'structure-1',
        ctc: 1000000,
        effectiveFrom: '2026-06-01',
      } as any);

      expect(prisma.employeeSalary.create).toHaveBeenCalled();
    });

    it('allows the everyday case: a new revision after the currently open-ended one (auto-close, not overlap)', async () => {
      const { prisma, service } = salaryHarness({
        existingSalary: null,
        otherRevisions: [
          { id: 'salary-current', effectiveFrom: new Date('2026-01-01'), effectiveTo: null },
        ],
      });

      await service.assignSalary('tenant-1', {
        employeeId: 'emp-1',
        salaryStructureId: 'structure-1',
        ctc: 1500000,
        effectiveFrom: '2026-08-01',
      } as any);

      expect(prisma.employeeSalary.create).toHaveBeenCalled();
    });

    it('rejects a new revision inserted before the currently open-ended one (would corrupt it on auto-close)', async () => {
      const { prisma, service } = salaryHarness({
        existingSalary: null,
        otherRevisions: [
          { id: 'salary-current', effectiveFrom: new Date('2026-08-01'), effectiveTo: null },
        ],
      });

      await expect(
        service.assignSalary('tenant-1', {
          employeeId: 'emp-1',
          salaryStructureId: 'structure-1',
          ctc: 1000000,
          effectiveFrom: '2026-03-01',
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.employeeSalary.create).not.toHaveBeenCalled();
    });

    it('allows a genuinely historical backfill entirely before the currently open-ended revision', async () => {
      const { prisma, service } = salaryHarness({
        existingSalary: null,
        otherRevisions: [
          { id: 'salary-current', effectiveFrom: new Date('2026-08-01'), effectiveTo: null },
        ],
      });

      await service.assignSalary('tenant-1', {
        employeeId: 'emp-1',
        salaryStructureId: 'structure-1',
        ctc: 800000,
        effectiveFrom: '2026-01-01',
        effectiveTo: '2026-03-01',
      } as any);

      expect(prisma.employeeSalary.create).toHaveBeenCalled();
    });

    it('rejects updating an existing revision to a new effectiveTo that overlaps another revision', async () => {
      const existing = {
        id: 'salary-1',
        employeeId: 'emp-1',
        ctc: 1000000,
        effectiveFrom: new Date('2026-07-01'),
        effectiveTo: new Date('2026-08-01'),
        components: [],
      };
      const { prisma, service } = salaryHarness({
        existingSalary: existing,
        otherRevisions: [
          existing,
          { id: 'salary-2', effectiveFrom: new Date('2026-08-01'), effectiveTo: null },
        ],
      });

      await expect(
        service.assignSalary('tenant-1', {
          employeeId: 'emp-1',
          salaryStructureId: 'structure-1',
          ctc: 1000000,
          effectiveFrom: '2026-07-01',
          effectiveTo: '2026-09-01',
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.employeeSalary.update).not.toHaveBeenCalled();
    });
  });

  describe('deleteSalary', () => {
    function salaryHarnessWithExisting(existing: Record<string, unknown> | null, runs: Array<Record<string, unknown>> = []) {
      return salaryHarness({ existingSalary: existing, runs });
    }

    it('deletes a salary revision when payroll for its period is not locked', async () => {
      const existing = {
        id: 'salary-1',
        employeeId: 'emp-1',
        ctc: 1000000,
        effectiveFrom: new Date('2026-07-01'),
        effectiveTo: null,
        components: [],
      };
      const { prisma, service } = salaryHarnessWithExisting(existing);

      const result = await service.deleteSalary('tenant-1', 'salary-1', 'user-1');

      expect(prisma.employeeSalary.delete).toHaveBeenCalledWith({ where: { id: 'salary-1' } });
      expect(result).toEqual({ success: true });
    });

    it('blocks deletion once payroll for the revision period is locked', async () => {
      const existing = {
        id: 'salary-1',
        employeeId: 'emp-1',
        ctc: 1000000,
        effectiveFrom: new Date('2026-07-01'),
        effectiveTo: null,
        components: [],
      };
      const { prisma, service } = salaryHarnessWithExisting(existing, [
        { tenantId: 'tenant-1', month: 7, year: 2026, status: 'LOCKED' },
      ]);

      await expect(service.deleteSalary('tenant-1', 'salary-1', 'user-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.employeeSalary.delete).not.toHaveBeenCalled();
    });

    it.each(['PUBLISHED', 'CLOSED'])('also blocks deletion once the run is %s', async (status) => {
      const existing = {
        id: 'salary-1',
        employeeId: 'emp-1',
        ctc: 1000000,
        effectiveFrom: new Date('2026-07-01'),
        effectiveTo: null,
        components: [],
      };
      const { prisma, service } = salaryHarnessWithExisting(existing, [
        { tenantId: 'tenant-1', month: 7, year: 2026, status },
      ]);

      await expect(service.deleteSalary('tenant-1', 'salary-1', 'user-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.employeeSalary.delete).not.toHaveBeenCalled();
    });

    it('still allows deletion while payroll for its period has not reached LOCKED (e.g. REVIEW)', async () => {
      const existing = {
        id: 'salary-1',
        employeeId: 'emp-1',
        ctc: 1000000,
        effectiveFrom: new Date('2026-07-01'),
        effectiveTo: null,
        components: [],
      };
      const { prisma, service } = salaryHarnessWithExisting(existing, [
        { tenantId: 'tenant-1', month: 7, year: 2026, status: 'REVIEW' },
      ]);

      await service.deleteSalary('tenant-1', 'salary-1', 'user-1');

      expect(prisma.employeeSalary.delete).toHaveBeenCalled();
    });

    it('404s for a salary revision that does not exist (or belongs to another tenant)', async () => {
      const { prisma, service } = salaryHarnessWithExisting(null);

      await expect(service.deleteSalary('tenant-1', 'missing-id', 'user-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.employeeSalary.delete).not.toHaveBeenCalled();
    });

    it('does not touch other salary history rows when deleting one revision', async () => {
      const existing = {
        id: 'salary-2',
        employeeId: 'emp-1',
        ctc: 1000000,
        effectiveFrom: new Date('2026-07-16'),
        effectiveTo: null,
        components: [],
      };
      const { prisma, service } = salaryHarnessWithExisting(existing);

      await service.deleteSalary('tenant-1', 'salary-2', 'user-1');

      expect(prisma.employeeSalary.updateMany).not.toHaveBeenCalled();
      expect(prisma.employeeSalary.update).not.toHaveBeenCalled();
      expect(prisma.employeeSalary.delete).toHaveBeenCalledTimes(1);
    });
  });

  it('blocks payroll approval when processed entries contain critical errors', async () => {
    const prisma = {
      payrollRun: {
        findFirst: jest.fn().mockResolvedValue({ id: 'run-1', tenantId: 'tenant-1', status: 'REVIEW' }),
      },
      payrollRunEmployee: {
        findMany: jest.fn().mockResolvedValue([{ errors: ['Missing active salary structure or CTC'] }]),
      },
    };
    const service = new PayrollService(prisma as any, {} as any, {} as any, stubDenominators() as any, {} as any);

    await expect(service.approveRun('tenant-1', 'run-1', 'user-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.payrollRunEmployee.findMany).toHaveBeenCalledWith({
      where: { payrollRunId: 'run-1' },
      select: { errors: true, warnings: true },
    });
  });

  it('approves payroll when preview entries are clear', async () => {
    const prisma = {
      payrollRun: {
        findFirst: jest.fn().mockResolvedValue({ id: 'run-1', tenantId: 'tenant-1', status: 'REVIEW' }),
        update: jest.fn().mockResolvedValue({ id: 'run-1', status: 'APPROVED' }),
      },
      payrollRunEmployee: {
        findMany: jest.fn().mockResolvedValue([{ errors: [] }]),
      },
    };
    const service = new PayrollService(prisma as any, {} as any, {} as any, stubDenominators() as any, {} as any);

    await expect(service.approveRun('tenant-1', 'run-1', 'user-1')).resolves.toEqual({
      id: 'run-1',
      status: 'APPROVED',
    });
    expect(prisma.payrollRun.update).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: { status: 'APPROVED' },
    });
  });

  it('requires warning override before approving payroll with warnings', async () => {
    const prisma = {
      payrollRun: {
        findFirst: jest.fn().mockResolvedValue({ id: 'run-1', tenantId: 'tenant-1', status: 'REVIEW' }),
      },
      payrollRunEmployee: {
        findMany: jest.fn().mockResolvedValue([{ errors: [], warnings: ['PAN missing'] }]),
      },
    };
    const service = new PayrollService(prisma as any, {} as any, {} as any, stubDenominators() as any, {} as any);

    await expect(service.approveRun('tenant-1', 'run-1', 'user-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('locks approved payroll and records loan installments', async () => {
    const prisma = {
      payrollRun: {
        findFirst: jest.fn().mockResolvedValue({ id: 'run-1', tenantId: 'tenant-1', status: 'APPROVED', month: 7, year: 2026 }),
        update: jest.fn().mockResolvedValue({ id: 'run-1', status: 'LOCKED' }),
      },
      payrollRunEmployee: {
        findMany: jest.fn().mockResolvedValue([
          { employeeId: 'emp-1', components: [{ code: 'LOAN_EMI', monthly: 1000 }] },
        ]),
      },
      loan: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'loan-1', tenantId: 'tenant-1', employeeId: 'emp-1', emiAmount: 1000, outstanding: 2000, emiStartMonth: 1, emiStartYear: 2026 },
        ]),
        update: jest.fn().mockResolvedValue({}),
      },
      loanInstallment: {
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new PayrollService(prisma as any, {} as any, {} as any, stubDenominators() as any, {} as any);

    await expect(service.lockRun('tenant-1', 'run-1', 'user-1')).resolves.toEqual({
      id: 'run-1',
      status: 'LOCKED',
    });
    expect(prisma.loanInstallment.upsert).toHaveBeenCalled();
    expect(prisma.loan.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ outstanding: 1000 }),
    }));
  });

  it('uses versioned TDS during payroll processing and stores tax snapshots', async () => {
    const prisma = {
      payrollRun: {
        findFirst: jest.fn().mockResolvedValue({ id: 'run-1', tenantId: 'tenant-1', status: 'DRAFT', month: 7, year: 2025, runType: 'MONTHLY' }),
        update: jest.fn().mockResolvedValue({ id: 'run-1', status: 'REVIEW' }),
      },
      employee: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'emp-1',
            employeeCode: 'PH001',
            firstName: 'Asha',
            lastName: 'Shah',
            dateOfBirth: new Date('1990-01-01'),
            pan: 'ABCDE1234F',
            taxRegime: 'NEW',
            uan: '100200300400',
            bankDetails: { account: '123' },
            status: 'ACTIVE',
            joiningDate: new Date('2024-01-01'),
            exitDate: null,
            noticePeriodDays: 30,
            legalEntityId: 'le-1',
            locationId: 'loc-1',
            employeeSalaries: [{ ctc: 1800000 }],
            loans: [],
          },
        ]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      attendanceRecord: { groupBy: jest.fn().mockResolvedValue([]), findMany: jest.fn().mockResolvedValue([]) },
      attendanceFinalization: { findFirst: jest.fn().mockResolvedValue({ id: 'finalization-1' }) },
      leaveRequest: { findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]) },
      payrollVariableInput: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      compOffGrant: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((ops: Array<Promise<unknown>>) => Promise.all(ops)),
      expenseClaim: {
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      taxYear: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'tax-year-1',
          effectiveTo: new Date('2026-03-31'),
        }),
      },
      employeeTaxDeclaration: { findMany: jest.fn().mockResolvedValue([]) },
      employeePreviousEmployerIncome: { findMany: jest.fn().mockResolvedValue([]) },
      employeeMonthlyTds: {
        groupBy: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({}),
      },
      payrollRunEmployee: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({}),
      },
      employeeTaxProfile: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'profile-1',
          regime: 'NEW',
          ageCategory: 'BELOW_60',
        }),
      },
      taxComputationSnapshot: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({ id: 'snapshot-1' }),
      },
    };
    const calculator = {
      calculateMonth: jest.fn().mockReturnValue({
        grossPay: 145000,
        totalDeductions: 1800,
        netPay: 143200,
        components: [
          { code: 'BASIC', name: 'Basic', type: 'EARNING', monthly: 60000, annual: 720000 },
          { code: 'SA', name: 'Special Allowance', type: 'EARNING', monthly: 85000, annual: 1020000 },
          { code: 'PF_EMP', name: 'Provident Fund (Employee)', type: 'DEDUCTION', monthly: 1800, annual: 21600 },
          { code: 'TDS', name: 'TDS', type: 'DEDUCTION', monthly: 999, annual: 11988 },
        ],
      }),
      buildComponents: jest.fn().mockReturnValue([
        { code: 'BASIC', type: 'EARNING', monthly: 60000 },
        { code: 'SA', type: 'EARNING', monthly: 85000 },
      ]),
    };
    const tdsEngine = {
      calculate: jest.fn().mockResolvedValue({
        grossTaxableIncome: 1740000,
        exemptIncome: 0,
        deductibleAmount: 75000,
        netTaxableIncome: 1665000,
        taxBeforeRebate: 72000,
        rebate: 0,
        surcharge: 0,
        cess: 2880,
        totalAnnualTax: 74880,
        tdsAlreadyDeducted: 0,
        remainingTax: 74880,
        monthlyTds: 8320,
        effectiveTaxRate: 0.043,
        breakdownSteps: [{ step: 'MONTHLY_TDS', description: 'Monthly TDS', amount: 8320 }],
        slabsApplied: [],
      }),
    };
    const service = new PayrollService(prisma as any, calculator as any, tdsEngine as any, stubDenominators() as any, {} as any);

    await expect(service.processRun('tenant-1', 'run-1')).resolves.toEqual({
      processed: 1,
      errors: 0,
      warnings: 0,
      status: 'REVIEW',
    });
    expect(tdsEngine.calculate).toHaveBeenCalledWith(expect.objectContaining({
      taxYearId: 'tax-year-1',
      regime: 'NEW',
      annualFixedSalary: 1740000,
      remainingPayrollMonths: 9,
    }));
    expect(prisma.payrollRunEmployee.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        totalDeductions: 10120,
        netPay: 134880,
        components: expect.arrayContaining([
          expect.objectContaining({ code: 'TDS', monthly: 8320 }),
        ]),
      }),
    }));
    expect(prisma.employeeMonthlyTds.upsert).toHaveBeenCalled();
    expect(prisma.taxComputationSnapshot.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        employeeId: 'emp-1',
        payrollRunId: 'run-1',
        monthlyTdsDeducted: 8320,
      }),
    }));
  });

  describe('monthly attendance finalization gate', () => {
    it('raises a blocking error when the payroll month has no attendance finalization', async () => {
      const { service, prisma, entryFor } = buildProcessRunHarness({ finalizations: [] });

      const result = await service.processRun('tenant-1', 'run-1');

      expect(prisma.attendanceFinalization.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'tenant-1',
            month: 7,
            year: 2026,
            status: 'FINALIZED',
            locationId: null,
          }),
        }),
      );
      expect(entryFor('emp-1').errors).toContain(
        'Attendance for 2026-07 is not finalized; finalize attendance before processing payroll',
      );
      expect(entryFor('emp-1').warnings).not.toContain(
        'Attendance for 2026-07 is not finalized; finalize attendance before processing payroll',
      );
      expect(result.errors).toBeGreaterThan(0);
    });

    it('blocks approval while the finalization error is present, even with warnings overridden', async () => {
      const prisma = {
        payrollRun: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'run-1',
            tenantId: 'tenant-1',
            status: 'REVIEW',
            warningsOverriddenAt: new Date(),
          }),
          update: jest.fn(),
        },
        payrollRunEmployee: {
          findMany: jest.fn().mockResolvedValue([
            {
              errors: [
                'Attendance for 2026-07 is not finalized; finalize attendance before processing payroll',
              ],
              warnings: [],
            },
          ]),
        },
      };
      const service = new PayrollService(prisma as any, {} as any, {} as any, stubDenominators() as any, {} as any);

      await expect(service.approveRun('tenant-1', 'run-1', 'user-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.payrollRun.update).not.toHaveBeenCalled();
    });

    it('processes without the finalization error when the month is finalized tenant-wide', async () => {
      const { service, entryFor } = buildProcessRunHarness({
        finalizations: [
          { tenantId: 'tenant-1', month: 7, year: 2026, locationId: null, status: 'FINALIZED' },
        ],
      });

      await service.processRun('tenant-1', 'run-1');

      expect(entryFor('emp-1').errors).toEqual([]);
    });

    it('accepts a finalization scoped to the run location', async () => {
      const { service, entryFor } = buildProcessRunHarness({
        run: { locationId: 'loc-b' },
        finalizations: [
          { tenantId: 'tenant-1', month: 7, year: 2026, locationId: 'loc-b', status: 'FINALIZED' },
        ],
      });

      await service.processRun('tenant-1', 'run-1');

      expect(entryFor('emp-1').errors).toEqual([]);
    });

    it.each([
      ['another tenant', { tenantId: 'tenant-2', month: 7, year: 2026, locationId: null }],
      ['another month', { tenantId: 'tenant-1', month: 6, year: 2026, locationId: null }],
      ['another year', { tenantId: 'tenant-1', month: 7, year: 2025, locationId: null }],
      ['another location', { tenantId: 'tenant-1', month: 7, year: 2026, locationId: 'loc-a' }],
    ])('does not accept a finalization for %s', async (_label, finalization) => {
      const { service, entryFor } = buildProcessRunHarness({
        run: { locationId: 'loc-b' },
        finalizations: [{ ...finalization, status: 'FINALIZED' }],
      });

      await service.processRun('tenant-1', 'run-1');

      expect(entryFor('emp-1').errors).toContain(
        'Attendance for 2026-07 is not finalized; finalize attendance before processing payroll',
      );
    });

    it('does not accept a single location finalization for a tenant-wide run', async () => {
      const { service, entryFor } = buildProcessRunHarness({
        finalizations: [
          { tenantId: 'tenant-1', month: 7, year: 2026, locationId: 'loc-b', status: 'FINALIZED' },
        ],
      });

      await service.processRun('tenant-1', 'run-1');

      expect(entryFor('emp-1').errors).toContain(
        'Attendance for 2026-07 is not finalized; finalize attendance before processing payroll',
      );
    });

    it('skips the finalization gate for run types where monthly attendance does not apply', async () => {
      const { service, prisma, entryFor } = buildProcessRunHarness({
        run: { runType: 'FULL_AND_FINAL' },
        finalizations: [],
      });

      await service.processRun('tenant-1', 'run-1');

      expect(prisma.attendanceFinalization.findFirst).not.toHaveBeenCalled();
      expect(entryFor('emp-1').errors).toEqual([]);
    });

    it('keeps unrelated payroll findings as warnings rather than errors', async () => {
      const { service, entryFor } = buildProcessRunHarness({
        finalizations: [
          { tenantId: 'tenant-1', month: 7, year: 2026, locationId: null, status: 'FINALIZED' },
        ],
        employeeOverrides: { pan: null, uan: null, bankDetails: null },
      });

      await service.processRun('tenant-1', 'run-1');

      expect(entryFor('emp-1').errors).toEqual([]);
      expect(entryFor('emp-1').warnings).toEqual(
        expect.arrayContaining([
          'PAN is missing; TDS and Form 16 data should be reviewed',
          'UAN is missing; PF reporting should be reviewed',
          'Bank details are missing; bank file payout may fail',
        ]),
      );
    });
  });

  describe('unpaid leave clipped to the payroll month', () => {
    const finalizedJuly = [
      { tenantId: 'tenant-1', month: 7, year: 2026, locationId: null, status: 'FINALIZED' },
    ];

    it('queries only approved unpaid leave overlapping the payroll month', async () => {
      const { service, prisma } = buildProcessRunHarness({ finalizations: finalizedJuly });

      await service.processRun('tenant-1', 'run-1');

      expect(prisma.leaveRequest.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-1',
          status: 'APPROVED',
          leaveType: { isPaid: false },
          fromDate: { lte: new Date(Date.UTC(2026, 6, 31)) },
          toDate: { gte: new Date(Date.UTC(2026, 6, 1)) },
        },
        select: { employeeId: true, days: true, fromDate: true, toDate: true },
      });
    });

    it('counts the full request when the unpaid leave sits inside the payroll month', async () => {
      const { service, entryFor } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        leaveRequests: [
          {
            employeeId: 'emp-1',
            days: 3,
            fromDate: new Date(Date.UTC(2026, 6, 10)),
            toDate: new Date(Date.UTC(2026, 6, 12)),
          },
        ],
      });

      await service.processRun('tenant-1', 'run-1');

      expect(entryFor('emp-1').lopDays).toBe(3);
      expect(entryFor('emp-1').payableDays).toBe(28);
    });

    it('counts only the July portion of a 28 June to 3 July request in July payroll', async () => {
      const { service, entryFor } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        leaveRequests: [
          {
            employeeId: 'emp-1',
            days: 6,
            fromDate: new Date(Date.UTC(2026, 5, 28)),
            toDate: new Date(Date.UTC(2026, 6, 3)),
          },
        ],
      });

      await service.processRun('tenant-1', 'run-1');

      expect(entryFor('emp-1').lopDays).toBe(3);
    });

    it('counts only the June portion of the same request in June payroll', async () => {
      const { service, entryFor } = buildProcessRunHarness({
        run: { month: 6 },
        finalizations: [
          { tenantId: 'tenant-1', month: 6, year: 2026, locationId: null, status: 'FINALIZED' },
        ],
        leaveRequests: [
          {
            employeeId: 'emp-1',
            days: 6,
            fromDate: new Date(Date.UTC(2026, 5, 28)),
            toDate: new Date(Date.UTC(2026, 6, 3)),
          },
        ],
      });

      await service.processRun('tenant-1', 'run-1');

      expect(entryFor('emp-1').lopDays).toBe(3);
    });

    it('contributes nothing when the request falls outside the payroll month', async () => {
      const { service, entryFor } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        leaveRequests: [
          {
            employeeId: 'emp-1',
            days: 2,
            fromDate: new Date(Date.UTC(2026, 7, 1)),
            toDate: new Date(Date.UTC(2026, 7, 2)),
          },
        ],
      });

      await service.processRun('tenant-1', 'run-1');

      expect(entryFor('emp-1').lopDays).toBe(0);
      expect(entryFor('emp-1').payableDays).toBe(31);
    });

    it('preserves half-day unpaid leave', async () => {
      const { service, entryFor } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        leaveRequests: [
          {
            employeeId: 'emp-1',
            days: 0.5,
            fromDate: new Date(Date.UTC(2026, 6, 15)),
            toDate: new Date(Date.UTC(2026, 6, 15)),
          },
        ],
      });

      await service.processRun('tenant-1', 'run-1');

      expect(entryFor('emp-1').lopDays).toBe(0.5);
    });

    it('caps total LOP at the number of days in the payroll month', async () => {
      const { service, entryFor } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        leaveRequests: [
          {
            employeeId: 'emp-1',
            days: 40,
            fromDate: new Date(Date.UTC(2026, 6, 1)),
            toDate: new Date(Date.UTC(2026, 6, 31)),
          },
        ],
      });

      await service.processRun('tenant-1', 'run-1');

      expect(entryFor('emp-1').lopDays).toBe(31);
      expect(entryFor('emp-1').payableDays).toBe(0);
    });
  });

  describe('attendance-derived loss of pay', () => {
    const finalizedJuly = [
      { tenantId: 'tenant-1', month: 7, year: 2026, locationId: null, status: 'FINALIZED' },
    ];

    it('charges finalized absences and half days as LOP', async () => {
      const { service, prisma, entryFor } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        attendanceRecords: [
          { employeeId: 'emp-1', status: 'ABSENT', isFinalized: true },
          { employeeId: 'emp-1', status: 'HALF_DAY', isFinalized: true },
        ],
      });

      await service.processRun('tenant-1', 'run-1');

      expect(prisma.attendanceRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isFinalized: true,
            status: { in: ['ABSENT', 'HALF_DAY'] },
          }),
        }),
      );
      expect(entryFor('emp-1').lopDays).toBe(1.5);
    });

    it('excludes a day reconciled to ON_LEAVE from attendance LOP', async () => {
      const { service, entryFor } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        attendanceRecords: [
          { employeeId: 'emp-1', status: 'ON_LEAVE', isFinalized: true },
          { employeeId: 'emp-1', status: 'ABSENT', isFinalized: true },
        ],
      });

      await service.processRun('tenant-1', 'run-1');

      expect(entryFor('emp-1').lopDays).toBe(1);
      expect(entryFor('emp-1').payableDays).toBe(30);
    });

    it('charges a half worked day plus half-day unpaid leave once, not twice', async () => {
      // The HALF_DAY record is reconciled to ON_LEAVE at finalization, so the
      // only LOP left is the 0.5 unpaid leave day itself.
      const { service, entryFor } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        attendanceRecords: [{ employeeId: 'emp-1', status: 'ON_LEAVE', isFinalized: true }],
        leaveRequests: [
          {
            employeeId: 'emp-1',
            days: 0.5,
            fromDate: new Date(Date.UTC(2026, 6, 8)),
            toDate: new Date(Date.UTC(2026, 6, 8)),
          },
        ],
      });

      await service.processRun('tenant-1', 'run-1');

      expect(entryFor('emp-1').lopDays).toBe(0.5);
      expect(entryFor('emp-1').payableDays).toBe(30.5);
    });

    it('charges nothing for a half worked day fully covered by paid leave', async () => {
      const { service, entryFor } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        attendanceRecords: [{ employeeId: 'emp-1', status: 'ON_LEAVE', isFinalized: true }],
      });

      await service.processRun('tenant-1', 'run-1');

      expect(entryFor('emp-1').lopDays).toBe(0);
      expect(entryFor('emp-1').payableDays).toBe(31);
    });

    it('does not double charge an unpaid leave day that is also an ON_LEAVE record', async () => {
      const { service, entryFor } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        attendanceRecords: [{ employeeId: 'emp-1', status: 'ON_LEAVE', isFinalized: true }],
        leaveRequests: [
          {
            employeeId: 'emp-1',
            days: 1,
            fromDate: new Date(Date.UTC(2026, 6, 8)),
            toDate: new Date(Date.UTC(2026, 6, 8)),
          },
        ],
      });

      await service.processRun('tenant-1', 'run-1');

      expect(entryFor('emp-1').lopDays).toBe(1);
    });
  });

  describe('used Comp-Off offsets payroll LOP', () => {
    const finalizedJuly = [
      { tenantId: 'tenant-1', month: 7, year: 2026, locationId: null, status: 'FINALIZED' },
    ];
    // July 2026 is the harness's default run month/year.
    const absenceDate = new Date(Date.UTC(2026, 6, 10));
    const otherDate = new Date(Date.UTC(2026, 6, 20));

    it('removes exactly 1 LOP day for a used Comp-Off matching a full-day absence', async () => {
      const { service, entryFor } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        attendanceRecords: [{ employeeId: 'emp-1', status: 'ABSENT', isFinalized: true, date: absenceDate }],
        usedCompOffGrants: [{ employeeId: 'emp-1', usedOnDate: absenceDate }],
      });

      await service.processRun('tenant-1', 'run-1');

      expect(entryFor('emp-1').lopDays).toBe(0);
      expect(entryFor('emp-1').payableDays).toBe(31);
    });

    it('removes exactly 1 LOP day for a used Comp-Off matching an LWP day', async () => {
      const { service, entryFor } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        leaveRequests: [{ employeeId: 'emp-1', days: 1, fromDate: absenceDate, toDate: absenceDate }],
        usedCompOffGrants: [{ employeeId: 'emp-1', usedOnDate: absenceDate }],
      });

      await service.processRun('tenant-1', 'run-1');

      expect(entryFor('emp-1').lopDays).toBe(0);
      expect(entryFor('emp-1').payableDays).toBe(31);
    });

    it('removes exactly 0.5 LOP day for a used Comp-Off matching a half day', async () => {
      const { service, entryFor } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        attendanceRecords: [{ employeeId: 'emp-1', status: 'HALF_DAY', isFinalized: true, date: absenceDate }],
        usedCompOffGrants: [{ employeeId: 'emp-1', usedOnDate: absenceDate }],
      });

      await service.processRun('tenant-1', 'run-1');

      expect(entryFor('emp-1').lopDays).toBe(0);
      expect(entryFor('emp-1').payableDays).toBe(31);
    });

    it('has no effect when the used date has no LOP contribution', async () => {
      const { service, entryFor } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        usedCompOffGrants: [{ employeeId: 'emp-1', usedOnDate: absenceDate }],
      });

      await service.processRun('tenant-1', 'run-1');

      expect(entryFor('emp-1').lopDays).toBe(0);
      expect(entryFor('emp-1').payableDays).toBe(31);
    });

    it('cannot offset an absence on a different date than usedOnDate', async () => {
      const { service, entryFor } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        attendanceRecords: [{ employeeId: 'emp-1', status: 'ABSENT', isFinalized: true, date: absenceDate }],
        usedCompOffGrants: [{ employeeId: 'emp-1', usedOnDate: otherDate }],
      });

      await service.processRun('tenant-1', 'run-1');

      expect(entryFor('emp-1').lopDays).toBe(1);
      expect(entryFor('emp-1').payableDays).toBe(30);
    });

    it('offsets multiple used dates independently, each against its own day only', async () => {
      const { service, entryFor } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        attendanceRecords: [
          { employeeId: 'emp-1', status: 'ABSENT', isFinalized: true, date: absenceDate },
          { employeeId: 'emp-1', status: 'HALF_DAY', isFinalized: true, date: otherDate },
        ],
        usedCompOffGrants: [
          { employeeId: 'emp-1', usedOnDate: absenceDate },
          { employeeId: 'emp-1', usedOnDate: otherDate },
        ],
      });

      await service.processRun('tenant-1', 'run-1');

      expect(entryFor('emp-1').lopDays).toBe(0);
      expect(entryFor('emp-1').payableDays).toBe(31);
    });

    it('does not offset anything for an AVAILABLE grant', async () => {
      const { service, entryFor } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        attendanceRecords: [{ employeeId: 'emp-1', status: 'ABSENT', isFinalized: true, date: absenceDate }],
        usedCompOffGrants: [{ employeeId: 'emp-1', usedOnDate: absenceDate, status: 'AVAILABLE' }],
      });

      await service.processRun('tenant-1', 'run-1');

      expect(entryFor('emp-1').lopDays).toBe(1);
      expect(entryFor('emp-1').payableDays).toBe(30);
    });

    it.each(['EXPIRED', 'CANCELLED'])('does not offset anything for a %s grant', async (status) => {
      const { service, entryFor } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        attendanceRecords: [{ employeeId: 'emp-1', status: 'ABSENT', isFinalized: true, date: absenceDate }],
        usedCompOffGrants: [{ employeeId: 'emp-1', usedOnDate: absenceDate, status }],
      });

      await service.processRun('tenant-1', 'run-1');

      expect(entryFor('emp-1').lopDays).toBe(1);
      expect(entryFor('emp-1').payableDays).toBe(30);
    });

    it('keeps multiple employees isolated: one is offset, the other is not', async () => {
      const { service, entryFor } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        extraEmployees: [
          { id: 'emp-offset', employeeCode: 'PH-OFF' },
          { id: 'emp-plain', employeeCode: 'PH-PLN' },
        ],
        attendanceRecords: [
          { employeeId: 'emp-offset', status: 'ABSENT', isFinalized: true, date: absenceDate },
          { employeeId: 'emp-plain', status: 'ABSENT', isFinalized: true, date: absenceDate },
        ],
        usedCompOffGrants: [{ employeeId: 'emp-offset', usedOnDate: absenceDate }],
      });

      await service.processRun('tenant-1', 'run-1');

      expect(entryFor('emp-offset').lopDays).toBe(0);
      expect(entryFor('emp-offset').payableDays).toBe(31);
      expect(entryFor('emp-plain').lopDays).toBe(1);
      expect(entryFor('emp-plain').payableDays).toBe(30);
    });

    it('a used Comp-Off for one employee cannot offset another employee\'s matching-date absence', async () => {
      const { service, entryFor } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        extraEmployees: [
          { id: 'emp-a', employeeCode: 'PH-A' },
          { id: 'emp-b', employeeCode: 'PH-B' },
        ],
        attendanceRecords: [{ employeeId: 'emp-b', status: 'ABSENT', isFinalized: true, date: absenceDate }],
        // Comp-off belongs to emp-a, not emp-b, even though the date matches.
        usedCompOffGrants: [{ employeeId: 'emp-a', usedOnDate: absenceDate }],
      });

      await service.processRun('tenant-1', 'run-1');

      expect(entryFor('emp-b').lopDays).toBe(1);
    });

    it('offsets correctly under a FIXED_DAYS policy without changing the denominator', async () => {
      const { service, entryFor } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        payrollPolicies: [
          { id: 'p1', tenantId: 'tenant-1', locationId: null, salaryBasis: 'FIXED_DAYS', fixedDays: 26 },
        ],
        attendanceRecords: [{ employeeId: 'emp-1', status: 'ABSENT', isFinalized: true, date: absenceDate }],
        usedCompOffGrants: [{ employeeId: 'emp-1', usedOnDate: absenceDate }],
      });

      await service.processRun('tenant-1', 'run-1');

      expect(entryFor('emp-1').lopDays).toBe(0);
      expect(entryFor('emp-1').payableDays).toBe(26);
    });

    it('offsets correctly under a WORKING_DAYS policy without changing the denominator', async () => {
      const { service, entryFor } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        payrollPolicies: [{ id: 'p1', tenantId: 'tenant-1', locationId: null, salaryBasis: 'WORKING_DAYS' }],
        weeklyOffDays: [0, 6],
        attendanceRecords: [{ employeeId: 'emp-1', status: 'ABSENT', isFinalized: true, date: absenceDate }],
        usedCompOffGrants: [{ employeeId: 'emp-1', usedOnDate: absenceDate }],
      });

      await service.processRun('tenant-1', 'run-1');

      // July 2026 has 23 Mon-Fri working days on a [0,6] weekly off.
      expect(entryFor('emp-1').lopDays).toBe(0);
      expect(entryFor('emp-1').payableDays).toBe(23);
    });

    it('offsets a date once even when two used grants share the same usedOnDate', async () => {
      // Two grants both name the one absence date. The first zeroes its 1-day contribution;
      // the second finds nothing left there, so the offset is reported once, not twice.
      const { service, entryFor } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        attendanceRecords: [{ employeeId: 'emp-1', status: 'ABSENT', isFinalized: true, date: absenceDate }],
        usedCompOffGrants: [
          { employeeId: 'emp-1', usedOnDate: absenceDate },
          { employeeId: 'emp-1', usedOnDate: absenceDate },
        ],
      });

      await service.processRun('tenant-1', 'run-1');

      expect(entryFor('emp-1').lopDays).toBe(0);
      expect(entryFor('emp-1').payableDays).toBe(31);
      expect(entryFor('emp-1').warnings).toContainEqual('1 day(s) of LOP offset by used comp-off');
    });

    it('cannot push payableDays past the resolved denominator even with excess offsets', async () => {
      // A used grant on a date that never had any LOP: the offset is a no-op rather than a
      // credit, so payableDays still stops exactly at the denominator instead of exceeding it.
      const { service, entryFor } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        usedCompOffGrants: [{ employeeId: 'emp-1', usedOnDate: absenceDate }],
      });

      await service.processRun('tenant-1', 'run-1');

      expect(entryFor('emp-1').lopDays).toBe(0);
      expect(entryFor('emp-1').payableDays).toBe(31);
      expect(entryFor('emp-1').payableDays).toBeLessThanOrEqual(31);
    });

    it('resolves CALENDAR_DAYS correctly with a used Comp-Off offset applied', async () => {
      const { service, entryFor } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        payrollPolicies: [{ id: 'p1', tenantId: 'tenant-1', locationId: null, salaryBasis: 'CALENDAR_DAYS' }],
        attendanceRecords: [{ employeeId: 'emp-1', status: 'ABSENT', isFinalized: true, date: absenceDate }],
        usedCompOffGrants: [{ employeeId: 'emp-1', usedOnDate: absenceDate }],
      });

      await service.processRun('tenant-1', 'run-1');

      expect(entryFor('emp-1').lopDays).toBe(0);
      expect(entryFor('emp-1').payableDays).toBe(31); // July 2026 calendar days
    });

    it('combines attendance and LWP sources per date, offsetting only the named date', async () => {
      // A half-day attendance record on one date and a full LWP day on another: the two
      // sources land on different days, and the Comp-Off only touches the half-day's date.
      const { service, entryFor } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        attendanceRecords: [{ employeeId: 'emp-1', status: 'HALF_DAY', isFinalized: true, date: absenceDate }],
        leaveRequests: [{ employeeId: 'emp-1', days: 1, fromDate: otherDate, toDate: otherDate }],
        usedCompOffGrants: [{ employeeId: 'emp-1', usedOnDate: absenceDate }],
      });

      await service.processRun('tenant-1', 'run-1');

      // 0.5 (half day, offset to 0) + 1 (LWP, untouched) = 1 remaining.
      expect(entryFor('emp-1').lopDays).toBe(1);
      expect(entryFor('emp-1').payableDays).toBe(30);
    });

    it('produces identical LOP/payable results on a rerun of the same payroll month', async () => {
      const { service, entryFor } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        attendanceRecords: [{ employeeId: 'emp-1', status: 'ABSENT', isFinalized: true, date: absenceDate }],
        usedCompOffGrants: [{ employeeId: 'emp-1', usedOnDate: absenceDate }],
      });

      await service.processRun('tenant-1', 'run-1');
      const first = { lopDays: entryFor('emp-1').lopDays, payableDays: entryFor('emp-1').payableDays };

      await service.processRun('tenant-1', 'run-1');
      const second = { lopDays: entryFor('emp-1').lopDays, payableDays: entryFor('emp-1').payableDays };

      expect(second).toEqual(first);
      expect(second).toEqual({ lopDays: 0, payableDays: 31 });
    });

    it('leaves payroll behaviour unchanged for a run with no Comp-Off usage at all', async () => {
      const { service, entryFor } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        attendanceRecords: [{ employeeId: 'emp-1', status: 'ABSENT', isFinalized: true, date: absenceDate }],
      });

      await service.processRun('tenant-1', 'run-1');

      expect(entryFor('emp-1').lopDays).toBe(1);
      expect(entryFor('emp-1').payableDays).toBe(30);
    });
  });

  describe('unused Comp-Off is paid or left unpaid at payroll', () => {
    const finalizedJuly = [
      { tenantId: 'tenant-1', month: 7, year: 2026, locationId: null, status: 'FINALIZED' },
    ];
    const finalizedDecember = [
      { tenantId: 'tenant-1', month: 12, year: 2026, locationId: null, status: 'FINALIZED' },
    ];
    // July 2026 is the harness's default run month/year.
    const absenceDate = new Date(Date.UTC(2026, 6, 10));
    const farFutureExpiry = new Date(Date.UTC(2030, 0, 1));

    /** A single BASIC earning of `monthly`, so grossPay is exactly `monthly` at full proration - no PF/ESI/PT noise. */
    function basicSalary(monthly: number) {
      return { employeeSalaries: [{ ctc: monthly * 12, components: [{ code: 'BASIC', name: 'Basic', type: 'EARNING', monthly } ] }] };
    }

    /** Every field explicit - `PayrollPolicyService.resolve` returns the fixture row as-is, so an omitted field resolves to `undefined`, not a default. */
    function policy(overrides: Record<string, unknown> = {}) {
      return [
        {
          id: 'p1',
          tenantId: 'tenant-1',
          locationId: null,
          salaryBasis: 'CALENDAR_DAYS',
          fixedDays: null,
          compOffUnusedTreatment: 'PAY',
          compOffUsagePeriod: 'MONTHLY',
          compOffCarryForwardEnabled: false,
          ...overrides,
        },
      ];
    }

    function payoutCreates(prisma: ReturnType<typeof buildProcessRunHarness>['prisma']) {
      return (prisma.payrollVariableInput.createMany as jest.Mock).mock.calls.flatMap(
        ([args]: [{ data: Array<Record<string, unknown>> }]) => args.data,
      );
    }

    it('1. pays the daily rate for one unused Comp-Off day', async () => {
      const { service, prisma, entryFor } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        payrollPolicies: policy(),
        employeeOverrides: basicSalary(26000),
        availableCompOffGrants: [
          { employeeId: 'emp-1', earnedDate: new Date(Date.UTC(2026, 6, 5)), expiresAt: farFutureExpiry, days: 1 },
        ],
      });

      await service.processRun('tenant-1', 'run-1');

      const creates = payoutCreates(prisma);
      expect(creates).toHaveLength(1);
      expect(creates[0]).toMatchObject({ employeeId: 'emp-1', type: 'COMP_OFF_PAYOUT', source: 'COMP_OFF', amount: 838.71, taxable: true, status: 'APPROVED' });
      expect(entryFor('emp-1').grossPay).toBeCloseTo(26838.71, 2);
      expect(entryFor('emp-1').components).toContainEqual(expect.objectContaining({ code: 'INPUT_COMP_OFF_PAYOUT', monthly: 838.71 }));
    });

    it('2. pays the correct total for multiple unused days', async () => {
      const { service, prisma, entryFor } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        payrollPolicies: policy(),
        employeeOverrides: basicSalary(26000),
        availableCompOffGrants: [
          { employeeId: 'emp-1', earnedDate: new Date(Date.UTC(2026, 6, 3)), expiresAt: farFutureExpiry, days: 1 },
          { employeeId: 'emp-1', earnedDate: new Date(Date.UTC(2026, 6, 12)), expiresAt: farFutureExpiry, days: 2 },
        ],
      });

      await service.processRun('tenant-1', 'run-1');

      const creates = payoutCreates(prisma);
      expect(creates).toHaveLength(1);
      expect(creates[0]).toMatchObject({ amount: 2516.13 });
      expect(entryFor('emp-1').grossPay).toBeCloseTo(26000 + 2516.13, 2);
    });

    it('3. UNPAID creates no earning and no deduction', async () => {
      const { service, prisma, entryFor } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        payrollPolicies: policy({ compOffUnusedTreatment: 'UNPAID' }),
        employeeOverrides: basicSalary(26000),
        availableCompOffGrants: [
          { employeeId: 'emp-1', earnedDate: new Date(Date.UTC(2026, 6, 5)), expiresAt: farFutureExpiry, days: 1 },
        ],
      });

      await service.processRun('tenant-1', 'run-1');

      expect(payoutCreates(prisma)).toHaveLength(0);
      expect(entryFor('emp-1').grossPay).toBeCloseTo(26000, 2);
      expect(entryFor('emp-1').components.some((c) => c.code === 'INPUT_COMP_OFF_PAYOUT')).toBe(false);
    });

    it('4. a USED grant is not paid as unused', async () => {
      const { service, prisma } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        payrollPolicies: policy(),
        employeeOverrides: basicSalary(26000),
        availableCompOffGrants: [
          { employeeId: 'emp-1', earnedDate: new Date(Date.UTC(2026, 6, 5)), expiresAt: farFutureExpiry, days: 1, status: 'USED' },
        ],
      });

      await service.processRun('tenant-1', 'run-1');

      expect(payoutCreates(prisma)).toHaveLength(0);
    });

    it('5. an EXPIRED grant is not paid', async () => {
      const { service, prisma } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        payrollPolicies: policy(),
        employeeOverrides: basicSalary(26000),
        availableCompOffGrants: [
          { employeeId: 'emp-1', earnedDate: new Date(Date.UTC(2026, 6, 5)), expiresAt: farFutureExpiry, days: 1, status: 'EXPIRED' },
        ],
      });

      await service.processRun('tenant-1', 'run-1');

      expect(payoutCreates(prisma)).toHaveLength(0);
    });

    it('6. a CANCELLED grant is not paid', async () => {
      const { service, prisma } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        payrollPolicies: policy(),
        employeeOverrides: basicSalary(26000),
        availableCompOffGrants: [
          { employeeId: 'emp-1', earnedDate: new Date(Date.UTC(2026, 6, 5)), expiresAt: farFutureExpiry, days: 1, status: 'CANCELLED' },
        ],
      });

      await service.processRun('tenant-1', 'run-1');

      expect(payoutCreates(prisma)).toHaveLength(0);
    });

    it('7. an AVAILABLE Comp-Off does not reduce LOP', async () => {
      const { service, entryFor } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        payrollPolicies: policy({ compOffUnusedTreatment: 'UNPAID' }),
        attendanceRecords: [{ employeeId: 'emp-1', status: 'ABSENT', isFinalized: true, date: absenceDate }],
        availableCompOffGrants: [
          { employeeId: 'emp-1', earnedDate: new Date(Date.UTC(2026, 6, 5)), expiresAt: farFutureExpiry, days: 1 },
        ],
      });

      await service.processRun('tenant-1', 'run-1');

      // Only a USED grant's usedOnDate (Phase 5) can offset LOP; an AVAILABLE balance never does.
      expect(entryFor('emp-1').lopDays).toBe(1);
      expect(entryFor('emp-1').payableDays).toBe(30);
    });

    it('8. pays correctly under CALENDAR_DAYS', async () => {
      const { service, prisma } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        payrollPolicies: policy({ salaryBasis: 'CALENDAR_DAYS' }),
        employeeOverrides: basicSalary(26000),
        availableCompOffGrants: [
          { employeeId: 'emp-1', earnedDate: new Date(Date.UTC(2026, 6, 5)), expiresAt: farFutureExpiry, days: 1 },
        ],
      });

      await service.processRun('tenant-1', 'run-1');

      // 26000 / 31 calendar days in July.
      expect(payoutCreates(prisma)[0]).toMatchObject({ amount: 838.71 });
    });

    it('9. pays exactly the salary/26 example under FIXED_DAYS = 26', async () => {
      const { service, prisma } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        payrollPolicies: policy({ salaryBasis: 'FIXED_DAYS', fixedDays: 26 }),
        employeeOverrides: basicSalary(26000),
        availableCompOffGrants: [
          { employeeId: 'emp-1', earnedDate: new Date(Date.UTC(2026, 6, 5)), expiresAt: farFutureExpiry, days: 1 },
        ],
      });

      await service.processRun('tenant-1', 'run-1');

      expect(payoutCreates(prisma)[0]).toMatchObject({ amount: 1000 });
    });

    it('10. pays correctly under WORKING_DAYS', async () => {
      const { service, prisma } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        payrollPolicies: policy({ salaryBasis: 'WORKING_DAYS' }),
        weeklyOffDays: [0, 6],
        employeeOverrides: basicSalary(26000),
        availableCompOffGrants: [
          { employeeId: 'emp-1', earnedDate: new Date(Date.UTC(2026, 6, 5)), expiresAt: farFutureExpiry, days: 1 },
        ],
      });

      await service.processRun('tenant-1', 'run-1');

      // 26000 / 23 Mon-Fri working days in July 2026 under a [0,6] weekly off.
      expect(payoutCreates(prisma)[0]).toMatchObject({ amount: 1130.43 });
    });

    it('11. the payout daily rate matches the LOP denominator, not that month\'s own payable days', async () => {
      const { service, prisma, entryFor } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        payrollPolicies: policy({ salaryBasis: 'FIXED_DAYS', fixedDays: 26 }),
        employeeOverrides: basicSalary(26000),
        attendanceRecords: [{ employeeId: 'emp-1', status: 'ABSENT', isFinalized: true, date: absenceDate }],
        availableCompOffGrants: [
          { employeeId: 'emp-1', earnedDate: new Date(Date.UTC(2026, 6, 5)), expiresAt: farFutureExpiry, days: 1 },
        ],
      });

      await service.processRun('tenant-1', 'run-1');

      expect(entryFor('emp-1').lopDays).toBe(1);
      expect(entryFor('emp-1').payableDays).toBe(25);
      // Full 26000/26 rate, unaffected by this same month's own LOP.
      expect(payoutCreates(prisma)[0]).toMatchObject({ amount: 1000 });
    });

    it('12. a grant whose MONTHLY period already closed in an earlier month is not paid again', async () => {
      const { service, prisma } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        payrollPolicies: policy(),
        employeeOverrides: basicSalary(26000),
        // Earned in June; its MONTHLY period closed at the end of June, a month this run
        // (July) doesn't own - it should have been resolved by June's own run, not July's.
        availableCompOffGrants: [
          { employeeId: 'emp-1', earnedDate: new Date(Date.UTC(2026, 5, 15)), expiresAt: farFutureExpiry, days: 1 },
        ],
      });

      await service.processRun('tenant-1', 'run-1');

      expect(payoutCreates(prisma)).toHaveLength(0);
    });

    it('13. an ANNUAL grant is paid in the run whose month contains the year end', async () => {
      const { service, prisma } = buildProcessRunHarness({
        run: { month: 12, year: 2026 },
        finalizations: finalizedDecember,
        payrollPolicies: policy({ compOffUsagePeriod: 'ANNUAL' }),
        employeeOverrides: basicSalary(26000),
        availableCompOffGrants: [
          { employeeId: 'emp-1', earnedDate: new Date(Date.UTC(2026, 0, 10)), expiresAt: farFutureExpiry, days: 1 },
        ],
      });

      await service.processRun('tenant-1', 'run-1');

      expect(payoutCreates(prisma)).toHaveLength(1);
    });

    it('13b. an ANNUAL grant is not paid in a run for a month before the year end', async () => {
      const { service, prisma } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        payrollPolicies: policy({ compOffUsagePeriod: 'ANNUAL' }),
        employeeOverrides: basicSalary(26000),
        availableCompOffGrants: [
          { employeeId: 'emp-1', earnedDate: new Date(Date.UTC(2026, 0, 10)), expiresAt: farFutureExpiry, days: 1 },
        ],
      });

      await service.processRun('tenant-1', 'run-1');

      expect(payoutCreates(prisma)).toHaveLength(0);
    });

    it('14. carry-forward defers a closed-period grant to the run containing its own expiresAt', async () => {
      // Dated safely past "today" (unlike expiresAt in test 15, which must be dated safely
      // before it) so this stays valid for years regardless of when the suite actually runs.
      const grantExpiresInAugust = new Date(Date.UTC(2035, 7, 15));
      const base = {
        payrollPolicies: policy({ compOffCarryForwardEnabled: true }),
        employeeOverrides: basicSalary(26000),
        availableCompOffGrants: [
          { employeeId: 'emp-1', earnedDate: new Date(Date.UTC(2035, 5, 15)), expiresAt: grantExpiresInAugust, days: 1 },
        ],
      };

      const july = buildProcessRunHarness({ run: { month: 7, year: 2035 }, finalizations: [{ tenantId: 'tenant-1', month: 7, year: 2035, locationId: null, status: 'FINALIZED' }], ...base });
      await july.service.processRun('tenant-1', 'run-1');
      expect(payoutCreates(july.prisma)).toHaveLength(0);

      const august = buildProcessRunHarness({ run: { month: 8, year: 2035 }, finalizations: [{ tenantId: 'tenant-1', month: 8, year: 2035, locationId: null, status: 'FINALIZED' }], ...base });
      await august.service.processRun('tenant-1', 'run-1');
      expect(payoutCreates(august.prisma)).toHaveLength(1);
    });

    it('14b. carry-forward with a shorter expiresAt than the period end still closes at the period end, not earlier', async () => {
      // validateCompOffUsage never checks expiresAt for a usage inside the same period, so a
      // grant stays genuinely usable through its period end even if expiresAt (e.g. the
      // default 90-day auto-expiry under an ANNUAL policy) falls before it. Paying it out at
      // that earlier expiresAt would be premature - the ANNUAL period itself hasn't closed yet.
      const base = {
        payrollPolicies: policy({ compOffUsagePeriod: 'ANNUAL', compOffCarryForwardEnabled: true }),
        employeeOverrides: basicSalary(26000),
        availableCompOffGrants: [
          {
            employeeId: 'emp-1',
            earnedDate: new Date(Date.UTC(2035, 1, 10)), // Feb 2035
            expiresAt: new Date(Date.UTC(2035, 4, 10)), // ~90 days later, well before the ANNUAL period end
            days: 1,
          },
        ],
      };

      const may = buildProcessRunHarness({ run: { month: 5, year: 2035 }, finalizations: [{ tenantId: 'tenant-1', month: 5, year: 2035, locationId: null, status: 'FINALIZED' }], ...base });
      await may.service.processRun('tenant-1', 'run-1');
      expect(payoutCreates(may.prisma)).toHaveLength(0);

      const december = buildProcessRunHarness({ run: { month: 12, year: 2035 }, finalizations: [{ tenantId: 'tenant-1', month: 12, year: 2035, locationId: null, status: 'FINALIZED' }], ...base });
      await december.service.processRun('tenant-1', 'run-1');
      expect(payoutCreates(december.prisma)).toHaveLength(1);
    });

    it('15. expiresAt already passed at processing time excludes the grant even if its period closed this month', async () => {
      const { service, prisma } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        payrollPolicies: policy(),
        employeeOverrides: basicSalary(26000),
        // Period end (end of July) falls in this run, but expiresAt is already behind "today".
        availableCompOffGrants: [
          { employeeId: 'emp-1', earnedDate: new Date(Date.UTC(2026, 6, 5)), expiresAt: new Date(Date.UTC(2026, 7, 1)), days: 1 },
        ],
      });

      await service.processRun('tenant-1', 'run-1');

      expect(payoutCreates(prisma)).toHaveLength(0);
    });

    it('16. multiple employees remain isolated', async () => {
      const { service, prisma } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        payrollPolicies: policy(),
        employeeOverrides: basicSalary(26000),
        extraEmployees: [{ id: 'emp-1' }, { id: 'emp-2' }],
        availableCompOffGrants: [
          { employeeId: 'emp-1', earnedDate: new Date(Date.UTC(2026, 6, 5)), expiresAt: farFutureExpiry, days: 1 },
        ],
      });

      await service.processRun('tenant-1', 'run-1');

      const creates = payoutCreates(prisma);
      expect(creates).toHaveLength(1);
      expect(creates[0]).toMatchObject({ employeeId: 'emp-1' });
    });

    it('17. a payroll rerun does not duplicate the payout', async () => {
      const { service, prisma, entryFor } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        payrollPolicies: policy(),
        employeeOverrides: basicSalary(26000),
        availableCompOffGrants: [
          { employeeId: 'emp-1', earnedDate: new Date(Date.UTC(2026, 6, 5)), expiresAt: farFutureExpiry, days: 1 },
        ],
      });

      await service.processRun('tenant-1', 'run-1');
      const first = entryFor('emp-1').grossPay;
      await service.processRun('tenant-1', 'run-1');
      const second = entryFor('emp-1').grossPay;

      // Gross pay is identical on the rerun (not doubled), and each processRun call deletes
      // this run's own prior COMP_OFF_PAYOUT inputs before recreating them, so the input this
      // rerun leaves behind is exactly one row, not an accumulating second one.
      expect(second).toBe(first);
      expect(prisma.payrollVariableInput.deleteMany).toHaveBeenCalledTimes(2);
      const lastCreateCall = (prisma.payrollVariableInput.createMany as jest.Mock).mock.calls.at(-1);
      expect(lastCreateCall[0].data).toHaveLength(1);
    });

    it('18. payroll with no unused Comp-Off is unchanged', async () => {
      const { service, prisma, entryFor } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        payrollPolicies: policy(),
        employeeOverrides: basicSalary(26000),
      });

      await service.processRun('tenant-1', 'run-1');

      expect(payoutCreates(prisma)).toHaveLength(0);
      expect(entryFor('emp-1').grossPay).toBeCloseTo(26000, 2);
    });

    it('19. Phase 5 used Comp-Off LOP offsetting is unaffected by an unrelated unused balance', async () => {
      const { service, entryFor, prisma } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        payrollPolicies: policy(),
        employeeOverrides: basicSalary(26000),
        attendanceRecords: [{ employeeId: 'emp-1', status: 'ABSENT', isFinalized: true, date: absenceDate }],
        usedCompOffGrants: [{ employeeId: 'emp-1', usedOnDate: absenceDate }],
        availableCompOffGrants: [
          { employeeId: 'emp-1', earnedDate: new Date(Date.UTC(2026, 6, 20)), expiresAt: farFutureExpiry, days: 1 },
        ],
      });

      await service.processRun('tenant-1', 'run-1');

      expect(entryFor('emp-1').lopDays).toBe(0);
      expect(entryFor('emp-1').payableDays).toBe(31);
      expect(payoutCreates(prisma)).toHaveLength(1);
    });
  });

  describe('payslip publication', () => {
    function publishHarness(entries: Array<Record<string, unknown>>) {
      const prisma = {
        payslip: { upsert: jest.fn().mockResolvedValue({}) },
        payrollRun: { update: jest.fn().mockResolvedValue({}) },
        expenseClaim: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      };
      const service = new PayrollService(prisma as any, {} as any, {} as any, stubDenominators() as any, {} as any);
      return { prisma, service, entries };
    }

    it('creates the payslip with the processed values on first publication', async () => {
      const { prisma, service } = publishHarness([]);
      jest.spyOn(service, 'getRun').mockResolvedValue({
        id: 'run-1',
        month: 7,
        year: 2026,
        status: 'LOCKED',
        entries: [
          {
            employeeId: 'emp-1',
            grossPay: 100000,
            totalDeductions: 20000,
            netPay: 80000,
            components: [{ code: 'BASIC', monthly: 40000 }],
          },
        ],
      } as any);

      await expect(service.publishRun('tenant-1', 'run-1', 'user-1')).resolves.toEqual({
        published: 1,
      });
      expect(prisma.payslip.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { employeeId_month_year: { employeeId: 'emp-1', month: 7, year: 2026 } },
          create: expect.objectContaining({
            payrollRunId: 'run-1',
            grossPay: 100000,
            totalDeductions: 20000,
            netPay: 80000,
          }),
        }),
      );
    });

    it('updates payroll-derived values when a later run republishes the same period', async () => {
      const { prisma, service } = publishHarness([]);
      jest.spyOn(service, 'getRun').mockResolvedValue({
        id: 'run-2',
        month: 7,
        year: 2026,
        status: 'LOCKED',
        entries: [
          {
            employeeId: 'emp-1',
            grossPay: 110000,
            totalDeductions: 21000,
            netPay: 89000,
            components: [{ code: 'BASIC', monthly: 44000 }],
          },
        ],
      } as any);

      await service.publishRun('tenant-1', 'run-2', 'user-1');

      const call = prisma.payslip.upsert.mock.calls[0][0];
      expect(call.update).toEqual(
        expect.objectContaining({
          payrollRunId: 'run-2',
          grossPay: 110000,
          totalDeductions: 21000,
          netPay: 89000,
          components: [{ code: 'BASIC', monthly: 44000 }],
          publishedAt: expect.any(Date),
        }),
      );
    });

    it('upserts once per employee and period without touching other rows', async () => {
      const { prisma, service } = publishHarness([]);
      jest.spyOn(service, 'getRun').mockResolvedValue({
        id: 'run-2',
        month: 7,
        year: 2026,
        status: 'LOCKED',
        entries: [
          { employeeId: 'emp-1', grossPay: 1, totalDeductions: 0, netPay: 1, components: [] },
          { employeeId: 'emp-2', grossPay: 2, totalDeductions: 0, netPay: 2, components: [] },
        ],
      } as any);

      await service.publishRun('tenant-1', 'run-2', 'user-1');

      expect(prisma.payslip.upsert).toHaveBeenCalledTimes(2);
      const keys = prisma.payslip.upsert.mock.calls.map((call) => call[0].where.employeeId_month_year);
      expect(keys).toEqual([
        { employeeId: 'emp-1', month: 7, year: 2026 },
        { employeeId: 'emp-2', month: 7, year: 2026 },
      ]);
      expect(prisma.payslip.upsert.mock.calls[1][0].update).toEqual(
        expect.objectContaining({ netPay: 2 }),
      );
    });

    it('keys the upsert to the run period so another month is untouched', async () => {
      const { prisma, service } = publishHarness([]);
      jest.spyOn(service, 'getRun').mockResolvedValue({
        id: 'run-3',
        month: 8,
        year: 2026,
        status: 'LOCKED',
        entries: [
          { employeeId: 'emp-1', grossPay: 5, totalDeductions: 1, netPay: 4, components: [] },
        ],
      } as any);

      await service.publishRun('tenant-1', 'run-3', 'user-1');

      expect(prisma.payslip.upsert.mock.calls[0][0].where.employeeId_month_year).toEqual({
        employeeId: 'emp-1',
        month: 8,
        year: 2026,
      });
    });
  });

  it('blocks expenses above configured policy limits', async () => {
    const { service } = expenseHarness();

    await expect(
      service.createExpense(employeeUser(), { category: 'meals', amount: 6000 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  describe('payroll input approval workflow', () => {
    function inputHarness(input: Record<string, unknown>, options: { existingRuns?: Array<Record<string, unknown>> } = {}) {
      const record = { id: 'input-1', tenantId: 'tenant-1', status: 'DRAFT', label: 'OT', amount: 1000, month: 7, year: 2026, ...input };
      const runs = options.existingRuns ?? [];
      const prisma = {
        payrollVariableInput: {
          findFirst: jest.fn().mockResolvedValue(record),
          update: jest.fn((args: { data: Record<string, unknown> }) => Promise.resolve({ ...record, ...args.data })),
        },
        payrollRun: {
          findFirst: jest.fn(({ where }: { where: Record<string, any> }) =>
            Promise.resolve(
              runs.find(
                (run) =>
                  run.tenantId === where.tenantId &&
                  run.month === where.month &&
                  run.year === where.year &&
                  run.status !== where.status.not,
              ) ?? null,
            ),
          ),
        },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
      };
      return { prisma, record, service: new PayrollService(prisma as any, {} as any, {} as any, stubDenominators() as any, {} as any) };
    }

    it('approves a DRAFT payroll input', async () => {
      const { prisma, service } = inputHarness({ status: 'DRAFT' });

      const result = await service.decidePayrollInput('tenant-1', 'user-1', 'input-1', 'APPROVED');

      expect(result.status).toBe('APPROVED');
      expect(prisma.payrollVariableInput.update).toHaveBeenCalledWith({
        where: { id: 'input-1' },
        data: { status: 'APPROVED' },
      });
    });

    it('rejects a DRAFT payroll input', async () => {
      const { service } = inputHarness({ status: 'DRAFT' });

      const result = await service.decidePayrollInput('tenant-1', 'user-1', 'input-1', 'REJECTED');

      expect(result.status).toBe('REJECTED');
    });

    it('allows flipping an already APPROVED input to REJECTED before payroll is processed', async () => {
      const { prisma, service } = inputHarness({ status: 'APPROVED' }, { existingRuns: [] });

      const result = await service.decidePayrollInput('tenant-1', 'user-1', 'input-1', 'REJECTED');

      expect(result.status).toBe('REJECTED');
      expect(prisma.payrollVariableInput.update).toHaveBeenCalledWith({
        where: { id: 'input-1' },
        data: { status: 'REJECTED' },
      });
    });

    it('allows flipping an already REJECTED input back to APPROVED before payroll is processed', async () => {
      const { prisma, service } = inputHarness({ status: 'REJECTED' }, { existingRuns: [] });

      const result = await service.decidePayrollInput('tenant-1', 'user-1', 'input-1', 'APPROVED');

      expect(result.status).toBe('APPROVED');
      expect(prisma.payrollVariableInput.update).toHaveBeenCalledWith({
        where: { id: 'input-1' },
        data: { status: 'APPROVED' },
      });
    });

    it('refuses to re-decide an APPROVED input once payroll for its period has been processed', async () => {
      const { prisma, service } = inputHarness(
        { status: 'APPROVED' },
        { existingRuns: [{ id: 'run-1', tenantId: 'tenant-1', month: 7, year: 2026, status: 'REVIEW' }] },
      );

      await expect(
        service.decidePayrollInput('tenant-1', 'user-1', 'input-1', 'REJECTED'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.payrollVariableInput.update).not.toHaveBeenCalled();
    });

    it('allows editing a DRAFT input before approval', async () => {
      const { prisma, service } = inputHarness({ status: 'DRAFT' });

      const result = await service.updatePayrollInput('tenant-1', 'user-1', 'input-1', { amount: 1500 });

      expect(result.amount).toBe(1500);
      expect(prisma.payrollVariableInput.update).toHaveBeenCalledWith({
        where: { id: 'input-1' },
        data: { amount: 1500 },
      });
    });

    it('allows editing an APPROVED input while payroll for its period has not started processing', async () => {
      const { prisma, service } = inputHarness({ status: 'APPROVED' }, { existingRuns: [] });

      const result = await service.updatePayrollInput('tenant-1', 'user-1', 'input-1', { amount: 1500 });

      expect(result.amount).toBe(1500);
      expect(prisma.payrollRun.findFirst).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', month: 7, year: 2026, status: { not: 'DRAFT' } },
      });
    });

    it('still allows editing an APPROVED input while its period run exists but is still DRAFT', async () => {
      const { prisma, service } = inputHarness(
        { status: 'APPROVED' },
        { existingRuns: [{ id: 'run-1', tenantId: 'tenant-1', month: 7, year: 2026, status: 'DRAFT' }] },
      );

      const result = await service.updatePayrollInput('tenant-1', 'user-1', 'input-1', { amount: 1500 });

      expect(result.amount).toBe(1500);
      expect(prisma.payrollVariableInput.update).toHaveBeenCalled();
    });

    it('locks an APPROVED input once payroll for its period has been processed', async () => {
      const { prisma, service } = inputHarness(
        { status: 'APPROVED' },
        { existingRuns: [{ id: 'run-1', tenantId: 'tenant-1', month: 7, year: 2026, status: 'REVIEW' }] },
      );

      await expect(
        service.updatePayrollInput('tenant-1', 'user-1', 'input-1', { amount: 1500 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.payrollVariableInput.update).not.toHaveBeenCalled();
    });

    it('refuses to edit a REJECTED input', async () => {
      const { prisma, service } = inputHarness({ status: 'REJECTED' });

      await expect(
        service.updatePayrollInput('tenant-1', 'user-1', 'input-1', { amount: 1500 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.payrollVariableInput.update).not.toHaveBeenCalled();
    });

    it('only includes APPROVED inputs when payroll is processed', async () => {
      const { service, prisma } = buildProcessRunHarness({
        finalizations: [{ tenantId: 'tenant-1', month: 7, year: 2026, locationId: null, status: 'FINALIZED' }],
      });

      await service.processRun('tenant-1', 'run-1');

      expect(prisma.payrollVariableInput.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: 'APPROVED' }) }),
      );
    });
  });

  /**
   * The configured salary basis reaching the numbers payroll actually stores. July 2026 has 31
   * calendar days and, starting on a Wednesday, 23 Mon-Fri working days.
   */
  describe('configurable salary denominator', () => {
    const finalizedJuly = [
      { tenantId: 'tenant-1', month: 7, year: 2026, locationId: null, status: 'FINALIZED' },
    ];
    const policy = (overrides: Record<string, unknown>) => [
      {
        id: 'tenant-default',
        tenantId: 'tenant-1',
        locationId: null,
        salaryBasis: 'CALENDAR_DAYS',
        fixedDays: null,
        ...overrides,
      },
    ];
    const threeUnpaidDays = [
      {
        employeeId: 'emp-1',
        days: 3,
        fromDate: new Date(Date.UTC(2026, 6, 10)),
        toDate: new Date(Date.UTC(2026, 6, 12)),
      },
    ];

    it('keeps calendar-days behaviour when no policy is configured', async () => {
      const { service, entryFor } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        leaveRequests: threeUnpaidDays,
      });

      await service.processRun('tenant-1', 'run-1');

      expect(entryFor('emp-1').lopDays).toBe(3);
      expect(entryFor('emp-1').payableDays).toBe(28);
    });

    it('pays a FIXED_DAYS month out of the configured 26 days', async () => {
      const { service, entryFor } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        payrollPolicies: policy({ salaryBasis: 'FIXED_DAYS', fixedDays: 26 }),
      });

      await service.processRun('tenant-1', 'run-1');

      expect(entryFor('emp-1').lopDays).toBe(0);
      expect(entryFor('emp-1').payableDays).toBe(26);
    });

    it('deducts LOP from the FIXED_DAYS denominator, not the calendar month', async () => {
      const { service, entryFor } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        leaveRequests: threeUnpaidDays,
        payrollPolicies: policy({ salaryBasis: 'FIXED_DAYS', fixedDays: 26 }),
      });

      await service.processRun('tenant-1', 'run-1');

      expect(entryFor('emp-1').lopDays).toBe(3);
      expect(entryFor('emp-1').payableDays).toBe(23);
    });

    it('caps LOP at the configured denominator so pay floors at zero', async () => {
      const { service, entryFor } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        payrollPolicies: policy({ salaryBasis: 'FIXED_DAYS', fixedDays: 26 }),
        leaveRequests: [
          {
            employeeId: 'emp-1',
            days: 40,
            fromDate: new Date(Date.UTC(2026, 6, 1)),
            toDate: new Date(Date.UTC(2026, 6, 31)),
          },
        ],
      });

      await service.processRun('tenant-1', 'run-1');

      expect(entryFor('emp-1').lopDays).toBe(26);
      expect(entryFor('emp-1').payableDays).toBe(0);
    });

    it('keeps a half day worth 0.5 LOP under a FIXED_DAYS policy', async () => {
      const { service, entryFor } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        payrollPolicies: policy({ salaryBasis: 'FIXED_DAYS', fixedDays: 26 }),
        attendanceRecords: [{ employeeId: 'emp-1', status: 'HALF_DAY', isFinalized: true }],
      });

      await service.processRun('tenant-1', 'run-1');

      expect(entryFor('emp-1').lopDays).toBe(0.5);
      expect(entryFor('emp-1').payableDays).toBe(25.5);
    });

    it('pays a WORKING_DAYS month out of the scheduled days only', async () => {
      const { service, entryFor } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        payrollPolicies: policy({ salaryBasis: 'WORKING_DAYS' }),
        weeklyOffDays: [0, 6],
      });

      await service.processRun('tenant-1', 'run-1');

      expect(entryFor('emp-1').payableDays).toBe(23);
    });

    it('drops a holiday out of the WORKING_DAYS denominator', async () => {
      const { service, entryFor } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        payrollPolicies: policy({ salaryBasis: 'WORKING_DAYS' }),
        weeklyOffDays: [0, 6],
        holidays: [new Date(Date.UTC(2026, 6, 15))],
      });

      await service.processRun('tenant-1', 'run-1');

      expect(entryFor('emp-1').payableDays).toBe(22);
    });

    it('fails the run when a FIXED_DAYS policy has no usable fixedDays', async () => {
      const { service } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        payrollPolicies: policy({ salaryBasis: 'FIXED_DAYS', fixedDays: null }),
      });

      await expect(service.processRun('tenant-1', 'run-1')).rejects.toThrow(BadRequestException);
    });

    it('resolves a denominator per employee, not one for the whole run', async () => {
      // Same run, three locations: loc-fixed overrides to FIXED_DAYS 26, loc-working to
      // WORKING_DAYS, and the third falls back to the tenant CALENDAR_DAYS default.
      const { service, entryFor } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        weeklyOffDays: [0, 6],
        payrollPolicies: [
          ...policy({ salaryBasis: 'CALENDAR_DAYS' }),
          {
            id: 'loc-fixed-policy',
            tenantId: 'tenant-1',
            locationId: 'loc-fixed',
            salaryBasis: 'FIXED_DAYS',
            fixedDays: 26,
          },
          {
            id: 'loc-working-policy',
            tenantId: 'tenant-1',
            locationId: 'loc-working',
            salaryBasis: 'WORKING_DAYS',
            fixedDays: null,
          },
        ],
        extraEmployees: [
          { id: 'emp-calendar', employeeCode: 'PH-CAL', locationId: 'loc-other' },
          { id: 'emp-fixed', employeeCode: 'PH-FIX', locationId: 'loc-fixed' },
          { id: 'emp-working', employeeCode: 'PH-WRK', locationId: 'loc-working' },
        ],
      });

      await service.processRun('tenant-1', 'run-1');

      expect(entryFor('emp-calendar').payableDays).toBe(31);
      expect(entryFor('emp-fixed').payableDays).toBe(26);
      expect(entryFor('emp-working').payableDays).toBe(23);
    });

    it('keeps each employee LOP against their own denominator in a mixed run', async () => {
      const { service, entryFor } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        payrollPolicies: [
          ...policy({ salaryBasis: 'CALENDAR_DAYS' }),
          {
            id: 'loc-fixed-policy',
            tenantId: 'tenant-1',
            locationId: 'loc-fixed',
            salaryBasis: 'FIXED_DAYS',
            fixedDays: 26,
          },
        ],
        extraEmployees: [
          { id: 'emp-calendar', employeeCode: 'PH-CAL', locationId: 'loc-other' },
          { id: 'emp-fixed', employeeCode: 'PH-FIX', locationId: 'loc-fixed' },
        ],
        attendanceRecords: [
          { employeeId: 'emp-calendar', status: 'HALF_DAY', isFinalized: true },
          { employeeId: 'emp-fixed', status: 'HALF_DAY', isFinalized: true },
        ],
      });

      await service.processRun('tenant-1', 'run-1');

      expect(entryFor('emp-calendar').lopDays).toBe(0.5);
      expect(entryFor('emp-calendar').payableDays).toBe(30.5);
      expect(entryFor('emp-fixed').lopDays).toBe(0.5);
      expect(entryFor('emp-fixed').payableDays).toBe(25.5);
    });

    it('pays the rest of the run when one employee has no schedulable day', async () => {
      // The tenant default stays CALENDAR_DAYS, which never consults shifts, so only the
      // employee under the location WORKING_DAYS policy hits the all-week-off shift.
      const { service, entryFor } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        weeklyOffDays: [0, 1, 2, 3, 4, 5, 6],
        payrollPolicies: [
          ...policy({ salaryBasis: 'CALENDAR_DAYS' }),
          {
            id: 'loc-working-policy',
            tenantId: 'tenant-1',
            locationId: 'loc-working',
            salaryBasis: 'WORKING_DAYS',
            fixedDays: null,
          },
        ],
        extraEmployees: [
          { id: 'emp-ok', employeeCode: 'PH-OK', locationId: null },
          { id: 'emp-broken', employeeCode: 'PH-BAD', locationId: 'loc-working' },
        ],
      });

      await service.processRun('tenant-1', 'run-1');

      expect(entryFor('emp-broken').errors).toContainEqual(
        expect.stringMatching(/no scheduled working day/i),
      );
      expect(entryFor('emp-broken').payableDays).toBe(0);
      // The healthy employee is paid normally rather than the whole run failing.
      expect(entryFor('emp-ok').payableDays).toBe(31);
      expect(entryFor('emp-ok').errors).toEqual([]);
    });

    it('records an error instead of paying when WORKING_DAYS schedules nothing', async () => {
      const { service, entryFor } = buildProcessRunHarness({
        finalizations: finalizedJuly,
        payrollPolicies: policy({ salaryBasis: 'WORKING_DAYS' }),
        weeklyOffDays: [0, 1, 2, 3, 4, 5, 6],
      });

      await service.processRun('tenant-1', 'run-1');

      expect(entryFor('emp-1').errors).toContainEqual(expect.stringMatching(/no scheduled working day/i));
      expect(entryFor('emp-1').payableDays).toBe(0);
    });
  });

  describe('mid-month salary revision proration', () => {
    const finalizedJuly = [
      { tenantId: 'tenant-1', month: 7, year: 2026, locationId: null, status: 'FINALIZED' },
    ];

    it('splits the month across an effective-dated raise instead of applying the new salary for the whole month', async () => {
      // Basic-only structure (100% of monthly CTC as BASIC, no other components) so the
      // gross for each segment is easy to hand-verify: 10 days at 10,000/mo + 21 days at
      // 15,500/mo (31-day July), each scaled against the full 31-day denominator.
      const basicOnlyComponents = [{ code: 'BASIC', name: 'Basic', type: 'EARNING', monthly: 0 }];
      const { service, prisma, entryFor } = buildProcessRunHarness({
        run: { month: 7, year: 2026 },
        finalizations: finalizedJuly,
        employeeOverrides: {
          employeeSalaries: [
            {
              ctc: 120000,
              components: [{ ...basicOnlyComponents[0], monthly: 10000 }],
              effectiveFrom: new Date(Date.UTC(2026, 5, 1)),
              effectiveTo: new Date(Date.UTC(2026, 6, 11)),
            },
            {
              ctc: 186000,
              components: [{ ...basicOnlyComponents[0], monthly: 15500 }],
              effectiveFrom: new Date(Date.UTC(2026, 6, 11)),
              effectiveTo: null,
            },
          ],
        },
      });

      await service.processRun('tenant-1', 'run-1');

      const entry = prisma.payrollRunEmployee.upsert.mock.calls.find(
        ([args]: [{ create: { employeeId: string } }]) => args.create.employeeId === 'emp-1',
      )[0].create;
      const basicComponent = entry.components.find((c: { code: string }) => c.code === 'BASIC');

      // Segment 1: 1-10 Jul (10 days) at 10,000/mo -> 10,000 * 10/31
      // Segment 2: 11-31 Jul (21 days) at 15,500/mo -> 15,500 * 21/31
      const expectedGross = Math.round((10000 * (10 / 31) + 15500 * (21 / 31)) * 100) / 100;
      expect(basicComponent.monthly).toBeCloseTo(expectedGross, 2);
      expect(entry.grossPay).toBeCloseTo(expectedGross, 2);
      expect(entryFor('emp-1').payableDays).toBe(31);
    });

    it('behaves exactly as a single salary record when only one is active in the period', async () => {
      const { service, prisma } = buildProcessRunHarness({
        run: { month: 7, year: 2026 },
        finalizations: finalizedJuly,
        employeeOverrides: {
          employeeSalaries: [
            {
              ctc: 1200000,
              components: [],
              effectiveFrom: new Date(Date.UTC(2024, 0, 1)),
              effectiveTo: null,
            },
          ],
        },
      });

      await service.processRun('tenant-1', 'run-1');

      // Falls back to the calculator (empty components), same as the pre-fix single-record path.
      expect(prisma.payrollRunEmployee.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining({ grossPay: 90000 }) }),
      );
    });
  });

  it('exports payroll GL lines from run component totals', async () => {
    const service = new PayrollService({} as any, {} as any, {} as any, stubDenominators() as any, {} as any);
    jest.spyOn(service, 'getRun').mockResolvedValue({
      id: 'run-1',
      month: 7,
      year: 2026,
      entries: [
        {
          grossPay: 100000,
          netPay: 80000,
          components: [
            { code: 'PF_EMP', monthly: 1800 },
            { code: 'TDS', monthly: 15000 },
            { code: 'PT', monthly: 200 },
          ],
        },
      ],
    } as any);

    const result = await service.exportGlCsv('tenant-1', 'run-1');

    expect(result.period).toBe('2026-07');
    expect(result.csv).toContain('Salary expense');
    expect(result.csv).toContain('TDS payable');
    expect(result.csv).toContain('Salary bank payable');
  });
});

/** The AuthUser an Employee receives at login, plus any role or link under test. */
function employeeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    userId: 'user-1',
    tenantId: 'tenant-1',
    email: 'asha@example.com',
    name: 'Asha',
    isSuperAdmin: false,
    employeeId: 'emp-1',
    roles: ['Employee'],
    scopes: ['payroll:read'],
    authType: 'jwt',
    ...overrides,
  } as AuthUser;
}

function approverUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return employeeUser({
    userId: 'user-2',
    employeeId: 'emp-approver',
    roles: ['Payroll Admin'],
    scopes: ['payroll:approve'],
    ...overrides,
  });
}

/**
 * Prisma double for the expense paths. `employee.findFirst` honours the real `where`, so
 * the tenant and status predicates of the active-employee check are exercised rather than
 * stubbed away.
 */
function expenseHarness(options: {
  employee?: Record<string, unknown> | null;
  claim?: Record<string, unknown>;
} = {}) {
  const employee = options.employee === undefined
    ? { id: 'emp-1', tenantId: 'tenant-1', status: 'ACTIVE' }
    : options.employee;
  const claim = {
    id: 'claim-1',
    tenantId: 'tenant-1',
    employeeId: 'emp-1',
    category: 'MEALS',
    amount: 900,
    status: 'SUBMITTED',
    employee: { managerId: null },
    ...options.claim,
  };
  const prisma = {
    employee: {
      findFirst: jest.fn(({ where }: { where: Record<string, any> }) =>
        Promise.resolve(
          employee &&
            employee.id === where.id &&
            employee.tenantId === where.tenantId &&
            (where.status?.in ?? []).includes(employee.status)
            ? { id: employee.id }
            : null,
        ),
      ),
    },
    expenseClaim: {
      create: jest.fn((args: { data: Record<string, unknown> }) => Promise.resolve({ id: 'claim-1', ...args.data })),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn(({ where }: { where: Record<string, any> }) =>
        Promise.resolve(
          (where.id === undefined || where.id === claim.id) &&
            (where.tenantId === undefined || where.tenantId === claim.tenantId) &&
            (where.employeeId === undefined || where.employeeId === claim.employeeId)
            ? claim
            : null,
        ),
      ),
      update: jest.fn(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ ...claim, ...data })),
      // Honours the status predicate, so a claim decided between the read and the write
      // reports zero rows exactly as Postgres would.
      updateMany: jest.fn(({ where }: { where: Record<string, any>; data: Record<string, any> }) =>
        Promise.resolve({ count: where.status === undefined || where.status === claim.status ? 1 : 0 }),
      ),
      findFirstOrThrow: jest.fn().mockResolvedValue(claim),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  return { prisma, service: new PayrollService(prisma as any, {} as any, {} as any, stubDenominators() as any, {} as any) };
}

describe('expense claims', () => {
  it('files the claim against the employee the token is linked to', async () => {
    const { prisma, service } = expenseHarness();

    await service.createExpense(employeeUser(), { category: 'travel', amount: 1200, description: 'Cab' });

    expect(prisma.employee.findFirst.mock.calls[0][0].where).toMatchObject({
      id: 'emp-1',
      tenantId: 'tenant-1',
    });
    expect(prisma.expenseClaim.create.mock.calls[0][0].data).toMatchObject({
      tenantId: 'tenant-1',
      employeeId: 'emp-1',
      category: 'TRAVEL',
      status: 'SUBMITTED',
    });
  });

  it('refuses a caller with no employee link', async () => {
    const { prisma, service } = expenseHarness();

    await expect(
      service.createExpense(employeeUser({ employeeId: null }), { category: 'travel', amount: 100 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.expenseClaim.create).not.toHaveBeenCalled();
  });

  it.each([
    ['an exited employee', { status: 'EXITED' }],
    ['an employee in another tenant', { tenantId: 'tenant-2' }],
  ])('refuses %s', async (_label, employee) => {
    const { prisma, service } = expenseHarness({
      employee: { id: 'emp-1', tenantId: 'tenant-1', status: 'ACTIVE', ...employee },
    });

    await expect(
      service.createExpense(employeeUser(), { category: 'travel', amount: 100 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.expenseClaim.create).not.toHaveBeenCalled();
  });

  it('returns only the caller own claims from the me route', async () => {
    const { prisma, service } = expenseHarness();

    await service.myExpenses(employeeUser());

    expect(prisma.expenseClaim.findMany.mock.calls[0][0].where).toEqual({
      tenantId: 'tenant-1',
      employeeId: 'emp-1',
    });
  });

  it('refuses the me route without an employee link', async () => {
    const { service } = expenseHarness();

    await expect(service.myExpenses(employeeUser({ employeeId: null }))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('narrows the tenant-wide list to the caller own claims for an employee', async () => {
    const { prisma, service } = expenseHarness();

    await service.listExpenses(employeeUser(), { status: 'SUBMITTED' } as any);

    expect(prisma.expenseClaim.findMany.mock.calls[0][0].where).toEqual({
      tenantId: 'tenant-1',
      employeeId: 'emp-1',
      status: 'SUBMITTED',
    });
  });

  it('matches nothing when an unprivileged caller has no employee link', async () => {
    const { prisma, service } = expenseHarness();

    await service.listExpenses(employeeUser({ employeeId: null }), {} as any);

    expect(prisma.expenseClaim.findMany.mock.calls[0][0].where.employeeId).toBe('__none__');
  });

  it.each([
    ['Payroll Admin', { roles: ['Payroll Admin'], scopes: ['payroll:read', 'payroll:write'] }],
    ['Manager', { roles: ['Manager'], scopes: ['payroll:read'] }],
    ['Finance Admin', { roles: ['Finance Admin'], scopes: ['payroll:read', 'payroll:approve'] }],
    ['Auditor', { roles: ['Auditor'], scopes: ['payroll:read', 'payroll:export'] }],
    ['a super admin', { roles: [], scopes: [], isSuperAdmin: true }],
    ['an API key', { roles: [], scopes: ['payroll:read'], employeeId: null, authType: 'apiKey' }],
  ])('keeps the tenant-wide list for %s', async (_label, overrides) => {
    const { prisma, service } = expenseHarness();

    await service.listExpenses(employeeUser(overrides as Partial<AuthUser>), {} as any);

    expect(prisma.expenseClaim.findMany.mock.calls[0][0].where).toEqual({ tenantId: 'tenant-1' });
  });

  it('narrows the CSV export the same way as the list', async () => {
    const { prisma, service } = expenseHarness();

    await service.exportExpensesCsv(employeeUser(), {} as any);
    expect(prisma.expenseClaim.findMany.mock.calls[0][0].where).toEqual({
      tenantId: 'tenant-1',
      employeeId: 'emp-1',
    });

    await service.exportExpensesCsv(employeeUser({ roles: ['Payroll Admin'] }), {} as any);
    expect(prisma.expenseClaim.findMany.mock.calls[1][0].where).toEqual({ tenantId: 'tenant-1' });
  });

  it.each([
    ['REJECTED', 'APPROVED'],
    ['PAID', 'REJECTED'],
    ['APPROVED', 'APPROVED'],
    ['APPROVED', 'CLARIFICATION_REQUESTED'],
    ['DRAFT', 'APPROVED'],
  ])('refuses a decision on a claim that is already %s', async (from, decision) => {
    const { prisma, service } = expenseHarness({ claim: { status: from } });

    await expect(
      service.decideExpense(approverUser(), 'claim-1', decision as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.expenseClaim.update).not.toHaveBeenCalled();
  });

  it.each(['APPROVED', 'REJECTED', 'CLARIFICATION_REQUESTED'])(
    'decides a submitted claim: %s',
    async (decision) => {
      const { prisma, service } = expenseHarness();

      await service.decideExpense(approverUser(), 'claim-1', decision as any);

      expect(prisma.expenseClaim.update.mock.calls[0][0].data).toMatchObject({
        status: decision,
        decidedById: 'user-2',
      });
    },
  );

  it('marks an approved claim paid once a run has picked it up', async () => {
    const { prisma, service } = expenseHarness({
      claim: {
        status: 'APPROVED',
        reimbursementMethod: 'PAYROLL',
        reimbursedInPayrollRunId: 'run-1',
      },
    });

    await service.decideExpense(approverUser(), 'claim-1', 'PAID');

    expect(prisma.expenseClaim.update.mock.calls[0][0].data).toMatchObject({ status: 'PAID' });
  });

  it('still refuses to pay an approved payroll claim that no run has picked up', async () => {
    const { service } = expenseHarness({
      claim: { status: 'APPROVED', reimbursementMethod: 'PAYROLL' },
    });

    await expect(
      service.decideExpense(approverUser(), 'claim-1', 'PAID'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('expense claim detail and clarification replies', () => {
  it('reads a claim the caller owns', async () => {
    const { prisma, service } = expenseHarness();

    await service.getExpense(employeeUser(), 'claim-1');

    expect(prisma.expenseClaim.findFirst.mock.calls[0][0].where).toEqual({
      id: 'claim-1',
      tenantId: 'tenant-1',
      employeeId: 'emp-1',
    });
  });

  it('hides another employee claim behind a 404', async () => {
    const { service } = expenseHarness({ claim: { employeeId: 'emp-2' } });

    await expect(service.getExpense(employeeUser(), 'claim-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('lets an approver read any claim in the tenant', async () => {
    const { prisma, service } = expenseHarness({ claim: { employeeId: 'emp-2' } });

    await service.getExpense(employeeUser({ roles: ['Payroll Admin'] }), 'claim-1');

    expect(prisma.expenseClaim.findFirst.mock.calls[0][0].where).toEqual({
      id: 'claim-1',
      tenantId: 'tenant-1',
    });
  });

  it('sends an answered claim back to the approver as SUBMITTED', async () => {
    const { prisma, service } = expenseHarness({ claim: { status: 'CLARIFICATION_REQUESTED' } });

    await service.respondToClarification(employeeUser(), 'claim-1', {
      response: 'Receipt attached now',
      amount: 800,
      receiptKey: 'tenant-1/receipt.pdf',
    });

    expect(prisma.expenseClaim.findFirst.mock.calls[0][0].where).toEqual({
      id: 'claim-1',
      tenantId: 'tenant-1',
      employeeId: 'emp-1',
    });
    expect(prisma.expenseClaim.updateMany.mock.calls[0][0].where).toEqual({
      id: 'claim-1',
      tenantId: 'tenant-1',
      employeeId: 'emp-1',
      status: 'CLARIFICATION_REQUESTED',
    });
    expect(prisma.expenseClaim.updateMany.mock.calls[0][0].data).toMatchObject({
      status: 'SUBMITTED',
      clarificationResponse: 'Receipt attached now',
      amount: 800,
      receiptKey: 'tenant-1/receipt.pdf',
      decidedById: null,
      decidedAt: null,
    });
  });

  it('keeps the approver question on the claim so the thread reads in order', async () => {
    const { prisma, service } = expenseHarness({
      claim: { status: 'CLARIFICATION_REQUESTED', clarificationNote: 'Which trip was this?' },
    });

    await service.respondToClarification(employeeUser(), 'claim-1', { response: 'Pune, 4 Aug' });

    expect(prisma.expenseClaim.updateMany.mock.calls[0][0].data.clarificationNote).toBeUndefined();
  });

  it('clears a stale answer when a second clarification is requested', async () => {
    const { prisma, service } = expenseHarness();

    await service.decideExpense(approverUser(), 'claim-1', 'CLARIFICATION_REQUESTED', {
      note: 'Still unclear',
    });

    expect(prisma.expenseClaim.update.mock.calls[0][0].data).toMatchObject({
      clarificationResponse: null,
    });
  });

  it('re-checks the policy cap against a corrected amount', async () => {
    const { prisma, service } = expenseHarness({
      claim: { status: 'CLARIFICATION_REQUESTED', category: 'MEALS' },
    });

    await expect(
      service.respondToClarification(employeeUser(), 'claim-1', { response: 'Corrected', amount: 6000 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.expenseClaim.updateMany).not.toHaveBeenCalled();
  });

  it.each(['SUBMITTED', 'APPROVED', 'REJECTED', 'PAID'])(
    'refuses a resubmit of a claim that is %s',
    async (status) => {
      const { prisma, service } = expenseHarness({ claim: { status } });

      await expect(
        service.respondToClarification(employeeUser(), 'claim-1', { response: 'Anything' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.expenseClaim.updateMany).not.toHaveBeenCalled();
    },
  );

  it('refuses a resubmit of a claim belonging to someone else', async () => {
    const { prisma, service } = expenseHarness({
      claim: { status: 'CLARIFICATION_REQUESTED', employeeId: 'emp-2' },
    });

    await expect(
      service.respondToClarification(employeeUser(), 'claim-1', { response: 'Not mine' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.expenseClaim.updateMany).not.toHaveBeenCalled();
  });

  it('refuses a resubmit from an employee who is no longer active', async () => {
    const { prisma, service } = expenseHarness({
      employee: { id: 'emp-1', tenantId: 'tenant-1', status: 'EXITED' },
      claim: { status: 'CLARIFICATION_REQUESTED' },
    });

    await expect(
      service.respondToClarification(employeeUser(), 'claim-1', { response: 'Answer' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.expenseClaim.updateMany).not.toHaveBeenCalled();
  });

  it('reports a conflict when the claim is decided while the reply is in flight', async () => {
    const { prisma, service } = expenseHarness({ claim: { status: 'CLARIFICATION_REQUESTED' } });
    // The approver's decision lands between the read and the write, so the guarded write
    // matches nothing and the reply must not revert it.
    prisma.expenseClaim.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      service.respondToClarification(employeeUser(), 'claim-1', { response: 'Answer', amount: 500 }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('lets the approver decide the resubmitted claim normally', async () => {
    const { prisma, service } = expenseHarness({
      claim: { status: 'SUBMITTED', clarificationResponse: 'Receipt attached now' },
    });

    await service.decideExpense(approverUser(), 'claim-1', 'APPROVED');

    expect(prisma.expenseClaim.update.mock.calls[0][0].data).toMatchObject({ status: 'APPROVED' });
  });
});

describe('expense claim approval authorization', () => {
  it('denies an employee approving their own expense claim', async () => {
    const { prisma, service } = expenseHarness({ claim: { employeeId: 'emp-1' } });

    await expect(
      service.decideExpense(employeeUser({ roles: ['Manager'] }), 'claim-1', 'APPROVED'),
    ).rejects.toThrow('You cannot approve your own request.');
    expect(prisma.expenseClaim.update).not.toHaveBeenCalled();
  });

  it('denies a Tenant Owner approving their own expense claim', async () => {
    const { prisma, service } = expenseHarness({ claim: { employeeId: 'emp-owner' } });

    await expect(
      service.decideExpense(
        employeeUser({ employeeId: 'emp-owner', roles: ['Tenant Owner'] }),
        'claim-1',
        'APPROVED',
      ),
    ).rejects.toThrow('You cannot approve your own request.');
    expect(prisma.expenseClaim.update).not.toHaveBeenCalled();
  });

  it('lets a Manager approve a direct report claim', async () => {
    const { prisma, service } = expenseHarness({
      claim: { employee: { managerId: 'emp-approver' } },
    });

    await service.decideExpense(approverUser({ roles: ['Manager'] }), 'claim-1', 'APPROVED');

    expect(prisma.expenseClaim.update).toHaveBeenCalled();
  });

  it('denies a Manager approving a claim outside their team', async () => {
    const { prisma, service } = expenseHarness({
      claim: { employee: { managerId: 'someone-else' } },
    });

    await expect(
      service.decideExpense(approverUser({ roles: ['Manager'] }), 'claim-1', 'APPROVED'),
    ).rejects.toThrow('You can only approve requests from employees who report to you.');
    expect(prisma.expenseClaim.update).not.toHaveBeenCalled();
  });

  it('lets Payroll Admin approve any employee claim', async () => {
    const { prisma, service } = expenseHarness({
      claim: { employee: { managerId: 'someone-else' } },
    });

    await service.decideExpense(approverUser(), 'claim-1', 'APPROVED');

    expect(prisma.expenseClaim.update).toHaveBeenCalled();
  });
});
