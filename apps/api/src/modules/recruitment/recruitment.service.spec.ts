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
});
