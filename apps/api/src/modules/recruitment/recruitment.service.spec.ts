import { RecruitmentService } from './recruitment.service';

describe('RecruitmentService', () => {
  it('accepts public applications for open tenant jobs', async () => {
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ id: 'tenant-1' }),
      },
      jobRequisition: {
        findFirst: jest.fn().mockResolvedValue({ id: 'job-1' }),
      },
      candidate: {
        create: jest.fn().mockResolvedValue({ id: 'cand-1', currentStage: 'APPLIED' }),
      },
    };
    const service = new RecruitmentService(prisma as any);

    await expect(
      service.publicApply('demo-corp', 'job-1', {
        firstName: 'Nia',
        lastName: 'Rao',
        email: 'nia@example.com',
        phone: '+919900000000',
      }),
    ).resolves.toEqual({ id: 'cand-1', currentStage: 'APPLIED' });
    expect(prisma.candidate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        jobRequisitionId: 'job-1',
        source: 'CAREERS_PAGE',
        tags: ['public-application'],
      }),
      select: expect.any(Object),
    });
  });

  it('stores weighted interview scorecards and derives hiring result', async () => {
    const prisma = {
      interview: {
        findFirst: jest.fn().mockResolvedValue({ id: 'int-1', feedback: null }),
        update: jest.fn().mockResolvedValue({ id: 'int-1', rating: 4, result: 'PASS' }),
      },
    };
    const service = new RecruitmentService(prisma as any);

    await expect(
      service.submitInterviewScorecard('tenant-1', 'int-1', {
        competencies: [
          { name: 'Technical depth', rating: 5, weight: 2 },
          { name: 'Communication', rating: 3, weight: 1 },
        ],
        strengths: 'Strong architecture discussion.',
        recommendation: 'HIRE',
      }),
    ).resolves.toEqual({ id: 'int-1', rating: 4, result: 'PASS' });
    expect(prisma.interview.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        rating: 4,
        result: 'PASS',
        scorecard: expect.objectContaining({
          recommendation: 'HIRE',
          weightedRating: 4.3,
        }),
      }),
    }));
  });

  it('opens approved job requisitions for publishing', async () => {
    const prisma = {
      jobRequisition: {
        findFirst: jest.fn().mockResolvedValue({ id: 'job-1', approvalStatus: 'PENDING' }),
        update: jest.fn().mockResolvedValue({ id: 'job-1', status: 'OPEN', approvalStatus: 'APPROVED' }),
      },
    };
    const service = new RecruitmentService(prisma as any);

    await expect(
      service.decideJobApproval('tenant-1', 'job-1', { status: 'APPROVED' }, 'user-1'),
    ).resolves.toEqual({ id: 'job-1', status: 'OPEN', approvalStatus: 'APPROVED' });
    expect(prisma.jobRequisition.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'OPEN',
        approvalStatus: 'APPROVED',
        approvedById: 'user-1',
        approvedAt: expect.any(Date),
        publishedAt: expect.any(Date),
      }),
    }));
  });

  it('blocks sending offers until compensation approval is complete', async () => {
    const prisma = {
      offer: {
        findFirst: jest.fn().mockResolvedValue({ id: 'offer-1', tenantId: 'tenant-1', approvalStatus: 'PENDING' }),
        update: jest.fn(),
      },
    };
    const service = new RecruitmentService(prisma as any);

    await expect(
      service.updateOffer('tenant-1', 'offer-1', { status: 'SENT' }),
    ).rejects.toThrow('Offer must be approved before it can be sent');
    expect(prisma.offer.update).not.toHaveBeenCalled();
  });

  it('converts an accepted candidate into a preboarding employee once without duplicates', async () => {
    const candidate = {
      id: 'cand-1',
      tenantId: 'tenant-1',
      firstName: 'Nia',
      lastName: 'Rao',
      email: 'nia@example.com',
      phone: '+919900000000',
      currentStage: 'OFFER_ACCEPTED',
      isConverted: false,
      convertedToEmployeeId: null,
      stageHistory: [],
      jobRequisition: { departmentId: 'dept-1', designationId: 'desig-1', locationId: 'loc-1' },
      offers: [{ status: 'ACCEPTED', joiningDate: new Date('2026-08-01'), designationId: 'desig-2', locationId: 'loc-2' }],
    };
    const prisma = {
      candidate: {
        findFirst: jest.fn().mockResolvedValue(candidate),
      },
      employee: {
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(41),
      },
      $transaction: jest.fn(async (fn) => fn({
        employee: {
          create: jest.fn().mockResolvedValue({ id: 'emp-1', employeeCode: 'VH-0042', joiningDate: new Date('2026-08-01') }),
        },
        candidate: { update: jest.fn().mockResolvedValue({}) },
        employeeLifecycleEvent: { create: jest.fn().mockResolvedValue({}) },
      })),
    };
    const service = new RecruitmentService(prisma as any);

    await expect(service.convertCandidate('tenant-1', 'cand-1', {}, 'user-1')).resolves.toEqual(
      expect.objectContaining({ id: 'emp-1', employeeCode: 'VH-0042' }),
    );
    expect(prisma.employee.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: [{ workEmail: 'nia@example.com' }, { personalEmail: 'nia@example.com' }],
      }),
    }));
  });
});
