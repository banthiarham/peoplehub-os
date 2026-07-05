import { BadRequestException } from '@nestjs/common';
import { PayrollService } from './payroll.service';

describe('PayrollService', () => {
  it('blocks payroll approval when processed entries contain critical errors', async () => {
    const prisma = {
      payrollRun: {
        findFirst: jest.fn().mockResolvedValue({ id: 'run-1', tenantId: 'tenant-1', status: 'REVIEW' }),
      },
      payrollRunEmployee: {
        findMany: jest.fn().mockResolvedValue([{ errors: ['Missing active salary structure or CTC'] }]),
      },
    };
    const service = new PayrollService(prisma as any, {} as any);

    await expect(service.approveRun('tenant-1', 'run-1', 'user-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.payrollRunEmployee.findMany).toHaveBeenCalledWith({
      where: { payrollRunId: 'run-1' },
      select: { errors: true },
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
    const service = new PayrollService(prisma as any, {} as any);

    await expect(service.approveRun('tenant-1', 'run-1', 'user-1')).resolves.toEqual({
      id: 'run-1',
      status: 'APPROVED',
    });
    expect(prisma.payrollRun.update).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: { status: 'APPROVED', lockedAt: expect.any(Date), lockedById: 'user-1' },
    });
  });
});
