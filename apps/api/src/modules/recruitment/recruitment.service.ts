import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CandidateStage, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import {
  CandidateCommunicationDto,
  ConvertCandidateDto,
  CreateCandidateDto,
  CreateJobDto,
  CreateOfferDto,
  DecideJobApprovalDto,
  DecideOfferApprovalDto,
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
  'REJECTED',
  'ON_HOLD',
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
      data: {
        ...dto,
        tenantId,
        status: dto.status ?? 'DRAFT',
        approvalStatus: 'PENDING',
        createdById: userId,
        targetStartDate: dto.targetStartDate ? new Date(dto.targetStartDate) : undefined,
      },
    });
  }

  async updateJob(tenantId: string, id: string, dto: UpdateJobDto) {
    const job = await this.prisma.jobRequisition.findFirst({ where: { id, tenantId } });
    if (!job) throw new NotFoundException('Job not found');
    return this.prisma.jobRequisition.update({
      where: { id },
      data: {
        ...dto,
        targetStartDate: dto.targetStartDate ? new Date(dto.targetStartDate) : undefined,
      },
    });
  }

  async decideJobApproval(tenantId: string, id: string, dto: DecideJobApprovalDto, actorUserId: string) {
    const job = await this.prisma.jobRequisition.findFirst({ where: { id, tenantId } });
    if (!job) throw new NotFoundException('Job not found');
    const approved = dto.status === 'APPROVED';
    return this.prisma.jobRequisition.update({
      where: { id },
      data: {
        approvalStatus: dto.status,
        approvedById: approved ? actorUserId : null,
        approvedAt: approved ? new Date() : null,
        rejectedReason: approved ? null : dto.reason ?? 'Rejected by hiring approver',
        status: approved ? 'OPEN' : 'DRAFT',
        publishedAt: approved ? new Date() : null,
      },
    });
  }

  async publicJobs(tenantSlug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
      select: { id: true, name: true, slug: true, logoUrl: true, brandColor: true },
    });
    if (!tenant) throw new NotFoundException('Career site not found');
    const jobs = await this.prisma.jobRequisition.findMany({
      where: { tenantId: tenant.id, status: 'OPEN', approvalStatus: 'APPROVED' },
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
      where: { id: jobId, tenantId: tenant.id, status: 'OPEN', approvalStatus: 'APPROVED' },
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
        resumeFileName: dto.resumeFileName,
        resumeUploadedAt: dto.resumeKey ? new Date() : undefined,
        resumeParsed: {
          source: 'CAREERS_PAGE',
          expectedCTC: dto.expectedCTC ?? null,
          note: dto.notes ?? null,
        },
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
        resumeParsed: true,
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
        tags: true,
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
        communications: { orderBy: { sentAt: 'desc' } },
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
    return this.prisma.candidate.create({
      data: {
        ...dto,
        tenantId,
        tags: dto.tags ?? [],
        resumeUploadedAt: dto.resumeKey ? new Date() : undefined,
        resumeParsed: (dto.resumeParsed ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  async updateCandidate(tenantId: string, id: string, dto: UpdateCandidateDto) {
    const candidate = await this.getCandidate(tenantId, id);
    const stageChanged = dto.currentStage && dto.currentStage !== candidate.currentStage;
    const history = Array.isArray(candidate.stageHistory) ? candidate.stageHistory : [];
    const data: Prisma.CandidateUpdateInput = {
      ...(dto.currentStage !== undefined && { currentStage: dto.currentStage }),
      ...(dto.notes !== undefined && { notes: dto.notes }),
      ...(dto.expectedCTC !== undefined && { expectedCTC: dto.expectedCTC }),
      ...(dto.phone !== undefined && { phone: dto.phone }),
      ...(dto.tags !== undefined && { tags: dto.tags }),
      ...(dto.resumeKey !== undefined && { resumeKey: dto.resumeKey }),
      ...(dto.resumeFileName !== undefined && { resumeFileName: dto.resumeFileName }),
      ...(dto.resumeKey !== undefined && { resumeUploadedAt: dto.resumeKey ? new Date() : null }),
      ...(dto.resumeParsed !== undefined && { resumeParsed: dto.resumeParsed as Prisma.InputJsonValue }),
      ...(stageChanged && {
        stageHistory: [
          ...history,
          {
            from: candidate.currentStage,
            to: dto.currentStage,
            changedAt: new Date().toISOString(),
          },
        ] as Prisma.InputJsonValue,
      }),
    };
    return this.prisma.candidate.update({
      where: { id },
      data,
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
    const candidate = await this.getCandidate(tenantId, dto.candidateId);
    const job = await this.prisma.jobRequisition.findFirst({
      where: { id: candidate.jobRequisition.id, tenantId },
      select: { designationId: true, locationId: true },
    });
    const offer = await this.prisma.offer.create({
      data: {
        tenantId,
        candidateId: dto.candidateId,
        ctc: dto.ctc,
        fixedPay: dto.fixedPay,
        variablePay: dto.variablePay,
        joiningDate: new Date(dto.joiningDate),
        designation: dto.designation,
        designationId: dto.designationId ?? job?.designationId,
        location: dto.location,
        locationId: dto.locationId ?? job?.locationId,
        salaryStructureId: dto.salaryStructureId,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        status: 'APPROVAL_PENDING',
        approvalStatus: 'PENDING',
      },
    });
    await this.prisma.candidate.update({
      where: { id: dto.candidateId },
      data: { currentStage: 'OFFER_APPROVAL' },
    });
    return offer;
  }

  async listOffers(tenantId: string) {
    return this.prisma.offer.findMany({
      where: { tenantId },
      include: {
        candidate: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            currentStage: true,
            jobRequisition: { select: { id: true, title: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateOffer(tenantId: string, id: string, dto: UpdateOfferDto) {
    const offer = await this.prisma.offer.findFirst({ where: { id, tenantId } });
    if (!offer) throw new NotFoundException('Offer not found');
    if (dto.status === 'SENT' && offer.approvalStatus !== 'APPROVED') {
      throw new BadRequestException('Offer must be approved before it can be sent');
    }
    const updated = await this.prisma.offer.update({
      where: { id },
      data: {
        status: dto.status,
        ...(dto.status === 'SENT' && { sentAt: new Date() }),
        ...(dto.status === 'ACCEPTED' && { acceptedAt: new Date() }),
      },
    });
    if (dto.status === 'SENT') {
      await this.prisma.candidate.update({
        where: { id: offer.candidateId },
        data: { currentStage: 'OFFER_SENT' },
      });
    }
    if (dto.status === 'ACCEPTED') {
      await this.prisma.candidate.update({
        where: { id: offer.candidateId },
        data: { currentStage: 'OFFER_ACCEPTED' },
      });
    }
    return updated;
  }

  async decideOfferApproval(tenantId: string, id: string, dto: DecideOfferApprovalDto, actorUserId: string) {
    const offer = await this.prisma.offer.findFirst({ where: { id, tenantId } });
    if (!offer) throw new NotFoundException('Offer not found');
    const approved = dto.status === 'APPROVED';
    return this.prisma.offer.update({
      where: { id },
      data: {
        approvalStatus: dto.status,
        approvedById: approved ? actorUserId : null,
        approvedAt: approved ? new Date() : null,
        rejectedReason: approved ? null : dto.reason ?? 'Rejected by approver',
        status: approved ? 'DRAFT' : 'DRAFT',
      },
    });
  }

  async generateOfferLetter(tenantId: string, id: string) {
    const offer = await this.prisma.offer.findFirst({
      where: { id, tenantId },
      include: {
        candidate: {
          include: { jobRequisition: { select: { title: true } } },
        },
      },
    });
    if (!offer) throw new NotFoundException('Offer not found');
    if (offer.approvalStatus !== 'APPROVED') {
      throw new BadRequestException('Offer must be approved before generating the offer letter');
    }
    const candidateName = `${offer.candidate.firstName} ${offer.candidate.lastName}`;
    const role = offer.designation ?? offer.candidate.jobRequisition.title;
    const html = [
      `<p>Dear ${candidateName},</p>`,
      `<p>We are pleased to offer you the role of <strong>${role}</strong>.</p>`,
      `<p>Annual CTC: INR ${offer.ctc.toLocaleString('en-IN')}.</p>`,
      `<p>Joining date: ${offer.joiningDate.toISOString().slice(0, 10)}.</p>`,
      '<p>This offer is subject to company policies, background checks, and mutually agreed joining formalities.</p>',
    ].join('');
    return this.prisma.offer.update({
      where: { id },
      data: {
        letterHtml: html,
        letterKey: `offers/${tenantId}/${id}.html`,
        letterGeneratedAt: new Date(),
      },
    });
  }

  async addCommunication(tenantId: string, candidateId: string, dto: CandidateCommunicationDto, actorUserId: string) {
    await this.getCandidate(tenantId, candidateId);
    return this.prisma.candidateCommunication.create({
      data: {
        tenantId,
        candidateId,
        channel: dto.channel ?? 'EMAIL',
        subject: dto.subject,
        body: dto.body,
        sentById: actorUserId,
      },
    });
  }

  private async nextEmployeeCode(tenantId: string) {
    const count = await this.prisma.employee.count({ where: { tenantId } });
    return `VH-${String(count + 1).padStart(4, '0')}`;
  }

  async convertCandidate(tenantId: string, candidateId: string, dto: ConvertCandidateDto, actorUserId: string) {
    const candidate = await this.prisma.candidate.findFirst({
      where: { id: candidateId, tenantId },
      include: {
        jobRequisition: true,
        offers: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!candidate) throw new NotFoundException('Candidate not found');
    if (candidate.isConverted || candidate.convertedToEmployeeId) {
      throw new BadRequestException('Candidate is already converted to employee');
    }
    const acceptedOffer = candidate.offers.find((offer) => offer.status === 'ACCEPTED');
    if (!acceptedOffer && candidate.currentStage !== 'OFFER_ACCEPTED') {
      throw new BadRequestException('Candidate must accept an offer before conversion');
    }
    const duplicate = await this.prisma.employee.findFirst({
      where: {
        tenantId,
        OR: [{ workEmail: candidate.email }, { personalEmail: candidate.email }],
      },
    });
    if (duplicate) {
      throw new BadRequestException('An employee with this candidate email already exists');
    }

    const employeeCode = dto.employeeCode ?? (await this.nextEmployeeCode(tenantId));
    const employeeCodeTaken = await this.prisma.employee.findFirst({ where: { tenantId, employeeCode } });
    if (employeeCodeTaken) throw new BadRequestException('Employee code is already in use');

    return this.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.create({
        data: {
          tenantId,
          employeeCode,
          firstName: candidate.firstName,
          lastName: candidate.lastName,
          personalEmail: candidate.email,
          phone: candidate.phone,
          status: 'PREBOARDING',
          joiningDate: dto.joiningDate
            ? new Date(dto.joiningDate)
            : acceptedOffer?.joiningDate ?? undefined,
          legalEntityId: dto.legalEntityId,
          departmentId: dto.departmentId ?? candidate.jobRequisition.departmentId,
          designationId: dto.designationId ?? acceptedOffer?.designationId ?? candidate.jobRequisition.designationId,
          locationId: dto.locationId ?? acceptedOffer?.locationId ?? candidate.jobRequisition.locationId,
        },
      });
      await tx.candidate.update({
        where: { id: candidate.id },
        data: {
          currentStage: 'JOINED',
          isConverted: true,
          convertedToEmployeeId: employee.id,
          convertedAt: new Date(),
          stageHistory: [
            ...(Array.isArray(candidate.stageHistory) ? candidate.stageHistory : []),
            { from: candidate.currentStage, to: 'JOINED', changedAt: new Date().toISOString() },
          ] as Prisma.InputJsonValue,
        },
      });
      await tx.employeeLifecycleEvent.create({
        data: {
          employeeId: employee.id,
          eventType: 'CANDIDATE_CONVERTED',
          toStatus: 'PREBOARDING',
          effectiveDate: employee.joiningDate ?? new Date(),
          remarks: `Converted from candidate ${candidate.firstName} ${candidate.lastName}`,
          createdById: actorUserId,
        },
      });
      return employee;
    });
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
        this.prisma.offer.count({ where: { tenantId, approvalStatus: 'PENDING' } }),
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
