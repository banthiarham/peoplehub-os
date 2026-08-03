import { EmployeesService } from './employees.service';

const user = {
  tenantId: 'tenant-1',
  userId: 'user-1',
  email: 'hr@example.com',
  name: 'HR User',
  isSuperAdmin: false,
  employeeId: 'requester-employee',
  roles: ['HR Admin'],
};

describe('EmployeesService', () => {
  it('routes sensitive profile edits through maker-checker while applying ordinary edits', async () => {
    const existing = {
      id: 'emp-1',
      tenantId: 'tenant-1',
      firstName: 'Asha',
      pan: 'OLDPAN1234',
      status: 'ACTIVE',
    };
    const updated = { ...existing, firstName: 'Asha R' };
    const prisma = {
      employee: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(existing)
          .mockResolvedValueOnce({ id: 'requester-employee' })
          .mockResolvedValueOnce({ id: 'approver-employee' }),
        update: jest.fn().mockResolvedValue(updated),
      },
      employeeProfileChange: { createMany: jest.fn() },
      approvalRequest: { create: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const service = new EmployeesService(prisma as any, {} as any, {} as any);

    const result = await service.update(user, 'emp-1', {
      firstName: 'Asha R',
      pan: 'NEWPAN1234',
    });

    expect(result.pendingSensitiveChanges).toBe(1);
    expect(prisma.employee.update).toHaveBeenCalledWith({
      where: { id: 'emp-1' },
      data: { firstName: 'Asha R' },
    });
    expect(prisma.approvalRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        requesterId: 'requester-employee',
        approverId: 'approver-employee',
        module: 'employees',
        objectType: 'EmployeeProfileChange',
        objectId: 'emp-1',
        requestData: { fields: ['pan'] },
      }),
    });
    expect(prisma.employeeProfileChange.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          employeeId: 'emp-1',
          fieldName: 'pan',
          oldValue: 'OLDPAN1234',
          newValue: 'NEWPAN1234',
          approvedAt: null,
        }),
      ],
    });
  });

  it('lets super admins apply sensitive edits directly', async () => {
    const existing = { id: 'emp-1', tenantId: 'tenant-1', firstName: 'Asha', pan: 'OLDPAN1234', status: 'ACTIVE' };
    const prisma = {
      employee: {
        findFirst: jest.fn().mockResolvedValue(existing),
        update: jest.fn().mockResolvedValue({ ...existing, pan: 'NEWPAN1234' }),
      },
      employeeProfileChange: { createMany: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const service = new EmployeesService(prisma as any, {} as any, {} as any);

    const result = await service.update({ ...user, isSuperAdmin: true, roles: ['Super Admin'] }, 'emp-1', {
      pan: 'NEWPAN1234',
    });

    expect(result.pendingSensitiveChanges).toBe(0);
    expect(prisma.employee.update).toHaveBeenCalledWith({
      where: { id: 'emp-1' },
      data: { pan: 'NEWPAN1234' },
    });
  });

  it('lets tenant owners update legal entity directly while preserving approval for other sensitive fields', async () => {
    const existing = {
      id: 'emp-1',
      tenantId: 'tenant-1',
      legalEntityId: 'entity-1',
      pan: 'OLDPAN1234',
      status: 'ACTIVE',
    };
    const prisma = {
      employee: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(existing)
          .mockResolvedValueOnce({ id: 'requester-employee' })
          .mockResolvedValueOnce({ id: 'approver-employee' }),
        update: jest.fn().mockResolvedValue({ ...existing, legalEntityId: 'entity-2' }),
      },
      employeeProfileChange: { createMany: jest.fn() },
      approvalRequest: { create: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const service = new EmployeesService(prisma as any, {} as any, {} as any);

    const result = await service.update(
      { ...user, roles: ['Tenant Owner'] },
      'emp-1',
      { legalEntityId: 'entity-2', pan: 'NEWPAN1234' },
    );

    expect(result.pendingSensitiveChanges).toBe(1);
    expect(prisma.employee.update).toHaveBeenCalledWith({
      where: { id: 'emp-1' },
      data: { legalEntityId: 'entity-2' },
    });
    expect(prisma.approvalRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ requestData: { fields: ['pan'] } }),
    });
    expect(prisma.employeeProfileChange.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ fieldName: 'pan', approvedAt: null })],
    });
  });

  describe('authorized attendance locations', () => {
    /** Everything `create` touches, plus the join table it writes separately. */
    function createHarness() {
      const employeeLocation = {
        deleteMany: jest.fn(),
        upsert: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      };
      const location = {
        findMany: jest.fn(({ where }: any) =>
          Promise.resolve((where.id.in as string[]).map((id) => ({ id }))),
        ),
      };
      const created = { id: 'emp-1', status: 'ACTIVE', locationId: 'loc-a', joiningDate: null };
      const tx = {
        employee: { create: jest.fn().mockResolvedValue(created), update: jest.fn() },
        employeeLocation,
        location,
        employeeLifecycleEvent: { create: jest.fn() },
        auditLog: { create: jest.fn() },
      };
      const prisma = {
        employee: { findFirst: jest.fn().mockResolvedValue(null) },
        user: { findFirst: jest.fn().mockResolvedValue(null) },
        $transaction: jest.fn((run: any) => run(tx)),
      };
      const balances = { initializeForEmployee: jest.fn() };
      return { prisma, tx, employeeLocation, location, balances };
    }

    it('keeps authorizedLocationIds out of the Employee row and writes the join table', async () => {
      const { prisma, tx, employeeLocation, balances } = createHarness();
      const service = new EmployeesService(prisma as any, {} as any, balances as any);

      await service.create(
        'tenant-1',
        {
          firstName: 'Asha',
          lastName: 'R',
          employeeCode: 'PH001',
          locationId: 'loc-a',
          authorizedLocationIds: ['loc-b'],
        } as any,
        'user-1',
      );

      // Prisma rejects an unknown argument, so this must never reach the row.
      const [{ data }] = tx.employee.create.mock.calls[0];
      expect(data).not.toHaveProperty('authorizedLocationIds');
      expect(data).toMatchObject({ locationId: 'loc-a', employeeCode: 'PH001' });

      // The primary is authorized whether or not the caller listed it.
      expect(employeeLocation.upsert).toHaveBeenCalledTimes(2);
      expect(employeeLocation.upsert.mock.calls.map(([args]: any) => args.create)).toEqual([
        { employeeId: 'emp-1', locationId: 'loc-a', isPrimary: true },
        { employeeId: 'emp-1', locationId: 'loc-b', isPrimary: false },
      ]);
    });

    it('rejects a location from another workspace', async () => {
      const { prisma, location, balances } = createHarness();
      // Only the primary comes back as belonging to the tenant.
      location.findMany.mockResolvedValue([{ id: 'loc-a' }]);
      const service = new EmployeesService(prisma as any, {} as any, balances as any);

      await expect(
        service.create(
          'tenant-1',
          {
            firstName: 'Asha',
            lastName: 'R',
            employeeCode: 'PH001',
            locationId: 'loc-a',
            authorizedLocationIds: ['loc-from-another-tenant'],
          } as any,
          'user-1',
        ),
      ).rejects.toThrow(/do not belong to this workspace/i);
    });

    it('drops the former primary when an employee transfers office', async () => {
      const existing = { id: 'emp-1', tenantId: 'tenant-1', locationId: 'loc-a', status: 'ACTIVE' };
      const employeeLocation = {
        // The extras a caller deliberately added; the old primary is excluded
        // by the `isPrimary: false` filter the service queries with.
        findMany: jest.fn().mockResolvedValue([{ locationId: 'loc-c' }]),
        deleteMany: jest.fn(),
        upsert: jest.fn(),
      };
      const prisma = {
        employee: {
          findFirst: jest.fn().mockResolvedValue(existing),
          update: jest.fn().mockResolvedValue({ ...existing, locationId: 'loc-b' }),
        },
        employeeLocation,
        location: {
          findMany: jest.fn(({ where }: any) =>
            Promise.resolve((where.id.in as string[]).map((id) => ({ id }))),
          ),
        },
        employeeProfileChange: { createMany: jest.fn() },
        auditLog: { create: jest.fn() },
      };
      const service = new EmployeesService(prisma as any, {} as any, {} as any);

      await service.update(user, 'emp-1', { locationId: 'loc-b' });

      expect(employeeLocation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { employeeId: 'emp-1', isPrimary: false } }),
      );
      expect(employeeLocation.upsert.mock.calls.map(([args]: any) => args.create)).toEqual([
        { employeeId: 'emp-1', locationId: 'loc-b', isPrimary: true },
        { employeeId: 'emp-1', locationId: 'loc-c', isPrimary: false },
      ]);
      // loc-a, the office they left, is no longer authorized.
      expect(employeeLocation.deleteMany).toHaveBeenCalledWith({
        where: { employeeId: 'emp-1', locationId: { notIn: ['loc-b', 'loc-c'] } },
      });
    });
  });
});
