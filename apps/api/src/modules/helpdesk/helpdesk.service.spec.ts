import { NotFoundException } from '@nestjs/common';
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

    function makeService(ticket: any = baseTicket) {
      const prisma = {
        ticket: { findFirst: jest.fn().mockResolvedValue(ticket) },
        helpdeskSlaRule: { findFirst: jest.fn().mockResolvedValue(null) },
      };
      return { service: new HelpdeskService(prisma as any), prisma };
    }

    it('returns only public comments to the owning employee', async () => {
      const { service } = makeService();
      const viewer = { userId: 'u-1', tenantId: 'tenant-1', employeeId: 'emp-1', roles: ['Employee'] } as any;

      const result = await service.get('tenant-1', 'ticket-1', viewer);

      expect(result.comments).toHaveLength(1);
      expect(result.comments[0].id).toBe('c-public');
    });

    it('denies access to a ticket owned by a different employee', async () => {
      const { service } = makeService();
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
  });
});
