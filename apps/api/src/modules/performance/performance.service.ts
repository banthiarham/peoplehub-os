import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ReviewCycleStatus } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { AuthUser } from '../../common/types/auth-user';
import {
  CreateCalibrationDto,
  CreateCheckInDto,
  CreateCompetencyFrameworkDto,
  CreateOneOnOneDto,
  CreatePipDto,
  CreatePromotionRecommendationDto,
  CreateReviewCycleDto,
  KeyResultDto,
  UpdateOneOnOneDto,
  UpdatePipDto,
  UpdateReviewCycleDto,
} from './dto/performance.dto';

@Injectable()
export class PerformanceService {
  constructor(private readonly prisma: PrismaService) {}

  private requireEmployee(user: AuthUser): string {
    if (!user.employeeId) throw new ForbiddenException('No employee profile linked to this user');
    return user.employeeId;
  }

  private isPeopleAdmin(user: AuthUser) {
    return user.isSuperAdmin || user.roles.some((role) => ['HR Admin', 'Tenant Owner'].includes(role));
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
    if (cycle.status !== 'ACTIVE') throw new BadRequestException('Review cycle is not active');

    const reviewee = await this.prisma.employee.findFirst({
      where: { id: data.revieweeId, tenantId: user.tenantId },
      select: { id: true, managerId: true },
    });
    if (!reviewee) throw new NotFoundException('Reviewee not found');
    if (data.reviewerType === 'SELF' && data.revieweeId !== reviewerId) {
      throw new ForbiddenException('Self review can only be submitted by the reviewee');
    }
    if (data.reviewerType === 'MANAGER' && reviewee.managerId !== reviewerId && !this.isPeopleAdmin(user)) {
      throw new ForbiddenException('Manager review can only be submitted by the reporting manager');
    }

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

  async listCheckIns(tenantId: string, employeeId?: string, goalId?: string) {
    return this.prisma.performanceCheckIn.findMany({
      where: { tenantId, ...(employeeId && { employeeId }), ...(goalId && { goalId }) },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
        manager: { select: { id: true, firstName: true, lastName: true } },
        goal: { select: { id: true, title: true, progress: true, status: true } },
      },
      orderBy: { checkInDate: 'desc' },
      take: 100,
    });
  }

