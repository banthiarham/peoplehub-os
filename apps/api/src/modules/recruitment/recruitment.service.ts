import { Injectable, NotFoundException } from '@nestjs/common';
import { CandidateStage, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import {
  CreateCandidateDto,
  CreateJobDto,
  CreateOfferDto,
  ListCandidatesDto,
  PublicApplicationDto,
  ScheduleInterviewDto,
  SubmitInterviewScorecardDto,
  UpdateCandidateDto,
  UpdateInterviewDto,
  UpdateJobDto,
  UpdateOfferDto,
} from './dto/recruitment.dto';

const PIPELINE_STAGES: CandidateStage[] = [
  'APPLIED',
  'SCREENING',
  'RECRUITER_CALL',
  'TECHNICAL_ROUND',
  'MANAGER_ROUND',
  'HR_ROUND',
  'OFFER_APPROVAL',
  'OFFER_SENT',
  'OFFER_ACCEPTED',
  'JOINED',
];

@Injectable()
export class RecruitmentService {
  constructor(private readonly prisma: PrismaService) {}

  async listJobs(tenantId: string, status?: string) {
    const jobs = await this.prisma.jobRequisition.findMany({
      where: { tenantId, ...(status && { status }) },
      include: { _count: { select: { candidates: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const stageCounts = await this.prisma.candidate.groupBy({
      by: ['jobRequisitionId', 'currentStage'],
      where: { tenantId },
      _count: true,
    });
    return jobs.map((j) => ({
      ...j,
      candidateCount: j._count.candidates,
      stages: stageCounts
        .filter((s) => s.jobRequisitionId === j.id)
        .map((s) => ({ stage: s.currentStage, count: s._count })),
    }));
  }

  async createJob(tenantId: string, dto: CreateJobDto, userId: string) {
    return this.prisma.jobRequisition.create({
      data: { ...dto, tenantId, status: dto.status ?? 'OPEN', createdById: userId },
    });
  }

  async updateJob(tenantId: string, id: string, dto: UpdateJobDto) {
    const job = await this.prisma.jobRequisition.findFirst({ where: { id, tenantId } });
    if (!job) throw new NotFoundException('Job not found');
    return this.prisma.jobRequisition.update({ where: { id }, data: dto });
  }

  async publicJobs(tenantSlug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
      select: { id: true, name: true, slug: true, logoUrl: true, brandColor: true },
    });
    if (!tenant) throw new NotFoundException('Career site not found');
    const jobs = await this.prisma.jobRequisition.findMany({
      where: { tenantId: tenant.id, status: 'OPEN' },
      select: {
        id: true,
        title: true,
        openings: true,
        jobDescription: true,
        requirements: true,
        type: true,
        locationId: true,
        departmentId: true,
        designationId: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return { tenant, jobs };
  }

  async publicApply(tenantSlug: string, jobId: string, dto: PublicApplicationDto) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
      select: { id: true },
    });
    if (!tenant) throw new NotFoundException('Career site not found');
    const job = await this.prisma.jobRequisition.findFirst({
      where: { id: jobId, tenantId: tenant.id, status: 'OPEN' },
      select: { id: true },
    });
    if (!job) throw new NotFoundException('Open role not found');
    return this.prisma.candidate.create({
      data: {
        tenantId: tenant.id,
        jobRequisitionId: job.id,
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phone: dto.phone,
        resumeKey: dto.resumeKey,
        expectedCTC: dto.expectedCTC,
        notes: dto.notes,
        source: 'CAREERS_PAGE',
        tags: ['public-application'],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        currentStage: true,
        createdAt: true,
      },
    });
  }

  async pipeline(tenantId: string, jobId?: string) {
    const candidates = await this.prisma.candidate.findMany({
      where: { tenantId, ...(jobId && { jobRequisitionId: jobId }) },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        currentStage: true,
        source: true,
        expectedCTC: true,
        createdAt: true,
        jobRequisition: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return PIPELINE_STAGES.map((stage) => ({
      stage,
      count: candidates.filter((c) => c.currentStage === stage).length,
      candidates: candidates.filter((c) => c.currentStage === stage),
    }));
  }

  async listCandidates(tenantId: string, q: ListCandidatesDto) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const where: Prisma.CandidateWhereInput = {
      tenantId,
      ...(q.jobId && { jobRequisitionId: q.jobId }),
      ...(q.stage && { currentStage: q.stage }),
      ...(q.search && {
        OR: [
          { firstName: { contains: q.search, mode: 'insensitive' as const } },
          { lastName: { contains: q.search, mode: 'insensitive' as const } },
          { email: { contains: q.search, mode: 'insensitive' as const } },
        ],
      }),
    };
    const [data, total] = await Promise.all([
      this.prisma.candidate.findMany({
        where,
        include: { jobRequisition: { select: { id: true, title: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.candidate.count({ where }),
    ]);
    return { data, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }

  async getCandidate(tenantId: string, id: string) {
    const candidate = await this.prisma.candidate.findFirst({
      where: { id, tenantId },
      include: {
        jobRequisition: { select: { id: true, title: true } },
        interviews: { orderBy: { scheduledAt: 'desc' } },
        offers: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!candidate) throw new NotFoundException('Candidate not found');
    return candidate;
  }

  async createCandidate(tenantId: string, dto: CreateCandidateDto) {
    const job = await this.prisma.jobRequisition.findFirst({
      where: { id: dto.jobRequisitionId, tenantId },
    });
    if (!job) throw new NotFoundException('Job requisition not found');
    return this.prisma.candidate.create({ data: { ...dto, tenantId } });
  }

  async updateCandidate(tenantId: string, id: string, dto: UpdateCandidateDto) {
    await this.getCandidate(tenantId, id);
    return this.prisma.candidate.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.currentStage === 'JOINED' && { isConverted: true }),
      },
    });
  }

  async listInterviews(tenantId: string, from?: string, to?: string) {
    return this.prisma.interview.findMany({
      where: {
        tenantId,
        ...(from || to
          ? {
              scheduledAt: {
                ...(from && { gte: new Date(from) }),
                ...(to && { lte: new Date(to) }),
              },
            }
          : {}),
      },
      include: {
        candidate: { select: { id: true, firstName: true, lastName: true, currentStage: true } },
        jobRequisition: { select: { id: true, title: true } },
      },
      orderBy: { scheduledAt: 'asc' },
    });
  }

  async scheduleInterview(tenantId: string, dto: ScheduleInterviewDto) {
    const candidate = await this.getCandidate(tenantId, dto.candidateId);
    return this.prisma.interview.create({
      data: {
        tenantId,
        candidateId: dto.candidateId,
        jobRequisitionId: candidate.jobRequisition.id,
        stage: dto.stage,
        scheduledAt: new Date(dto.scheduledAt),
        interviewers: dto.interviewers ?? [],
        mode: dto.mode ?? 'VIDEO',
      },
    });
  }

  async updateInterview(tenantId: string, id: string, dto: UpdateInterviewDto) {
    const interview = await this.prisma.interview.findFirst({ where: { id, tenantId } });
    if (!interview) throw new NotFoundException('Interview not found');
    return this.prisma.interview.update({
      where: { id },
      data: {
        ...(dto.scheduledAt && { scheduledAt: new Date(dto.scheduledAt) }),
        ...(dto.feedback !== undefined && { feedback: dto.feedback }),
        ...(dto.rating !== undefined && { rating: dto.rating }),
        ...(dto.result !== undefined && { result: dto.result }),
      },
    });
  }

  async submitInterviewScorecard(tenantId: string, id: string, dto: SubmitInterviewScorecardDto) {
    const interview = await this.prisma.interview.findFirst({ where: { id, tenantId } });
    if (!interview) throw new NotFoundException('Interview not found');
    const totalWeight = dto.competencies.reduce((sum, item) => sum + (item.weight ?? 1), 0) || 1;
    const weightedRating = dto.competencies.reduce(
      (sum, item) => sum + item.rating * (item.weight ?? 1),
      0,
    ) / totalWeight;
    const rating = Math.max(1, Math.min(5, Math.round(weightedRating)));
    const recommendation = dto.recommendation ?? (rating >= 4 ? 'HIRE' : rating <= 2 ? 'NO_HIRE' : 'HOLD');
    const result = recommendation === 'NO_HIRE' ? 'FAIL' : recommendation === 'HOLD' ? 'ON_HOLD' : 'PASS';
    return this.prisma.interview.update({
      where: { id },
      data: {
        scorecard: {
          competencies: dto.competencies,
          strengths: dto.strengths ?? '',
          concerns: dto.concerns ?? '',
          recommendation,
          weightedRating: Math.round(weightedRating * 10) / 10,
          metadata: dto.metadata ?? {},
          submittedAt: new Date().toISOString(),
        } as unknown as Prisma.InputJsonValue,
        feedback: dto.feedback ?? dto.strengths ?? interview.feedback,
        rating,
        result,
      },
      include: {
        candidate: { select: { id: true, firstName: true, lastName: true, currentStage: true } },
        jobRequisition: { select: { id: true, title: true } },
      },
    });
  }

  async createOffer(tenantId: string, dto: CreateOfferDto) {
    await this.getCandidate(tenantId, dto.candidateId);
    const offer = await this.prisma.offer.create({
      data: {
        tenantId,
        candidateId: dto.candidateId,
        ctc: dto.ctc,
        joiningDate: new Date(dto.joiningDate),
        designation: dto.designation,
        status: 'SENT',
      },
    });
    await this.prisma.candidate.update({
      where: { id: dto.candidateId },
      data: { currentStage: 'OFFER_SENT' },
    });
    return offer;
  }

  async updateOffer(tenantId: string, id: string, dto: UpdateOfferDto) {
    const offer = await this.prisma.offer.findFirst({ where: { id, tenantId } });
    if (!offer) throw new NotFoundException('Offer not found');
    const updated = await this.prisma.offer.update({ where: { id }, data: { status: dto.status } });
    if (dto.status === 'ACCEPTED') {
      await this.prisma.candidate.update({
        where: { id: offer.candidateId },
        data: { currentStage: 'OFFER_ACCEPTED' },
      });
    }
    return updated;
  }

  async stats(tenantId: string) {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const [openJobs, totalCandidates, interviewsThisWeek, offersPending, byStage, bySource, joined] =
      await Promise.all([
        this.prisma.jobRequisition.count({ where: { tenantId, status: 'OPEN' } }),
        this.prisma.candidate.count({ where: { tenantId } }),
        this.prisma.interview.count({
          where: { tenantId, scheduledAt: { gte: weekStart, lt: weekEnd } },
        }),
        this.prisma.offer.count({ where: { tenantId, status: { in: ['DRAFT', 'SENT'] } } }),
        this.prisma.candidate.groupBy({ by: ['currentStage'], where: { tenantId }, _count: true }),
        this.prisma.candidate.groupBy({ by: ['source'], where: { tenantId }, _count: true }),
        this.prisma.candidate.findMany({
          where: { tenantId, currentStage: 'JOINED' },
          select: { createdAt: true, updatedAt: true },
        }),
      ]);

    const timeToHireAvgDays = joined.length
      ? Math.round(
          joined.reduce(
            (s, c) => s + (c.updatedAt.getTime() - c.createdAt.getTime()) / 86400000,
            0,
          ) / joined.length,
        )
      : null;

    return {
      openJobs,
      totalCandidates,
      interviewsThisWeek,
      offersPending,
      pipelineFunnel: PIPELINE_STAGES.map((stage) => ({
        stage,
        count: byStage.find((b) => b.currentStage === stage)?._count ?? 0,
      })),
      sourceBreakdown: bySource.map((s) => ({ source: s.source ?? 'Other', count: s._count })),
      timeToHireAvgDays,
    };
  }
}
