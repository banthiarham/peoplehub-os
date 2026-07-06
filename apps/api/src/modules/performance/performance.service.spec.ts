import { PerformanceService } from './performance.service';

describe('PerformanceService', () => {
  it('computes goal progress from weighted key results when creating a goal', async () => {
    const prisma = {
      employee: {
        findFirst: jest.fn().mockResolvedValue({ id: 'emp-1' }),
      },
      goal: {
        create: jest.fn().mockResolvedValue({ id: 'goal-1', progress: 50 }),
      },
    };
    const service = new PerformanceService(prisma as any);

    await expect(
      service.createGoal('tenant-1', {
        employeeId: 'emp-1',
        title: 'Improve onboarding',
        keyResults: [
          { title: 'Launch checklist', current: 100, target: 100, weight: 1 },
          { title: 'Reduce time to productivity', current: 0, target: 100, weight: 1 },
        ],
      }),
    ).resolves.toEqual({ id: 'goal-1', progress: 50 });
    expect(prisma.goal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        keyResults: expect.any(Array),
        progress: 50,
      }),
    });
  });

  it('creates review cycles with questionnaire definitions', async () => {
    const prisma = {
      reviewCycle: {
        create: jest.fn().mockResolvedValue({ id: 'cycle-1', questions: [{ id: 'impact' }] }),
      },
    };
    const service = new PerformanceService(prisma as any);

    await expect(
      service.createCycle('tenant-1', {
        name: 'Q1 Review',
        startDate: '2026-01-01',
        endDate: '2026-03-31',
        questions: [{ id: 'impact', label: 'Impact', type: 'TEXT', required: true }],
      }),
    ).resolves.toEqual({ id: 'cycle-1', questions: [{ id: 'impact' }] });
    expect(prisma.reviewCycle.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        name: 'Q1 Review',
        questions: [{ id: 'impact', label: 'Impact', type: 'TEXT', required: true }],
      }),
    });
  });

  it('blocks manager reviews from non-reporting managers', async () => {
    const prisma = {
      reviewCycle: {
        findFirst: jest.fn().mockResolvedValue({ id: 'cycle-1', tenantId: 'tenant-1', status: 'ACTIVE' }),
      },
      employee: {
        findFirst: jest.fn().mockResolvedValue({ id: 'emp-2', managerId: 'manager-real' }),
      },
    };
    const service = new PerformanceService(prisma as any);

    await expect(
      service.submitReview(
        {
          tenantId: 'tenant-1',
          employeeId: 'manager-wrong',
          userId: 'user-1',
          email: 'manager@example.com',
          name: 'Manager',
          isSuperAdmin: false,
          roles: ['Manager'],
        },
        {
          reviewCycleId: 'cycle-1',
          revieweeId: 'emp-2',
          reviewerType: 'MANAGER',
          overallRating: 4,
        },
      ),
    ).rejects.toThrow('Manager review can only be submitted by the reporting manager');
  });

  it('audit logs calibration changes', async () => {
    const calibration = { id: 'cal-1', reviewCycleId: 'cycle-1', revieweeId: 'emp-2', calibratedRating: 4.5 };
    const prisma = {
      reviewCycle: { findFirst: jest.fn().mockResolvedValue({ id: 'cycle-1' }) },
      employee: { findFirst: jest.fn().mockResolvedValue({ id: 'emp-2' }) },
      performanceCalibration: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue(calibration),
      },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
    };
    const service = new PerformanceService(prisma as any);

    await expect(
      service.calibrate(
        {
          tenantId: 'tenant-1',
          employeeId: 'hr-1',
          userId: 'user-hr',
          email: 'hr@example.com',
          name: 'HR',
          isSuperAdmin: false,
          roles: ['HR Admin'],
        },
        {
          reviewCycleId: 'cycle-1',
          revieweeId: 'emp-2',
          calibratedRating: 4.5,
          reason: 'Leadership calibration evidence',
        },
      ),
    ).resolves.toEqual(calibration);
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'performance.calibration.created',
        objectType: 'PerformanceCalibration',
        objectId: 'cal-1',
        reason: 'Leadership calibration evidence',
      }),
    });
  });
});