  async createCheckIn(tenantId: string, data: CreateCheckInDto) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: data.employeeId, tenantId },
      select: { id: true },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    if (data.goalId) {
      const goal = await this.prisma.goal.findFirst({
        where: { id: data.goalId, tenantId, employeeId: data.employeeId },
      });
      if (!goal) throw new NotFoundException('Goal not found for employee');
    }
    const checkIn = await this.prisma.performanceCheckIn.create({
      data: {
        tenantId,
        employeeId: data.employeeId,
        managerId: data.managerId,
        goalId: data.goalId,
        checkInDate: data.checkInDate ? new Date(data.checkInDate) : new Date(),
        status: data.status ?? 'ON_TRACK',
        progress: data.progress ?? 0,
        notes: data.notes,
        blockers: data.blockers,
        nextSteps: data.nextSteps,
      },
    });
    if (data.goalId && data.progress !== undefined) {
      await this.prisma.goal.update({
        where: { id: data.goalId },
        data: {
          progress: data.progress,
          status: data.progress >= 100 ? 'COMPLETED' : data.status === 'AT_RISK' ? 'AT_RISK' : undefined,
        },
      });
    }
    return checkIn;
  }

  async listOneOnOnes(tenantId: string, employeeId?: string, managerId?: string) {
    return this.prisma.oneOnOne.findMany({
      where: { tenantId, ...(employeeId && { employeeId }), ...(managerId && { managerId }) },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
        manager: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { scheduledAt: 'desc' },
      take: 100,
    });
  }

  async createOneOnOne(tenantId: string, data: CreateOneOnOneDto) {
    await this.requireEmployees(tenantId, [data.employeeId, data.managerId]);
    return this.prisma.oneOnOne.create({
      data: {
        tenantId,
        employeeId: data.employeeId,
        managerId: data.managerId,
        scheduledAt: new Date(data.scheduledAt),
        agenda: (data.agenda ?? []) as Prisma.InputJsonValue,
      },
    });
  }

  async updateOneOnOne(tenantId: string, id: string, data: UpdateOneOnOneDto) {
    const oneOnOne = await this.prisma.oneOnOne.findFirst({ where: { id, tenantId } });
    if (!oneOnOne) throw new NotFoundException('One-on-one not found');
    return this.prisma.oneOnOne.update({
      where: { id },
      data: {
        ...(data.status && { status: data.status, ...(data.status === 'COMPLETED' && { completedAt: new Date() }) }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.actionItems !== undefined && { actionItems: data.actionItems as Prisma.InputJsonValue }),
      },
    });
  }

  async listFrameworks(tenantId: string) {
    return this.prisma.competencyFramework.findMany({
      where: { tenantId },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createFramework(tenantId: string, data: CreateCompetencyFrameworkDto) {
    return this.prisma.competencyFramework.create({
      data: {
        tenantId,
        name: data.name,
        description: data.description,
        competencies: (data.competencies ?? this.defaultCompetencies()) as Prisma.InputJsonValue,
        ratingScale: (data.ratingScale ?? this.defaultRatingScale()) as Prisma.InputJsonValue,
      },
    });
  }

  async cycleCompletion(tenantId: string, cycleId: string) {
    const cycle = await this.prisma.reviewCycle.findFirst({ where: { id: cycleId, tenantId } });
    if (!cycle) throw new NotFoundException('Review cycle not found');
    const [employees, responses] = await Promise.all([
      this.prisma.employee.findMany({
        where: { tenantId, status: { notIn: ['EXITED', 'INACTIVE'] } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeCode: true,
          managerId: true,
          department: { select: { name: true } },
        },
      }),
      this.prisma.reviewResponse.findMany({ where: { reviewCycleId: cycleId } }),
    ]);
    const responseKey = new Set(responses.map((r) => `${r.revieweeId}:${r.reviewerType}`));
    return {
      cycle: { id: cycle.id, name: cycle.name, status: cycle.status },
      employees: employees.map((employee) => {
        const required = [
          cycle.selfReview ? 'SELF' : null,
          cycle.managerReview ? 'MANAGER' : null,
          cycle.peerReview ? 'PEER' : null,
          cycle.review360 ? 'SKIP_LEVEL' : null,
        ].filter(Boolean) as string[];
        const completed = required.filter((type) => responseKey.has(`${employee.id}:${type}`));
        return {
          employee,
          required,
          completed,
          missing: required.filter((type) => !completed.includes(type)),
          completionPct: required.length ? Math.round((completed.length / required.length) * 100) : 100,
        };
      }),
    };
  }

  async ratingDistribution(tenantId: string, cycleId?: string) {
    const responses = await this.prisma.reviewResponse.findMany({
      where: {
        ...(cycleId && { reviewCycleId: cycleId }),
        reviewCycle: { tenantId },
        overallRating: { not: null },
      },
      include: { reviewee: { select: { department: { select: { name: true } } } } },
    });
    const buckets = [1, 2, 3, 4, 5].map((rating) => ({
      rating,
      count: responses.filter((response) => Math.round(response.overallRating ?? 0) === rating).length,
    }));
    const byDepartment = new Map<string, number[]>();
    for (const response of responses) {
      const key = response.reviewee.department?.name ?? 'Unassigned';
      byDepartment.set(key, [...(byDepartment.get(key) ?? []), response.overallRating ?? 0]);
    }
    return {
      totalRatings: responses.length,
      buckets,
      byDepartment: [...byDepartment.entries()].map(([department, ratings]) => ({
        department,
        count: ratings.length,
        avgRating: Math.round((ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length) * 10) / 10,
      })),
    };
  }

  async listCalibrations(tenantId: string, reviewCycleId?: string) {
    return this.prisma.performanceCalibration.findMany({
      where: { tenantId, ...(reviewCycleId && { reviewCycleId }) },
      include: {
        reviewee: { select: { firstName: true, lastName: true, employeeCode: true } },
        reviewCycle: { select: { name: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async calibrate(user: AuthUser, data: CreateCalibrationDto) {
    if (!this.isPeopleAdmin(user)) throw new ForbiddenException('Only HR admins can calibrate ratings');
    const cycle = await this.prisma.reviewCycle.findFirst({
      where: { id: data.reviewCycleId, tenantId: user.tenantId },
    });
    if (!cycle) throw new NotFoundException('Review cycle not found');
    const reviewee = await this.prisma.employee.findFirst({
      where: { id: data.revieweeId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!reviewee) throw new NotFoundException('Employee not found');
    const existing = await this.prisma.performanceCalibration.findUnique({
      where: { reviewCycleId_revieweeId: { reviewCycleId: data.reviewCycleId, revieweeId: data.revieweeId } },
    });
    const calibration = await this.prisma.performanceCalibration.upsert({
      where: { reviewCycleId_revieweeId: { reviewCycleId: data.reviewCycleId, revieweeId: data.revieweeId } },
      create: {
        tenantId: user.tenantId,
        reviewCycleId: data.reviewCycleId,
        revieweeId: data.revieweeId,
        calibratedById: user.employeeId,
        previousRating: data.previousRating,
        calibratedRating: data.calibratedRating,
        performanceBand: data.performanceBand,
        potential: data.potential,
        promotionRecommendation: data.promotionRecommendation,
        pipRecommendation: data.pipRecommendation ?? false,
        reason: data.reason,
      },
      update: {
        calibratedById: user.employeeId,
        previousRating: data.previousRating,
        calibratedRating: data.calibratedRating,
        performanceBand: data.performanceBand,
        potential: data.potential,
        promotionRecommendation: data.promotionRecommendation,
        pipRecommendation: data.pipRecommendation ?? false,
        reason: data.reason,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        actorId: user.userId,
        actorEmail: user.email,
        action: existing ? 'performance.calibration.updated' : 'performance.calibration.created',
        objectType: 'PerformanceCalibration',
        objectId: calibration.id,
        oldValue: existing ? (JSON.parse(JSON.stringify(existing)) as Prisma.InputJsonValue) : undefined,
        newValue: JSON.parse(JSON.stringify(calibration)) as Prisma.InputJsonValue,
        reason: data.reason,
      },
    });
    return calibration;
  }

  async listPromotionRecommendations(tenantId: string) {
    return this.prisma.promotionRecommendation.findMany({
      where: { tenantId },
      include: { employee: { select: { firstName: true, lastName: true, employeeCode: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createPromotionRecommendation(user: AuthUser, data: CreatePromotionRecommendationDto) {
    if (!this.isPeopleAdmin(user)) throw new ForbiddenException('Only HR admins can recommend promotions');
    await this.requireEmployees(user.tenantId, [data.employeeId]);
    return this.prisma.promotionRecommendation.create({
      data: {
        tenantId: user.tenantId,
        employeeId: data.employeeId,
        reviewCycleId: data.reviewCycleId,
        currentRole: data.currentRole,
        recommendedRole: data.recommendedRole,
        reason: data.reason,
        recommendedById: user.employeeId,
      },
    });
  }

  async listPips(tenantId: string, employeeId?: string) {
    return this.prisma.performanceImprovementPlan.findMany({
      where: { tenantId, ...(employeeId && { employeeId }) },
      include: {
        employee: { select: { firstName: true, lastName: true, employeeCode: true } },
        reviewCycle: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createPip(user: AuthUser, data: CreatePipDto) {
    if (!this.isPeopleAdmin(user)) throw new ForbiddenException('Only HR admins can create performance plans');
    await this.requireEmployees(user.tenantId, [data.employeeId]);
    return this.prisma.performanceImprovementPlan.create({
      data: {
        tenantId: user.tenantId,
        employeeId: data.employeeId,
        reviewCycleId: data.reviewCycleId,
        title: data.title,
        reason: data.reason,
        successCriteria: (data.successCriteria ?? []) as Prisma.InputJsonValue,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        createdById: user.employeeId,
      },
    });
  }

  async updatePip(tenantId: string, id: string, data: UpdatePipDto) {
    const pip = await this.prisma.performanceImprovementPlan.findFirst({ where: { id, tenantId } });
    if (!pip) throw new NotFoundException('Performance plan not found');
    return this.prisma.performanceImprovementPlan.update({
      where: { id },
      data: {
        ...(data.status && { status: data.status }),
        ...(data.status === 'CLOSED' || data.status === 'COMPLETED' ? { closedAt: new Date() } : {}),
      },
    });
  }

  async stats(tenantId: string) {
    const [activeCycle, goals, ratings, checkIns, pips] = await Promise.all([
      this.prisma.reviewCycle.findFirst({
        where: { tenantId, status: 'ACTIVE' },
        include: { _count: { select: { reviewResponses: true } } },
      }),
      this.prisma.goal.groupBy({ by: ['status'], where: { tenantId }, _count: true }),
      this.prisma.reviewResponse.aggregate({
        where: { reviewCycle: { tenantId }, overallRating: { not: null } },
        _avg: { overallRating: true },
      }),
      this.prisma.performanceCheckIn.count({ where: { tenantId } }),
      this.prisma.performanceImprovementPlan.count({ where: { tenantId, status: 'ACTIVE' } }),
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
      checkIns,
      activePips: pips,
    };
  }

  private async requireEmployees(tenantId: string, employeeIds: string[]) {
    const uniqueIds = [...new Set(employeeIds.filter(Boolean))];
    const count = await this.prisma.employee.count({ where: { tenantId, id: { in: uniqueIds } } });
    if (count !== uniqueIds.length) throw new NotFoundException('One or more employees were not found');
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

  private defaultCompetencies() {
    return [
      { id: 'delivery', name: 'Delivery', description: 'Owns commitments and ships reliable outcomes' },
      { id: 'collaboration', name: 'Collaboration', description: 'Works well across teams and communicates clearly' },
      { id: 'leadership', name: 'Leadership', description: 'Raises standards and helps others succeed' },
    ];
  }

  private defaultRatingScale() {
    return [
      { rating: 1, label: 'Needs improvement' },
      { rating: 2, label: 'Developing' },
      { rating: 3, label: 'Meets expectations' },
      { rating: 4, label: 'Exceeds expectations' },
      { rating: 5, label: 'Exceptional' },
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
