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
});
