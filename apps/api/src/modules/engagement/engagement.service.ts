import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { AuthUser } from '../../common/types/auth-user';

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

  async listSurveys(tenantId: string) {
    return this.prisma.survey.findMany({
      where: { tenantId },
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
    return { survey: { id: survey.id, title: survey.title, status: survey.status }, totalResponses: survey.responses.length, results };
  }

  async respond(user: AuthUser, surveyId: string, responses: Record<string, unknown>) {
    const employeeId = this.requireEmployee(user);
    const survey = await this.prisma.survey.findFirst({
      where: { id: surveyId, tenantId: user.tenantId },
    });
    if (!survey) throw new NotFoundException('Survey not found');
    if (survey.status !== 'ACTIVE') throw new BadRequestException('Survey is not active');
    const already = await this.prisma.surveyResponse.findFirst({
      where: { surveyId, employeeId },
    });
    if (already) throw new BadRequestException('You have already responded to this survey');
    return this.prisma.surveyResponse.create({
      data: {
        surveyId,
        employeeId: survey.isAnonymous ? null : employeeId,
        responses: responses as Prisma.InputJsonValue,
      },
    });
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

  async recognize(user: AuthUser, data: { recipientId: string; badge?: string; message: string }) {
    const giverId = this.requireEmployee(user);
    return this.prisma.recognition.create({
      data: {
        tenantId: user.tenantId,
        giverId,
        recipientId: data.recipientId,
        badge: data.badge,
        message: data.message,
      },
    });
  }

  async stats(tenantId: string) {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const [latestSurvey, activeEmployees, recognitionsThisMonth] = await Promise.all([
      this.prisma.survey.findFirst({
        where: { tenantId, status: { in: ['ACTIVE', 'CLOSED'] } },
        orderBy: { createdAt: 'desc' },
        include: { responses: true },
      }),
      this.prisma.employee.count({
        where: { tenantId, status: { notIn: ['EXITED', 'INACTIVE'] } },
      }),
      this.prisma.recognition.count({ where: { tenantId, createdAt: { gte: monthStart } } }),
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
      latestSurvey: latestSurvey
        ? { id: latestSurvey.id, title: latestSurvey.title, status: latestSurvey.status }
        : null,
    };
  }
}
