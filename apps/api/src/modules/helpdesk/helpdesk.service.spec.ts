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
});
