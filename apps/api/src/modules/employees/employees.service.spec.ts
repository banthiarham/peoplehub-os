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

describe('EmployeesService.terminate', () => {
  const actor = { ...user, roles: ['HR Admin'], employeeId: 'hr-employee' };
  const existing = {
    id: 'emp-1',
    tenantId: 'tenant-1',
    userId: 'user-9',
    firstName: 'Asha',
    lastName: 'Ramachandran',
    status: 'ACTIVE',
    exitDate: null,
  };
  const dto = {
    effectiveDate: '2026-08-17',
    reason: 'Gross misconduct',
    confirmName: 'Asha Ramachandran',
  };

  function harness(
    overrides: {
      employee?: Record<string, unknown>;
      linkedUser?: Record<string, unknown> | null;
      otherAdmins?: number;
      openExits?: Array<{ id: string }>;
    } = {},
  ) {
    const tx = {
      employee: { update: jest.fn().mockResolvedValue({ ...existing, status: 'EXITED' }) },
      user: { update: jest.fn() },
      employeeLifecycleEvent: { create: jest.fn() },
      exitRequest: {
        findMany: jest.fn().mockResolvedValue(overrides.openExits ?? []),
        updateMany: jest.fn(),
      },
      exitTask: { updateMany: jest.fn().mockResolvedValue({ count: 3 }) },
      employeeDevice: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      employee: {
        findFirst: jest.fn().mockResolvedValue({ ...existing, ...overrides.employee }),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue(
          overrides.linkedUser === undefined
            ? { id: 'user-9', isActive: true, isSuperAdmin: false, userRoles: [] }
            : overrides.linkedUser,
        ),
        count: jest.fn().mockResolvedValue(overrides.otherAdmins ?? 1),
      },
      $transaction: jest.fn((run: any) => run(tx)),
    };
    const service = new EmployeesService(prisma as any, {} as any, {} as any);
    return { prisma, tx, service };
  }

  it('exits the employee, disables their login and clears the device binding in one transaction', async () => {
    const { prisma, tx, service } = harness({ openExits: [{ id: 'exit-1' }] });

    const result = await service.terminate(actor, 'emp-1', dto);

    expect(tx.employee.update).toHaveBeenCalledWith({
      where: { id: 'emp-1' },
      data: { status: 'EXITED', exitDate: new Date('2026-08-17') },
    });
    // Login is gated on User.isActive alone, so this is what actually locks them out.
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'user-9' },
      data: { isActive: false },
    });
    expect(tx.employeeLifecycleEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        employeeId: 'emp-1',
        eventType: 'TERMINATED',
        fromStatus: 'ACTIVE',
        toStatus: 'EXITED',
        remarks: 'Gross misconduct',
        createdById: 'user-1',
      }),
    });
    expect(tx.employeeDevice.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', employeeId: 'emp-1' },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'employee.terminated',
        objectType: 'Employee',
        objectId: 'emp-1',
        actorId: 'user-1',
      }),
    });
    // Every write went through the one transaction callback.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      userDisabled: true,
      closedExitRequests: 1,
      waivedExitTasks: 3,
      removedDeviceBindings: 1,
    });
  });

  it('closes an in-flight exit request and waives its outstanding tasks', async () => {
    const { tx, service } = harness({ openExits: [{ id: 'exit-1' }, { id: 'exit-2' }] });

    await service.terminate(actor, 'emp-1', dto);

    expect(tx.exitRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { notIn: ['COMPLETED', 'CLOSED_ON_TERMINATION'] },
        }),
      }),
    );
    expect(tx.exitRequest.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['exit-1', 'exit-2'] } },
      data: expect.objectContaining({ status: 'CLOSED_ON_TERMINATION' }),
    });
    expect(tx.exitTask.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        exitRequestId: { in: ['exit-1', 'exit-2'] },
        completedAt: null,
        isWaived: false,
      }),
      data: { isWaived: true },
    });
  });

  it('leaves the offboarding tables alone when there is no open exit request', async () => {
    const { tx, service } = harness();

    await service.terminate(actor, 'emp-1', dto);

    expect(tx.exitRequest.updateMany).not.toHaveBeenCalled();
    expect(tx.exitTask.updateMany).not.toHaveBeenCalled();
  });

  it('handles an employee with no linked login', async () => {
    const { tx, service } = harness({ employee: { userId: null }, linkedUser: null });

    const result = await service.terminate(actor, 'emp-1', dto);

    expect(tx.user.update).not.toHaveBeenCalled();
    expect(result.userDisabled).toBe(false);
  });

  describe('confirmation', () => {
    it('accepts the full name with stray whitespace or different casing', async () => {
      const { tx, service } = harness();
      await service.terminate(actor, 'emp-1', { ...dto, confirmName: '  asha   Ramachandran ' });
      expect(tx.employee.update).toHaveBeenCalled();
    });

    it('rejects a partial or misspelled name', async () => {
      for (const confirmName of ['Asha', 'Asha Ramachandra', ' ']) {
        const { tx, service } = harness();
        await expect(service.terminate(actor, 'emp-1', { ...dto, confirmName })).rejects.toThrow(
          /Type "Asha Ramachandran" exactly/,
        );
        expect(tx.employee.update).not.toHaveBeenCalled();
      }
    });
  });

  describe('guards', () => {
    it('rejects a future effective date, because termination is immediate', async () => {
      const { tx, service } = harness();
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      await expect(
        service.terminate(actor, 'emp-1', { ...dto, effectiveDate: tomorrow }),
      ).rejects.toThrow(/cannot be in the future/);
      expect(tx.employee.update).not.toHaveBeenCalled();
    });

    it('rejects an employee who is already exited or deactivated', async () => {
      for (const status of ['EXITED', 'INACTIVE']) {
        const { tx, service } = harness({ employee: { status } });
        await expect(service.terminate(actor, 'emp-1', dto)).rejects.toThrow(/already/);
        expect(tx.employee.update).not.toHaveBeenCalled();
      }
    });

    it('blocks self-termination by employee id and by linked user id', async () => {
      const { service: byEmployee } = harness();
      await expect(
        byEmployee.terminate({ ...actor, employeeId: 'emp-1' }, 'emp-1', dto),
      ).rejects.toThrow(/your own employment/);

      const { service: byUser } = harness();
      await expect(byUser.terminate({ ...actor, userId: 'user-9' }, 'emp-1', dto)).rejects.toThrow(
        /your own employment/,
      );
    });

    it('blocks the workspace owner and the platform super admin', async () => {
      const { service: owner } = harness({
        linkedUser: {
          id: 'user-9',
          isActive: true,
          isSuperAdmin: false,
          userRoles: [{ role: { name: 'Tenant Owner' } }],
        },
      });
      await expect(owner.terminate(actor, 'emp-1', dto)).rejects.toThrow(/workspace owner/);

      const { service: superAdmin } = harness({
        linkedUser: { id: 'user-9', isActive: true, isSuperAdmin: true, userRoles: [] },
      });
      await expect(superAdmin.terminate(actor, 'emp-1', dto)).rejects.toThrow(/workspace owner/);
    });

    it('blocks the last active administrator but allows one of several', async () => {
      const adminUser = {
        id: 'user-9',
        isActive: true,
        isSuperAdmin: false,
        userRoles: [{ role: { name: 'HR Admin' } }],
      };

      const { service: soleAdmin } = harness({ linkedUser: adminUser, otherAdmins: 0 });
      await expect(soleAdmin.terminate(actor, 'emp-1', dto)).rejects.toThrow(
        /last active administrator/,
      );

      const { tx, service } = harness({ linkedUser: adminUser, otherAdmins: 2 });
      await service.terminate(actor, 'emp-1', dto);
      expect(tx.employee.update).toHaveBeenCalled();
    });

    it('does not count the employee being terminated as a remaining admin', async () => {
      const { prisma, service } = harness({
        linkedUser: {
          id: 'user-9',
          isActive: true,
          isSuperAdmin: false,
          userRoles: [{ role: { name: 'HR Admin' } }],
        },
      });

      await service.terminate(actor, 'emp-1', dto);

      expect(prisma.user.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          isActive: true,
          id: { not: 'user-9' },
        }),
      });
    });

    it('scopes the employee lookup to the caller tenant', async () => {
      const { prisma, service } = harness();
      await service.terminate(actor, 'emp-1', dto);
      expect(prisma.employee.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'emp-1', tenantId: 'tenant-1' } }),
      );
    });
  });
});
