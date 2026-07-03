import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { AuthUser } from '../../common/types/auth-user';

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
    data: { employeeId: string; title: string; description?: string; type?: string; weightage?: number; targetDate?: string },
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
        type: data.type ?? 'INDIVIDUAL',
        weightage: data.weightage ?? 1,
        targetDate: data.targetDate ? new Date(data.targetDate) : undefined,
      },
    });
  }

  async updateGoal(
    tenantId: string,
    id: string,
    data: { progress?: number; status?: string; title?: string; description?: string },
  ) {
    const goal = await this.prisma.goal.findFirst({ where: { id, tenantId } });
    if (!goal) throw new NotFoundException('Goal not found');
    return this.prisma.goal.update({
      where: { id },
      data: {
        ...(data.progress !== undefined && { progress: data.progress }),
        ...(data.status && { status: data.status }),
        ...(data.title && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.progress !== undefined && data.progress >= 100 && { status: 'COMPLETED' }),
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
}
