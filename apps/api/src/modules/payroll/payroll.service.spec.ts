import { BadRequestException } from '@nestjs/common';
import { PayrollService } from './payroll.service';

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
