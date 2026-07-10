import { SetupService } from './setup.service';

function referencePrisma(overrides: Record<string, any> = {}) {
  return {
    department: { findMany: jest.fn().mockResolvedValue([{ id: 'dept-1', name: 'Engineering', code: 'ENG' }]) },
    designation: { findMany: jest.fn().mockResolvedValue([{ id: 'desig-1', name: 'Software Engineer', grade: 'L2' }]) },
    location: { findMany: jest.fn().mockResolvedValue([{ id: 'loc-1', name: 'Bangalore Office' }]) },
    legalEntity: { findMany: jest.fn().mockResolvedValue([{ id: 'entity-1', name: 'Demo Corp India Pvt Ltd', legalName: 'Demo Corp India Pvt Ltd' }]) },
    salaryStructure: { findMany: jest.fn().mockResolvedValue([{ id: 'salary-1', name: 'India Standard CTC' }]) },
    employee: { findMany: jest.fn().mockResolvedValue([{ id: 'emp-1', employeeCode: 'VH-1000', workEmail: 'manager@example.com', firstName: 'Mira', lastName: 'Rao' }]) },
    user: { findMany: jest.fn().mockResolvedValue([{ id: 'user-1', email: 'manager@example.com' }]) },
    ...overrides,
  };
}

describe('SetupService', () => {
  it('surfaces payroll blockers in tenant readiness', async () => {
    const prisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue({ id: 'tenant-1', name: 'Demo Corp' }) },
      legalEntity: { findMany: jest.fn().mockResolvedValue([]) },
      location: { findMany: jest.fn().mockResolvedValue([{ id: 'loc-1' }]) },
      department: { findMany: jest.fn().mockResolvedValue([{ id: 'dept-1' }]) },
      role: { findMany: jest.fn().mockResolvedValue([{ id: 'role-1' }]) },
      employee: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'emp-1',
            employeeCode: 'VH-1',
            workEmail: 'one@example.com',
            firstName: 'One',
            lastName: 'User',
            legalEntityId: null,
            managerId: null,
            pan: null,
            uan: null,
            bankDetails: null,
          },
        ]),
      },
      salaryStructure: { findMany: jest.fn().mockResolvedValue([]) },
      employeeSalary: { findMany: jest.fn().mockResolvedValue([]) },
      leaveType: { findMany: jest.fn().mockResolvedValue([{ id: 'lt-1' }]) },
      leavePolicy: { findMany: jest.fn().mockResolvedValue([{ id: 'lp-1' }]) },
      shift: { findMany: jest.fn().mockResolvedValue([{ id: 'shift-1' }]) },
      attendanceCaptureSetting: { findMany: jest.fn().mockResolvedValue([{ id: 'cap-1' }]) },
      payrollRun: { findMany: jest.fn().mockResolvedValue([]) },
      salaryComponent: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new SetupService(prisma as any);

    const readiness = await service.readiness('tenant-1');

    expect(readiness.status).toBe('blocked');
    expect(readiness.totals.criticalIssues).toBeGreaterThan(0);
    expect(readiness.payrollBlockers).toEqual(
      expect.arrayContaining([
        'Add at least one legal entity',
        'Create at least one salary structure',
      ]),
    );
  });

  it('validates employee import rows before commit', async () => {
    const prisma = referencePrisma();
    const service = new SetupService(prisma as any);

    const preview = await service.previewEmployees('tenant-1', {
      rows: [
        {
          employeeCode: 'VH-1001',
          firstName: 'Aarav',
          lastName: 'Sharma',
          workEmail: 'aarav@example.com',
          department: 'Engineering',
          designation: 'Software Engineer',
          location: 'Bangalore Office',
          legalEntity: 'Demo Corp India Pvt Ltd',
          managerEmployeeCode: 'VH-1000',
          salaryStructure: 'India Standard CTC',
          ctc: 1200000,
          bankAccountNumber: '1234567890',
          bankIfsc: 'HDFC0001234',
        },
        {
          employeeCode: 'VH-1001',
          firstName: '',
          lastName: 'Duplicate',
          workEmail: 'bad-email',
          department: 'Missing',
          legalEntity: 'Missing Entity',
        },
      ],
    });

    expect(preview.summary.totalRows).toBe(2);
    expect(preview.summary.errors).toBe(1);
    expect(preview.summary.canCommit).toBe(false);
    expect(preview.rows[1]?.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['required', 'invalid_email', 'duplicate', 'unknown_reference']),
    );
  });

  it('requires work email only when login creation is selected', async () => {
    const prisma = referencePrisma();
    const service = new SetupService(prisma as any);

    const preview = await service.previewEmployees('tenant-1', {
      rows: [
        {
          employeeCode: 'VH-1002',
          firstName: 'Harsh',
          lastName: 'Tester',
          legalEntity: 'Demo Corp India Pvt Ltd',
          createUser: true,
        },
      ],
    });

    expect(preview.summary.errors).toBe(1);
    expect(preview.rows[0]?.issues.map((issue) => issue.code)).toContain('login_email_required');
    expect(preview.rows[0]?.issues.find((issue) => issue.code === 'missing_bank_details')?.severity).toBe('warning');
  });

  it('allows single-name employee imports without last name', async () => {
    const prisma = referencePrisma();
    const service = new SetupService(prisma as any);

    const preview = await service.previewEmployees('tenant-1', {
      rows: [
        {
          employeeCode: 'VH-1003',
          firstName: 'Ram',
          workEmail: 'ram@example.com',
          legalEntity: 'Demo Corp India Pvt Ltd',
          createUser: true,
        },
      ],
    });

    expect(preview.summary.errors).toBe(0);
    expect(preview.rows[0]?.normalized.name).toBe('Ram');
  });

  it('returns one-time login credentials when employee import creates users', async () => {
    const prisma = referencePrisma({
      role: { upsert: jest.fn().mockResolvedValue({ id: 'role-employee' }) },
      permission: { createMany: jest.fn().mockResolvedValue({ count: 10 }) },
      userRole: { create: jest.fn().mockResolvedValue({}) },
      user: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'user-2', email: 'harsh@example.com' }),
      },
      employee: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'emp-2', firstName: 'Harsh', lastName: 'Tester' }),
        update: jest.fn().mockResolvedValue({}),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(async (callback) => callback(prisma)),
    });
    const service = new SetupService(prisma as any);

    const result = await service.commitEmployees(
      { tenantId: 'tenant-1', userId: 'owner-1' } as any,
      {
        rows: [
          {
            employeeCode: 'VH-1002',
            firstName: 'Harsh',
            lastName: 'Tester',
            workEmail: 'harsh@example.com',
            legalEntity: 'Demo Corp India Pvt Ltd',
            createUser: true,
          },
        ],
      },
    );

    expect(result.loginCredentials).toHaveLength(1);
    expect(result.loginCredentials[0]).toEqual(
      expect.objectContaining({
        employeeCode: 'VH-1002',
        name: 'Harsh Tester',
        email: 'harsh@example.com',
        temporaryPassword: expect.stringMatching(/^VioHr@/),
      }),
    );
    expect((prisma as any).user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ passwordHash: expect.any(String) }),
    }));
    expect((prisma as any).userRole.create).toHaveBeenCalledWith({ data: { userId: 'user-2', roleId: 'role-employee' } });
  });

  it('allows salary imports only for known employees and structures', async () => {
    const prisma = referencePrisma();
    const service = new SetupService(prisma as any);

    const preview = await service.previewSalary('tenant-1', {
      rows: [
        { employeeCode: 'VH-1000', salaryStructure: 'India Standard CTC', ctc: 1800000, effectiveFrom: '2026-07-01' },
        { employeeCode: 'MISSING', salaryStructure: 'Unknown Structure', ctc: 0, effectiveFrom: 'bad-date' },
      ],
    });

    expect(preview.summary.validRows).toBe(1);
    expect(preview.summary.errors).toBe(1);
    expect(preview.rows[1]?.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['unknown_employee', 'invalid_ctc', 'invalid_date', 'unknown_reference']),
    );
  });
});
