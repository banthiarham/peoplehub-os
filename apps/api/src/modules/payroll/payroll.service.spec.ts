import { BadRequestException } from '@nestjs/common';
import { PayrollService } from './payroll.service';

type FinalizationFixture = {
  tenantId: string;
  month: number;
  year: number;
  locationId: string | null;
  status: string;
};

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
  attendanceRecords?: Array<{ employeeId: string; status: string; isFinalized: boolean }>;
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
  const prisma = {
    payrollRun: {
      findFirst: jest.fn().mockResolvedValue(run),
      update: jest.fn().mockResolvedValue(run),
    },
    employee: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'emp-1',
          employeeCode: 'PH001',
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
        },
      ]),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    attendanceRecord: {
      groupBy: jest.fn().mockResolvedValue([]),
      // Honours the LOP projection filters so leave-reconciled days are excluded
      // by the query under test rather than by the fixture.
      findMany: jest.fn(({ where }: { where: Record<string, any> }) =>
        Promise.resolve(
          (options.attendanceRecords ?? []).filter(
            (record) =>
              record.isFinalized === where.isFinalized &&
              (where.status?.in ?? []).includes(record.status),
          ),
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
    payrollVariableInput: { findMany: jest.fn().mockResolvedValue([]) },
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
  const service = new PayrollService(prisma as any, calculator as any, {} as any);
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
    };
  };
  return { prisma, service, calculator, entryFor };
}

describe('PayrollService', () => {
  it('rejects salary structures without a BASIC earning component', async () => {
    const service = new PayrollService({} as any, {} as any, {} as any);

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
    const service = new PayrollService(prisma as any, {} as any, {} as any);

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

  it('blocks payroll approval when processed entries contain critical errors', async () => {
    const prisma = {
      payrollRun: {
        findFirst: jest.fn().mockResolvedValue({ id: 'run-1', tenantId: 'tenant-1', status: 'REVIEW' }),
      },
      payrollRunEmployee: {
        findMany: jest.fn().mockResolvedValue([{ errors: ['Missing active salary structure or CTC'] }]),
      },
    };
    const service = new PayrollService(prisma as any, {} as any, {} as any);

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
    const service = new PayrollService(prisma as any, {} as any, {} as any);

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
    const service = new PayrollService(prisma as any, {} as any, {} as any);

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
    const service = new PayrollService(prisma as any, {} as any, {} as any);

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
      payrollVariableInput: { findMany: jest.fn().mockResolvedValue([]) },
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
    const service = new PayrollService(prisma as any, calculator as any, tdsEngine as any);

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
      const service = new PayrollService(prisma as any, {} as any, {} as any);

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

  describe('payslip publication', () => {
    function publishHarness(entries: Array<Record<string, unknown>>) {
      const prisma = {
        payslip: { upsert: jest.fn().mockResolvedValue({}) },
        payrollRun: { update: jest.fn().mockResolvedValue({}) },
        expenseClaim: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      };
      const service = new PayrollService(prisma as any, {} as any, {} as any);
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
    const service = new PayrollService({} as any, {} as any, {} as any);

    await expect(
      service.createExpense(
        { tenantId: 'tenant-1', employeeId: 'emp-1' } as any,
        { category: 'meals', amount: 6000 },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('exports payroll GL lines from run component totals', async () => {
    const service = new PayrollService({} as any, {} as any, {} as any);
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
