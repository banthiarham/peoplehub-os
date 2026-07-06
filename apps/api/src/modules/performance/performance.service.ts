import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ReviewCycleStatus } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { AuthUser } from '../../common/types/auth-user';
import { CreateReviewCycleDto, KeyResultDto, UpdateReviewCycleDto } from './dto/performance.dto';

@Injectable()
export class PerformanceService {
  constructor(private readonly prisma: PrismaService) {}

  private requireEmployee(user: AuthUser): string {
    if (!user.employeeId) throw new ForbiddenException('No employee profile linked to this user');
    return user.employeeId;
  }

  async listGoals(tenantId: string, employeeId?: string, status?: string) {
    return this.prisma.goal.findMany({
      where: { tenantId, ...(employeeId && { employeeId }), ...(status && { status }) },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async createGoal(
    tenantId: string,
    data: { employeeId: string; title: string; description?: string; type?: string; weightage?: number; targetDate?: string; keyResults?: KeyResultDto[] },
  ) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: data.employeeId, tenantId },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    return this.prisma.goal.create({
      data: {
        tenantId,
        employeeId: data.employeeId,
        title: data.title,
        description: data.description,
        keyResults: (data.keyResults ?? []) as unknown as Prisma.InputJsonValue,
        type: data.type ?? 'INDIVIDUAL',
        weightage: data.weightage ?? 1,
        targetDate: data.targetDate ? new Date(data.targetDate) : undefined,
        progress: data.keyResults?.length ? this.keyResultProgress(data.keyResults) : undefined,
      },
    });
  }

  async updateGoal(
    tenantId: string,
    id: string,
    data: { progress?: number; status?: string; title?: string; description?: string; keyResults?: KeyResultDto[] },
  ) {
    const goal = await this.prisma.goal.findFirst({ where: { id, tenantId } });
    if (!goal) throw new NotFoundException('Goal not found');
    const progress = data.keyResults ? this.keyResultProgress(data.keyResults) : data.progress;
    return this.prisma.goal.update({
      where: { id },
      data: {
        ...(progress !== undefined && { progress }),
        ...(data.status && { status: data.status }),
        ...(data.title && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.keyResults !== undefined && { keyResults: data.keyResults as unknown as Prisma.InputJsonValue }),
        ...(progress !== undefined && progress >= 100 && { status: 'COMPLETED' }),
      },
    });
  }

  async listCycles(tenantId: string) {
    const cycles = await this.prisma.reviewCycle.findMany({
      where: { tenantId },
      include: { _count: { select: { reviewResponses: true } } },
      orderBy: { startDate: 'desc' },
    });
    const activeEmployees = await this.prisma.employee.count({
      where: { tenantId, status: { notIn: ['EXITED', 'INACTIVE'] } },
    });
    return cycles.map((c) => ({
      ...c,
      responses: c._count.reviewResponses,
      participants: activeEmployees,
      completionPct: activeEmployees
        ? Math.round((c._count.reviewResponses / activeEmployees) * 100)
        : 0,
    }));
  }

  async createCycle(tenantId: string, data: CreateReviewCycleDto) {
    return this.prisma.reviewCycle.create({
      data: {
        tenantId,
        name: data.name,
        type: data.type ?? 'ANNUAL',
        status: this.reviewCycleStatus(data.status),
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        selfReview: data.selfReview ?? true,
        managerReview: data.managerReview ?? true,
        peerReview: data.peerReview ?? false,
        review360: data.review360 ?? false,
        questions: (data.questions ?? this.defaultReviewQuestions()) as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async updateCycle(tenantId: string, id: string, data: UpdateReviewCycleDto) {
    const cycle = await this.prisma.reviewCycle.findFirst({ where: { id, tenantId } });
    if (!cycle) throw new NotFoundException('Review cycle not found');
    return this.prisma.reviewCycle.update({
      where: { id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.status && { status: this.reviewCycleStatus(data.status) }),
        ...(data.startDate && { startDate: new Date(data.startDate) }),
        ...(data.endDate && { endDate: new Date(data.endDate) }),
        ...(data.questions && { questions: data.questions as unknown as Prisma.InputJsonValue }),
      },
    });
  }

  async submitReview(
    user: AuthUser,
    data: {
      reviewCycleId: string;
      revieweeId: string;
      reviewerType: string;
      overallRating?: number;
      comments?: string;
      responses?: Record<string, unknown>;
    },
  ) {
    const reviewerId = this.requireEmployee(user);
    const cycle = await this.prisma.reviewCycle.findFirst({
      where: { id: data.reviewCycleId, tenantId: user.tenantId },
    });
    if (!cycle) throw new NotFoundException('Review cycle not found');
    return this.prisma.reviewResponse.upsert({
      where: {
        reviewCycleId_revieweeId_reviewerId_reviewerType: {
          reviewCycleId: data.reviewCycleId,
          revieweeId: data.revieweeId,
          reviewerId,
          reviewerType: data.reviewerType,
        },
      },
      create: {
        reviewCycleId: data.reviewCycleId,
        revieweeId: data.revieweeId,
        reviewerId,
        reviewerType: data.reviewerType,
        overallRating: data.overallRating,
        comments: data.comments,
        responses: (data.responses ?? {}) as Prisma.InputJsonValue,
        submittedAt: new Date(),
      },
      update: {
        overallRating: data.overallRating,
        comments: data.comments,
        responses: (data.responses ?? {}) as Prisma.InputJsonValue,
        submittedAt: new Date(),
      },
    });
  }

  async giveFeedback(
    user: AuthUser,
    data: { recipientId: string; type?: string; message: string; isPublic?: boolean },
  ) {
    const giverId = this.requireEmployee(user);
    return this.prisma.feedback.create({
      data: {
        tenantId: user.tenantId,
        giverId,
        recipientId: data.recipientId,
        type: data.type ?? 'FEEDBACK',
        message: data.message,
        isPublic: data.isPublic ?? false,
      },
    });
  }

  async listFeedback(tenantId: string, employeeId?: string) {
    return this.prisma.feedback.findMany({
      where: { tenantId, ...(employeeId && { recipientId: employeeId }) },
      include: {
        giver: { select: { id: true, firstName: true, lastName: true } },
        recipient: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async stats(tenantId: string) {
    const [activeCycle, goals, ratings] = await Promise.all([
      this.prisma.reviewCycle.findFirst({
        where: { tenantId, status: 'ACTIVE' },
        include: { _count: { select: { reviewResponses: true } } },
      }),
      this.prisma.goal.groupBy({ by: ['status'], where: { tenantId }, _count: true }),
      this.prisma.reviewResponse.aggregate({
        where: { reviewCycle: { tenantId }, overallRating: { not: null } },
        _avg: { overallRating: true },
      }),
    ]);
    const goalCount = (s: string) => goals.find((g) => g.status === s)?._count ?? 0;
    const activeEmployees = await this.prisma.employee.count({
      where: { tenantId, status: { notIn: ['EXITED', 'INACTIVE'] } },
    });
    return {
      activeCycle: activeCycle
        ? {
            id: activeCycle.id,
            name: activeCycle.name,
            completionPct: activeEmployees
              ? Math.round((activeCycle._count.reviewResponses / activeEmployees) * 100)
              : 0,
          }
        : null,
      goals: {
        active: goalCount('ACTIVE'),
        completed: goalCount('COMPLETED'),
        atRisk: goalCount('AT_RISK'),
      },
      avgRating: ratings._avg.overallRating
        ? Math.round(ratings._avg.overallRating * 10) / 10
      : null,
    };
  }

  private keyResultProgress(keyResults: KeyResultDto[]): number {
    if (!keyResults.length) return 0;
    const totalWeight = keyResults.reduce((sum, kr) => sum + (kr.weight ?? 1), 0) || 1;
    const progress = keyResults.reduce((sum, kr) => {
      if (kr.status === 'DONE') return sum + 100 * (kr.weight ?? 1);
      if (!kr.target || kr.target <= 0) return sum;
      return sum + Math.min(100, Math.max(0, ((kr.current ?? 0) / kr.target) * 100)) * (kr.weight ?? 1);
    }, 0) / totalWeight;
    return Math.round(progress);
  }

  private defaultReviewQuestions() {
    return [
      { id: 'impact', label: 'What business impact did this employee create?', type: 'TEXT', required: true },
      { id: 'execution', label: 'Execution quality', type: 'RATING', competency: 'Delivery', weight: 1, required: true },
      { id: 'collaboration', label: 'Collaboration and communication', type: 'RATING', competency: 'Collaboration', weight: 1, required: true },
      { id: 'growth', label: 'Top growth area for the next cycle', type: 'TEXT', required: false },
    ];
  }

  private reviewCycleStatus(status?: string): ReviewCycleStatus {
    if (!status) return 'DRAFT';
    if (status === 'DRAFT' || status === 'ACTIVE' || status === 'COMPLETED' || status === 'ARCHIVED') {
      return status;
    }
    return 'DRAFT';
  }
}
