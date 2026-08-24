import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../../common/types/auth-user';
import { HelpdeskService } from './helpdesk.service';

describe('HelpdeskService', () => {
  it('routes new payroll tickets and assigns an SLA priority', async () => {
    const prisma = {
      helpdeskSlaRule: {
        findFirst: jest.fn().mockResolvedValue({ assigneeQueue: 'Payroll Admin', resolutionHours: 6, responseHours: 2 }),
      },
      ticket: {
        create: jest.fn().mockResolvedValue({ id: 'ticket-1', assignedTo: 'Payroll Admin' }),
      },
    };
    const service = new HelpdeskService(prisma as any);

    await expect(
      service.create(
        { tenantId: 'tenant-1', employeeId: 'emp-1' } as any,
        { category: 'payroll', subject: 'Payslip issue', description: 'Incorrect TDS' },
      ),
    ).resolves.toEqual({ id: 'ticket-1', assignedTo: 'Payroll Admin' });
    expect(prisma.ticket.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        category: 'PAYROLL',
        priority: 'HIGH',
        assignedTo: 'Payroll Admin',
      }),
    });
  });

  it('answers helpdesk questions from approved knowledge-base content', async () => {
    const prisma = {
      knowledgeBaseArticle: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'kb-1',
            title: 'Payroll query process',
            summary: 'Use the portal and attach a payslip screenshot.',
            body: 'Use the helpdesk portal and include the payslip screenshot.',
            category: 'PAYROLL',
            sourceType: 'POLICY',
            tags: ['payroll'],
          },
        ]),
      },
    };
    const service = new HelpdeskService(prisma as any);

    await expect(service.aiAnswer('tenant-1', 'How do I raise a payroll query?')).resolves.toEqual(
      expect.objectContaining({
        answer: expect.stringContaining('Payroll query process'),
        citations: [expect.objectContaining({ id: 'kb-1' })],
      }),
    );
  });

  describe('get() ownership and comment visibility', () => {
    const baseTicket = {
      id: 'ticket-1',
      tenantId: 'tenant-1',
      employeeId: 'emp-1',
      category: 'PAYROLL',
      priority: 'MEDIUM',
      status: 'OPEN',
      slaBreached: false,
      createdAt: new Date(),
      employee: { id: 'emp-1', firstName: 'Ada', lastName: 'Lovelace', employeeCode: 'E1' },
      comments: [
        { id: 'c-public', ticketId: 'ticket-1', message: 'We are looking into this', isInternal: false, createdAt: new Date() },
        { id: 'c-internal', ticketId: 'ticket-1', message: 'Escalate to payroll ops', isInternal: true, createdAt: new Date() },
      ],
    };

    // `scopeRows` stands in for the tenant's real `Permission` rows: what `helpdesk`
    // VIEW scope the viewer's role(s) actually grant. This is what `isOwnTicketsOnly`
    // now keys off, instead of matching the role name `'Employee'` as a string.
    function makeService(ticket: any = baseTicket, scopeRows: Array<{ scopeType: string }> = []) {
      const prisma = {
        ticket: { findFirst: jest.fn().mockResolvedValue(ticket), update: jest.fn((args: any) => Promise.resolve({ ...ticket, ...args.data })) },
        ticketComment: { create: jest.fn((args: any) => Promise.resolve({ id: 'c-new', ...args.data })) },
        helpdeskSlaRule: { findFirst: jest.fn().mockResolvedValue(null) },
        permission: { findMany: jest.fn().mockResolvedValue(scopeRows) },
      };
      return { service: new HelpdeskService(prisma as any), prisma };
    }

    it('returns only public comments to the owning employee', async () => {
      const { service } = makeService(baseTicket, [{ scopeType: 'OWN_DATA' }]);
      const viewer = { userId: 'u-1', tenantId: 'tenant-1', employeeId: 'emp-1', roles: ['Employee'] } as any;

      const result = await service.get('tenant-1', 'ticket-1', viewer);

      expect(result.comments).toHaveLength(1);
      expect(result.comments[0].id).toBe('c-public');
    });

    it('denies access to a ticket owned by a different employee', async () => {
      const { service } = makeService(baseTicket, [{ scopeType: 'OWN_DATA' }]);
      const viewer = { userId: 'u-2', tenantId: 'tenant-1', employeeId: 'emp-2', roles: ['Employee'] } as any;

      await expect(service.get('tenant-1', 'ticket-1', viewer)).rejects.toThrow(NotFoundException);
    });

    it('returns internal and public comments to HR/admin viewers', async () => {
      const { service } = makeService();
      const viewer = { userId: 'u-3', tenantId: 'tenant-1', employeeId: null, roles: ['HR Admin'] } as any;

      const result = await service.get('tenant-1', 'ticket-1', viewer);

      expect(result.comments).toHaveLength(2);
    });

    it('preserves existing behavior when no viewer is passed (internal callers)', async () => {
      const { service } = makeService();

      const result = await service.get('tenant-1', 'ticket-1');

      expect(result.comments).toHaveLength(2);
    });

    it('does not narrow a multi-role user (Employee + Manager) to their own tickets', async () => {
      // Regression test for the bug the old `roles.length === 1` check had: assigning a
      // second role used to skip the narrowing check entirely (falling through to
      // "sees everything") for the WRONG reason — length !== 1. Here it correctly does
      // not narrow, but because the Manager role's helpdesk grant is DIRECT_REPORTS,
      // not because of the role count.
      const { service } = makeService(baseTicket, [{ scopeType: 'OWN_DATA' }, { scopeType: 'DIRECT_REPORTS' }]);
      const viewer = {
        userId: 'u-4',
        tenantId: 'tenant-1',
        employeeId: 'emp-2',
        roles: ['Employee', 'Manager'],
      } as any;

      const result = await service.get('tenant-1', 'ticket-1', viewer);

      expect(result.comments).toHaveLength(2);
    });

    it('narrows a custom role granted helpdesk only at OWN_DATA, even though it is not named "Employee"', async () => {
      // Regression test for the other bug: a tenant's custom role (any name) that only
      // ever holds OWN_DATA-scoped helpdesk access must be narrowed too. The old check
      // matched the literal role name and would have left this caller unrestricted.
      const { service } = makeService(baseTicket, [{ scopeType: 'OWN_DATA' }]);
      const viewer = {
        userId: 'u-5',
        tenantId: 'tenant-1',
        employeeId: 'emp-2',
        roles: ['Field Employee'],
      } as any;

      await expect(service.get('tenant-1', 'ticket-1', viewer)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update() and comment() ownership', () => {
    const baseTicket = {
      id: 'ticket-1',
      tenantId: 'tenant-1',
      employeeId: 'emp-1',
      category: 'PAYROLL',
      priority: 'MEDIUM',
      status: 'OPEN',
      slaBreached: false,
      createdAt: new Date(),
      employee: { id: 'emp-1', firstName: 'Ada', lastName: 'Lovelace', employeeCode: 'E1' },
      comments: [],
    };

    function makeService(ticket: any = baseTicket, scopeRows: Array<{ scopeType: string }> = []) {
      const prisma = {
        ticket: { findFirst: jest.fn().mockResolvedValue(ticket), update: jest.fn((args: any) => Promise.resolve({ ...ticket, ...args.data })) },
        ticketComment: { create: jest.fn((args: any) => Promise.resolve({ id: 'c-new', ...args.data })) },
        helpdeskSlaRule: { findFirst: jest.fn().mockResolvedValue(null) },
        permission: { findMany: jest.fn().mockResolvedValue(scopeRows) },
      };
      return { service: new HelpdeskService(prisma as any), prisma };
    }

    it('lets an employee update their own ticket', async () => {
      const { service, prisma } = makeService(baseTicket, [{ scopeType: 'OWN_DATA' }]);
      const user = { userId: 'u-1', tenantId: 'tenant-1', employeeId: 'emp-1', roles: ['Employee'] } as any;

      await service.update(user, 'ticket-1', { status: 'CLOSED' });

      expect(prisma.ticket.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'ticket-1' } }),
      );
    });

    it('denies an employee updating another employee\'s ticket', async () => {
      const { service } = makeService(baseTicket, [{ scopeType: 'OWN_DATA' }]);
      const user = { userId: 'u-2', tenantId: 'tenant-1', employeeId: 'emp-2', roles: ['Employee'] } as any;

      await expect(service.update(user, 'ticket-1', { status: 'CLOSED' })).rejects.toThrow(NotFoundException);
    });

    it('lets an employee comment on their own ticket, but never as an internal note', async () => {
      const { service, prisma } = makeService(baseTicket, [{ scopeType: 'OWN_DATA' }]);
      const user = { userId: 'u-1', tenantId: 'tenant-1', employeeId: 'emp-1', roles: ['Employee'] } as any;

      await service.comment(user, 'ticket-1', 'Any update?', true);

      expect(prisma.ticketComment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ isInternal: false }) }),
      );
    });

    it('denies an employee commenting on another employee\'s ticket', async () => {
      const { service } = makeService(baseTicket, [{ scopeType: 'OWN_DATA' }]);
      const user = { userId: 'u-2', tenantId: 'tenant-1', employeeId: 'emp-2', roles: ['Employee'] } as any;

      await expect(service.comment(user, 'ticket-1', 'hi')).rejects.toThrow(NotFoundException);
    });
  });

  describe('stats() tenant-wide visibility', () => {
    function makeService(scopeRows: Array<{ scopeType: string }> = []) {
      const prisma = {
        ticket: { groupBy: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
        permission: { findMany: jest.fn().mockResolvedValue(scopeRows) },
      };
      return { service: new HelpdeskService(prisma as any), prisma };
    }

    it('denies an employee tenant-wide helpdesk stats', async () => {
      const { service } = makeService([{ scopeType: 'OWN_DATA' }]);
      const user = { userId: 'u-1', tenantId: 'tenant-1', employeeId: 'emp-1', roles: ['Employee'] } as any;

      await expect(service.stats(user)).rejects.toThrow(ForbiddenException);
    });

    it('allows an HR Admin (no employee link) tenant-wide helpdesk stats', async () => {
      const { service } = makeService();
      const user = { userId: 'u-2', tenantId: 'tenant-1', employeeId: null, roles: ['HR Admin'] } as any;

      await expect(service.stats(user)).resolves.toBeDefined();
    });
  });
});

