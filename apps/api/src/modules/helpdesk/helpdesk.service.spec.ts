import { HelpdeskService } from './helpdesk.service';

describe('HelpdeskService', () => {
  it('routes new payroll tickets and assigns an SLA priority', async () => {
    const prisma = {
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
});
