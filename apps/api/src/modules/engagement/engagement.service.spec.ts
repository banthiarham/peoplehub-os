import { EngagementService } from './engagement.service';

describe('EngagementService', () => {
  it('computes survey analytics including participation and eNPS', async () => {
    const prisma = {
      survey: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'survey-1',
            title: 'Pulse',
            type: 'ENPS',
            status: 'ACTIVE',
            questions: [{ id: 'q1', text: 'Recommend?', type: 'SCALE' }],
            responses: [
              { responses: { q1: 10 } },
              { responses: { q1: 9 } },
              { responses: { q1: 4 } },
            ],
          },
        ]),
      },
      employee: { count: jest.fn().mockResolvedValue(6) },
    };
    const service = new EngagementService(prisma as any);

    await expect(service.surveyAnalytics('tenant-1')).resolves.toEqual([
      expect.objectContaining({
        participationRate: 50,
        avgScaleScore: 7.7,
        enps: 33,
      }),
    ]);
  });

  it('builds feed and reward leaderboard from announcements, polls, and recognitions', async () => {
    const prisma = {
      announcement: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'a1', title: 'Townhall', body: 'Friday', audience: 'ALL', publishAt: new Date('2026-07-05') },
        ]),
      },
      recognition: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'r1',
            badge: 'OWNERSHIP',
            message: 'Owned the launch',
            points: 25,
            createdAt: new Date('2026-07-04'),
            giver: { firstName: 'Asha', lastName: 'Rao' },
            recipient: { firstName: 'Kabir', lastName: 'Mehta' },
          },
        ]),
        groupBy: jest
          .fn()
          .mockResolvedValueOnce([{ recipientId: 'emp-1', _sum: { points: 25 }, _count: 1 }])
          .mockResolvedValueOnce([{ recipientId: 'emp-1', _sum: { points: 25 }, _count: 1 }]),
      },
      survey: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'p1',
            title: 'Lunch poll',
            questions: [{ text: 'Pick one' }],
            createdAt: new Date('2026-07-03'),
            _count: { responses: 4 },
          },
        ]),
      },
      employee: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'emp-1',
            firstName: 'Kabir',
            lastName: 'Mehta',
            employeeCode: 'EMP-1',
            designation: { name: 'Engineer' },
            department: { name: 'Engineering' },
          },
        ]),
      },
    };
    const service = new EngagementService(prisma as any);

    await expect(service.feed('tenant-1')).resolves.toEqual([
      expect.objectContaining({ type: 'ANNOUNCEMENT', title: 'Townhall' }),
      expect.objectContaining({ type: 'RECOGNITION', points: 25 }),
      expect.objectContaining({ type: 'POLL', responses: 4 }),
    ]);
    await expect(service.rewardsLeaderboard('tenant-1')).resolves.toEqual({
      allTime: [expect.objectContaining({ employee: 'Kabir Mehta', points: 25 })],
      monthly: [expect.objectContaining({ employee: 'Kabir Mehta', points: 25 })],
      totalPoints: 25,
    });
  });

  it('stores anonymous survey responses with respondent hash and segment snapshot', async () => {
    const prisma = {
      survey: {
        findFirst: jest.fn().mockResolvedValue({ id: 'survey-1', tenantId: 'tenant-1', status: 'ACTIVE', isAnonymous: true }),
      },
      surveyResponse: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'response-1', employeeId: null }),
      },
      employee: {
        findFirst: jest.fn().mockResolvedValue({
          joiningDate: new Date('2025-01-01'),
          department: { name: 'Engineering' },
          location: { name: 'Bengaluru' },
          manager: { firstName: 'Asha', lastName: 'Rao' },
        }),
      },
    };
    const service = new EngagementService(prisma as any);

    await expect(
      service.respond(
        {
          tenantId: 'tenant-1',
          employeeId: 'emp-1',
          userId: 'user-1',
          email: 'employee@example.com',
          name: 'Employee',
          isSuperAdmin: false,
          roles: ['Employee'],
        },
        'survey-1',
        { enps: 9 },
      ),
    ).resolves.toEqual({ id: 'response-1', employeeId: null });
    expect(prisma.surveyResponse.findFirst).toHaveBeenCalledWith({
      where: { surveyId: 'survey-1', OR: [{ employeeId: 'emp-1' }, { respondentHash: expect.any(String) }] },
    });
    expect(prisma.surveyResponse.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        employeeId: null,
        respondentHash: expect.any(String),
        segment: expect.objectContaining({ department: 'Engineering', location: 'Bengaluru', manager: 'Asha Rao' }),
      }),
    });
  });

  it('suppresses segmented survey results below the anonymity threshold', async () => {
    const prisma = {
      survey: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'survey-1',
          tenantId: 'tenant-1',
          title: 'Pulse',
          type: 'PULSE',
          responses: [
            { segment: { department: 'Engineering' }, responses: { q1: 9 } },
            { segment: { department: 'Engineering' }, responses: { q1: 8 } },
            { segment: { department: 'Engineering' }, responses: { q1: 7 } },
            { segment: { department: 'HR' }, responses: { q1: 10 } },
          ],
        }),
      },
    };
    const service = new EngagementService(prisma as any);

    await expect(service.surveySegments('tenant-1', 'survey-1', 'department')).resolves.toEqual({
      survey: { id: 'survey-1', title: 'Pulse', type: 'PULSE' },
      segmentBy: 'department',
      minResponses: 3,
      segments: [
        { segment: 'Engineering', responses: 3, suppressed: false, avgScaleScore: 8, enps: 33 },
        { segment: 'HR', responses: 1, suppressed: true },
      ],
    });
  });
});