/**
 * `escalate()` is the closest thing helpdesk has to an approval/decision action, and it
 * used to have no per-ticket authorization at all - anyone whose role/scope admitted them
 * to the route could escalate any ticket in the tenant, including their own. These pin the
 * `assertCanDecideApproval` checks that close that gap, mirroring leave/timesheets/payroll.
 */
describe('HelpdeskService: escalate authorization', () => {
  function user(overrides: Partial<AuthUser> = {}): AuthUser {
    return {
      userId: 'user-1',
      tenantId: 'tenant-1',
      email: 'x@example.com',
      name: 'X',
      isSuperAdmin: false,
      employeeId: 'emp-caller',
      roles: ['Manager'],
      ...overrides,
    } as AuthUser;
  }

  function harness(ticket: Record<string, unknown> | null) {
    const prisma = {
      ticket: {
        findFirst: jest.fn().mockResolvedValue(ticket),
        update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ ...ticket, ...data })),
      },
      ticketComment: {
        create: jest.fn().mockResolvedValue({ id: 'comment-1' }),
      },
      helpdeskSlaRule: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    return { prisma, service: new HelpdeskService(prisma as any) };
  }

  const ticket = (overrides: Record<string, unknown> = {}) => ({
    id: 'ticket-1',
    tenantId: 'tenant-1',
    employeeId: 'emp-target',
    category: 'IT',
    priority: 'MEDIUM',
    employee: { managerId: 'emp-manager' },
    ...overrides,
  });

  it('denies a caller escalating their own ticket', async () => {
    const { prisma, service } = harness(ticket({ employeeId: 'emp-caller' }));

    await expect(
      service.escalate(user({ roles: ['HR Admin'] }), 'ticket-1'),
    ).rejects.toThrow('You cannot approve your own request.');
    expect(prisma.ticket.update).not.toHaveBeenCalled();
    expect(prisma.ticketComment.create).not.toHaveBeenCalled();
  });

  it('denies a Manager escalating a ticket outside their team', async () => {
    const { prisma, service } = harness(ticket({ employee: { managerId: 'someone-else' } }));

    await expect(
      service.escalate(user({ employeeId: 'emp-manager', roles: ['Manager'] }), 'ticket-1'),
    ).rejects.toThrow('You can only approve requests from employees who report to you.');
    expect(prisma.ticket.update).not.toHaveBeenCalled();
  });

  it('lets a Manager escalate a direct report ticket', async () => {
    const { prisma, service } = harness(ticket({ employee: { managerId: 'emp-manager' } }));

    const result = await service.escalate(user({ employeeId: 'emp-manager', roles: ['Manager'] }), 'ticket-1');

    expect(result).toMatchObject({ status: 'ESCALATED' });
    expect(prisma.ticket.update).toHaveBeenCalled();
  });

  it.each(['HR Admin', 'Payroll Admin', 'Tenant Owner'])(
    'lets %s escalate any employee ticket regardless of manager',
    async (role) => {
      const { prisma, service } = harness(ticket({ employee: { managerId: 'someone-else' } }));

      const result = await service.escalate(
        user({ employeeId: 'emp-admin', roles: [role] }),
        'ticket-1',
      );

      expect(result).toMatchObject({ status: 'ESCALATED' });
      expect(prisma.ticket.update).toHaveBeenCalled();
    },
  );

  it('lets Super Admin escalate any employee ticket', async () => {
    const { prisma, service } = harness(ticket({ employee: { managerId: 'someone-else' } }));

    const result = await service.escalate(
      user({ employeeId: 'emp-super', roles: [], isSuperAdmin: true }),
      'ticket-1',
    );

    expect(result).toMatchObject({ status: 'ESCALATED' });
    expect(prisma.ticket.update).toHaveBeenCalled();
  });

  it('still denies Super Admin escalating their own ticket', async () => {
    const { prisma, service } = harness(ticket({ employeeId: 'emp-super' }));

    await expect(
      service.escalate(user({ employeeId: 'emp-super', roles: [], isSuperAdmin: true }), 'ticket-1'),
    ).rejects.toThrow('You cannot approve your own request.');
    expect(prisma.ticket.update).not.toHaveBeenCalled();
  });

  it('404s when the ticket does not exist', async () => {
    const { service } = harness(null);

    await expect(service.escalate(user({ roles: ['HR Admin'] }), 'missing')).rejects.toThrow(
      'Ticket not found',
    );
  });
});
