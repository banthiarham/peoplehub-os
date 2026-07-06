import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SurveyStatus } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../../common/database/prisma.service';
import { AuthUser } from '../../common/types/auth-user';
import { CreateSurveyDto, UpdateSurveyDto } from './dto/engagement.dto';

interface SurveyQuestion {
  id: string;
  text: string;
  type: 'SCALE' | 'TEXT' | 'CHOICE';
  options?: string[];
}

@Injectable()
export class EngagementService {
  constructor(private readonly prisma: PrismaService) {}

  private requireEmployee(user: AuthUser): string {
    if (!user.employeeId) throw new ForbiddenException('No employee profile linked to this user');
    return user.employeeId;
  }

  async listSurveys(tenantId: string, type?: string) {
    return this.prisma.survey.findMany({
      where: { tenantId, ...(type && { type }) },
      include: { _count: { select: { responses: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async surveyResults(tenantId: string, id: string) {
    const survey = await this.prisma.survey.findFirst({
      where: { id, tenantId },
      include: { responses: true },
    });
    if (!survey) throw new NotFoundException('Survey not found');

    const questions = (survey.questions as unknown as SurveyQuestion[]) ?? [];
    const results = questions.map((q) => {
      const answers = survey.responses
        .map((r) => (r.responses as Record<string, unknown>)?.[q.id])
        .filter((a) => a !== undefined && a !== null);
      if (q.type === 'SCALE') {
        const nums = answers.map(Number).filter((n) => !Number.isNaN(n));
        return {
          question: q.text,
          type: q.type,
          avg: nums.length ? Math.round((nums.reduce((s, n) => s + n, 0) / nums.length) * 10) / 10 : null,
          count: nums.length,
        };
      }
      if (q.type === 'CHOICE') {
        const dist = new Map<string, number>();
        for (const a of answers) dist.set(String(a), (dist.get(String(a)) ?? 0) + 1);
        return {
          question: q.text,
          type: q.type,
          distribution: [...dist.entries()].map(([option, count]) => ({ option, count })),
          count: answers.length,
        };
      }
      return { question: q.text, type: q.type, answers: answers.map(String).slice(0, 20), count: answers.length };
    });
    return {
      survey: { id: survey.id, title: survey.title, status: survey.status },
      totalResponses: survey.responses.length,
      enps: this.enpsScore(survey.responses.map((r) => r.responses as Record<string, unknown>)),
      results,
    };
  }

  async surveyAnalytics(tenantId: string) {
    const [surveys, activeEmployees] = await Promise.all([
      this.prisma.survey.findMany({
        where: { tenantId },
        include: { responses: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.employee.count({
        where: { tenantId, status: { notIn: ['EXITED', 'INACTIVE'] } },
      }),
    ]);
    return surveys.map((survey) => {
      const questions = (survey.questions as unknown as SurveyQuestion[]) ?? [];
      const responsePayloads = survey.responses.map((response) => response.responses as Record<string, unknown>);
      const scaleScores = responsePayloads.flatMap((payload) =>
        questions
          .filter((question) => question.type === 'SCALE')
          .map((question) => Number(payload[question.id]))
          .filter((score) => !Number.isNaN(score)),
      );
      return {
        id: survey.id,
        title: survey.title,
        type: survey.type,
        status: survey.status,
        responses: survey.responses.length,
        participationRate: activeEmployees ? Math.round((survey.responses.length / activeEmployees) * 100) : 0,
        avgScaleScore: scaleScores.length
          ? Math.round((scaleScores.reduce((sum, score) => sum + score, 0) / scaleScores.length) * 10) / 10
          : null,
        enps: this.enpsScore(responsePayloads),
      };
    });
  }

  async createSurvey(tenantId: string, data: CreateSurveyDto) {
    return this.prisma.survey.create({
      data: {
        tenantId,
        title: data.title,
        type: data.type ?? 'PULSE',
        status: this.surveyStatus(data.status) ?? 'DRAFT',
        isAnonymous: data.isAnonymous ?? true,
        startDate: data.startDate ? new Date(data.startDate) : data.status === 'ACTIVE' ? new Date() : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
        questions: (data.questions?.length ? data.questions : this.defaultSurveyQuestions(data.type)) as Prisma.InputJsonValue,
      },
    });
  }

  async updateSurvey(tenantId: string, id: string, data: UpdateSurveyDto) {
    const survey = await this.prisma.survey.findFirst({ where: { id, tenantId } });
    if (!survey) throw new NotFoundException('Survey not found');
    return this.prisma.survey.update({
      where: { id },
      data: {
        ...(data.status && {
          status: this.surveyStatus(data.status),
          ...(data.status === 'ACTIVE' && !survey.startDate && { startDate: new Date() }),
        }),
        ...(data.endDate && { endDate: new Date(data.endDate) }),
      },
    });
  }

  async respond(user: AuthUser, surveyId: string, responses: Record<string, unknown>) {
    const employeeId = this.requireEmployee(user);
    const survey = await this.prisma.survey.findFirst({
      where: { id: surveyId, tenantId: user.tenantId },
    });
    if (!survey) throw new NotFoundException('Survey not found');
    if (survey.status !== 'ACTIVE') throw new BadRequestException('Survey is not active');
    const respondentHash = this.respondentHash(surveyId, employeeId);
    const already = await this.prisma.surveyResponse.findFirst({
      where: { surveyId, OR: [{ employeeId }, { respondentHash }] },
    });
    if (already) throw new BadRequestException('You have already responded to this survey');
    const segment = await this.employeeSegment(user.tenantId, employeeId);
    return this.prisma.surveyResponse.create({
      data: {
        surveyId,
        employeeId: survey.isAnonymous ? null : employeeId,
        respondentHash,
        segment: segment as Prisma.InputJsonValue,
        responses: responses as Prisma.InputJsonValue,
      },
    });
  }

  async surveySegments(tenantId: string, id: string, by = 'department') {
    const survey = await this.prisma.survey.findFirst({
      where: { id, tenantId },
      include: { responses: true },
    });
    if (!survey) throw new NotFoundException('Survey not found');
    const key = ['department', 'location', 'tenure', 'manager'].includes(by) ? by : 'department';
    const groups = new Map<string, Array<Record<string, unknown>>>();
    for (const response of survey.responses) {
      const segment = (response.segment as Record<string, unknown>) ?? {};
      const label = String(segment[key] ?? 'Unassigned');
      groups.set(label, [...(groups.get(label) ?? []), response.responses as Record<string, unknown>]);
    }
    const minResponses = 3;
    return {
      survey: { id: survey.id, title: survey.title, type: survey.type },
      segmentBy: key,
      minResponses,
      segments: [...groups.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([segment, payloads]) => ({
          segment,
          responses: payloads.length,
          suppressed: payloads.length < minResponses,
          ...(payloads.length >= minResponses
            ? {
                avgScaleScore: this.avgScaleScore(payloads),
                enps: this.enpsScore(payloads),
              }
            : {}),
        })),
    };
  }

  async listRecognitions(tenantId: string, page = 1, pageSize = 20) {
    const [data, total] = await Promise.all([
      this.prisma.recognition.findMany({
        where: { tenantId, isPublic: true },
        include: {
          giver: { select: { id: true, firstName: true, lastName: true } },
          recipient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              designation: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.recognition.count({ where: { tenantId, isPublic: true } }),
    ]);
    return { data, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }

  async recognize(user: AuthUser, data: { recipientId: string; badge?: string; message: string; points?: number }) {
    const giverId = this.requireEmployee(user);
    return this.prisma.recognition.create({
      data: {
        tenantId: user.tenantId,
        giverId,
        recipientId: data.recipientId,
        badge: data.badge,
        message: data.message,
        points: data.points ?? 10,
      },
    });
  }

  async listAnnouncements(tenantId: string) {
    const now = new Date();
    return this.prisma.announcement.findMany({
      where: {
        tenantId,
        status: 'PUBLISHED',
        publishAt: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { publishAt: 'desc' },
      take: 20,
    });
  }

  async createAnnouncement(
    tenantId: string,
    data: { title: string; body: string; audience?: string; publishAt?: string; expiresAt?: string },
  ) {
    return this.prisma.announcement.create({
      data: {
        tenantId,
        title: data.title,
        body: data.body,
        audience: data.audience ?? 'ALL',
        publishAt: data.publishAt ? new Date(data.publishAt) : new Date(),
        ...(data.expiresAt && { expiresAt: new Date(data.expiresAt) }),
      },
    });
  }

  async createPoll(tenantId: string, data: { title: string; question: string; options: string[]; endDate?: string }) {
    const options = data.options.map((option) => option.trim()).filter(Boolean);
    if (options.length < 2) throw new BadRequestException('Polls need at least two options');
    return this.prisma.survey.create({
      data: {
        tenantId,
        title: data.title,
        type: 'POLL',
        status: 'ACTIVE',
        isAnonymous: false,
        startDate: new Date(),
        ...(data.endDate && { endDate: new Date(data.endDate) }),
        questions: [
          {
            id: 'choice',
            text: data.question,
            type: 'CHOICE',
            options,
          },
        ],
      },
    });
  }

  async submitAnonymousFeedback(
    tenantId: string,
    data: { category?: string; message: string; sentiment?: string },
  ) {
    return this.prisma.anonymousFeedback.create({
      data: {
        tenantId,
        category: data.category ?? 'GENERAL',
        message: data.message,
        sentiment: data.sentiment,
      },
    });
  }

  async listAnonymousFeedback(tenantId: string) {
    return this.prisma.anonymousFeedback.findMany({
      where: { tenantId },
      orderBy: { submittedAt: 'desc' },
      take: 100,
    });
  }

  async rewardsLeaderboard(tenantId: string) {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [allTime, monthly] = await Promise.all([
      this.prisma.recognition.groupBy({
        by: ['recipientId'],
        where: { tenantId },
        _sum: { points: true },
        _count: true,
        orderBy: { _sum: { points: 'desc' } },
        take: 10,
      }),
      this.prisma.recognition.groupBy({
        by: ['recipientId'],
        where: { tenantId, createdAt: { gte: monthStart } },
        _sum: { points: true },
        _count: true,
        orderBy: { _sum: { points: 'desc' } },
        take: 10,
      }),
    ]);
    const employeeIds = [...new Set([...allTime, ...monthly].map((row) => row.recipientId))];
    const employees = await this.prisma.employee.findMany({
      where: { id: { in: employeeIds } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeCode: true,
        designation: { select: { name: true } },
        department: { select: { name: true } },
      },
    });
    const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
    const mapRow = (row: (typeof allTime)[number]) => {
      const employee = employeeById.get(row.recipientId);
      return {
        employeeId: row.recipientId,
        employee: employee ? `${employee.firstName} ${employee.lastName}` : 'Unknown employee',
        employeeCode: employee?.employeeCode ?? '',
        designation: employee?.designation?.name ?? null,
        department: employee?.department?.name ?? null,
        recognitions: row._count,
        points: row._sum.points ?? 0,
      };
    };
    return {
      monthly: monthly.map(mapRow),
      allTime: allTime.map(mapRow),
      totalPoints: allTime.reduce((sum, row) => sum + (row._sum.points ?? 0), 0),
    };
  }

  async feed(tenantId: string) {
    const [announcements, recognitions, polls] = await Promise.all([
      this.listAnnouncements(tenantId),
      this.prisma.recognition.findMany({
        where: { tenantId, isPublic: true },
        include: {
          giver: { select: { firstName: true, lastName: true } },
          recipient: { select: { firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.survey.findMany({
        where: { tenantId, type: 'POLL', status: 'ACTIVE' },
        include: { _count: { select: { responses: true } } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    return [
      ...announcements.map((announcement) => ({
        type: 'ANNOUNCEMENT',
        id: announcement.id,
        title: announcement.title,
        body: announcement.body,
        audience: announcement.audience,
        createdAt: announcement.publishAt,
      })),
      ...recognitions.map((recognition) => ({
        type: 'RECOGNITION',
        id: recognition.id,
        title: `${recognition.recipient.firstName} ${recognition.recipient.lastName}`,
        body: recognition.message,
        badge: recognition.badge,
        points: recognition.points,
        from: `${recognition.giver.firstName} ${recognition.giver.lastName}`,
        createdAt: recognition.createdAt,
      })),
      ...polls.map((poll) => ({
        type: 'POLL',
        id: poll.id,
        title: poll.title,
        body: ((poll.questions as Array<{ text?: string }>)?.[0]?.text ?? 'Poll is open') as string,
        responses: poll._count.responses,
        createdAt: poll.createdAt,
      })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async stats(tenantId: string) {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const [latestSurvey, activeEmployees, recognitionsThisMonth, pointsThisMonth, activePolls, announcements] = await Promise.all([
      this.prisma.survey.findFirst({
        where: { tenantId, status: { in: ['ACTIVE', 'CLOSED'] }, type: { not: 'POLL' } },
        orderBy: { createdAt: 'desc' },
        include: { responses: true },
      }),
      this.prisma.employee.count({
        where: { tenantId, status: { notIn: ['EXITED', 'INACTIVE'] } },
      }),
      this.prisma.recognition.count({ where: { tenantId, createdAt: { gte: monthStart } } }),
      this.prisma.recognition.aggregate({
        where: { tenantId, createdAt: { gte: monthStart } },
        _sum: { points: true },
      }),
      this.prisma.survey.count({ where: { tenantId, type: 'POLL', status: 'ACTIVE' } }),
      this.prisma.announcement.count({ where: { tenantId, status: 'PUBLISHED' } }),
    ]);

    let engagementScore: number | null = null;
    if (latestSurvey) {
      const nums: number[] = [];
      for (const r of latestSurvey.responses) {
        const vals = Object.values((r.responses as Record<string, unknown>) ?? {});
        for (const v of vals) {
          const n = Number(v);
          if (!Number.isNaN(n) && n >= 1 && n <= 10) nums.push(n);
        }
      }
      engagementScore = nums.length
        ? Math.round((nums.reduce((s, n) => s + n, 0) / nums.length) * 10) / 10
        : null;
    }

    return {
      engagementScore,
      participationRate:
        latestSurvey && activeEmployees
          ? Math.round((latestSurvey.responses.length / activeEmployees) * 100)
          : null,
      recognitionsThisMonth,
      pointsThisMonth: pointsThisMonth._sum.points ?? 0,
      activePolls,
      announcements,
      latestSurvey: latestSurvey
        ? { id: latestSurvey.id, title: latestSurvey.title, status: latestSurvey.status }
        : null,
    };
  }

  async milestones(tenantId: string) {
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);
    const employees = await this.prisma.employee.findMany({
      where: { tenantId, status: { notIn: ['EXITED', 'INACTIVE'] } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeCode: true,
        dateOfBirth: true,
        joiningDate: true,
        department: { select: { name: true } },
      },
      take: 200,
    });
    const birthdays = employees
      .filter((employee) => employee.dateOfBirth && this.daysUntilAnnualDate(employee.dateOfBirth, now) <= 30)
      .map((employee) => ({
        type: 'BIRTHDAY',
        employee,
        daysUntil: this.daysUntilAnnualDate(employee.dateOfBirth!, now),
      }))
      .sort((a, b) => a.daysUntil - b.daysUntil)
      .slice(0, 10);
    const anniversaries = employees
      .filter((employee) => employee.joiningDate && this.daysUntilAnnualDate(employee.joiningDate, now) <= 30)
      .map((employee) => ({
        type: 'WORK_ANNIVERSARY',
        employee,
        years: Math.max(1, now.getFullYear() - employee.joiningDate!.getFullYear()),
        daysUntil: this.daysUntilAnnualDate(employee.joiningDate!, now),
      }))
      .sort((a, b) => a.daysUntil - b.daysUntil)
      .slice(0, 10);
    const newJoiners = employees
      .filter((employee) => employee.joiningDate && employee.joiningDate >= thirtyDaysAgo)
      .map((employee) => ({ type: 'NEW_JOINER', employee, joinedAt: employee.joiningDate }))
      .slice(0, 10);
    return { birthdays, anniversaries, newJoiners };
  }

  private enpsScore(responses: Array<Record<string, unknown>>): number | null {
    const scores = responses
      .flatMap((payload) => Object.values(payload).map(Number))
      .filter((score) => !Number.isNaN(score) && score >= 0 && score <= 10);
    if (!scores.length) return null;
    const promoters = scores.filter((score) => score >= 9).length;
    const detractors = scores.filter((score) => score <= 6).length;
    return Math.round(((promoters - detractors) / scores.length) * 100);
  }

  private avgScaleScore(responses: Array<Record<string, unknown>>): number | null {
    const scores = responses
      .flatMap((payload) => Object.values(payload).map(Number))
      .filter((score) => !Number.isNaN(score) && score >= 0 && score <= 10);
    return scores.length ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10 : null;
  }

  private respondentHash(surveyId: string, employeeId: string) {
    return createHash('sha256').update(`${surveyId}:${employeeId}`).digest('hex');
  }

  private async employeeSegment(tenantId: string, employeeId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
      select: {
        joiningDate: true,
        department: { select: { name: true } },
        location: { select: { name: true } },
        manager: { select: { firstName: true, lastName: true } },
      },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    return {
      department: employee.department?.name ?? 'Unassigned',
      location: employee.location?.name ?? 'Unassigned',
      manager: employee.manager ? `${employee.manager.firstName} ${employee.manager.lastName}` : 'Unassigned',
      tenure: this.tenureBucket(employee.joiningDate),
    };
  }

  private tenureBucket(joiningDate: Date | null) {
    if (!joiningDate) return 'Unknown';
    const months = Math.max(0, Math.floor((Date.now() - joiningDate.getTime()) / (1000 * 60 * 60 * 24 * 30)));
    if (months < 6) return '0-6 months';
    if (months < 12) return '6-12 months';
    if (months < 36) return '1-3 years';
    if (months < 60) return '3-5 years';
    return '5+ years';
  }

  private daysUntilAnnualDate(date: Date, now: Date) {
    const next = new Date(now.getFullYear(), date.getMonth(), date.getDate());
    if (next < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
      next.setFullYear(next.getFullYear() + 1);
    }
    return Math.ceil((next.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }

  private surveyStatus(status?: string): SurveyStatus | undefined {
    if (!status) return undefined;
    if (status === 'DRAFT' || status === 'ACTIVE' || status === 'CLOSED') return status;
    return 'DRAFT';
  }

  private defaultSurveyQuestions(type?: string) {
    if (type === 'ENPS') {
      return [{ id: 'enps', text: 'How likely are you to recommend this company as a workplace?', type: 'SCALE' }];
    }
    return [
      { id: 'engagement', text: 'How engaged do you feel this week?', type: 'SCALE' },
      { id: 'comment', text: 'What should we improve?', type: 'TEXT' },
    ];
  }
}
