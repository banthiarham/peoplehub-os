import { BadRequestException } from '@nestjs/common';
import { LeaveService } from './leave.service';

describe('LeaveService', () => {
  const user = {
    tenantId: 'tenant-1',
    employeeId: 'emp-1',
    userId: 'user-1',
    email: 'employee@example.com',
    name: 'Employee',
    roles: ['Employee'],
    isSuperAdmin: false,
  };

  it('enforces leave policy attachment requirements before creating a request', async () => {
    const prisma = {
      employee: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'emp-1',
          status: 'CONFIRMED',
          gender: 'MALE',
          employmentType: 'FULL_TIME',
          locationId: 'loc-1',
        }),
      },
      leaveType: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'lt-1',
          tenantId: 'tenant-1',
          name: 'Sick Leave',
          code: 'SL',
          isPaid: true,
          requiresAttachment: false,
          minDuration: 0.5,
          maxDuration: null,
          allowNegativeBalance: false,
          genderRestriction: null,
        }),
      },
      leavePolicy: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'policy-1',
          requiresAttachment: true,
          genderRestriction: null,
          employmentTypes: [],
          probationAllowed: true,
          noticePeriodAllowed: true,
          sandwichRule: false,
          minDuration: 0.5,
          maxDuration: null,
          allowNegativeBalance: false,
        }),
      },
    };
    const service = new LeaveService(prisma as any, {} as any);

    await expect(
      service.apply(user as any, {
        leaveTypeId: 'lt-1',
        fromDate: '2026-07-06',
        toDate: '2026-07-06',
        reason: 'Medical',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
