import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ApprovalStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { AuthUser } from '../../common/types/auth-user';
import { CreateWorkflowDto, RaiseApprovalDto, UpdateWorkflowDto, WorkflowStepDto } from './dto/workflows.dto';

type WorkflowStepRecord = {
  stepNumber: number;
  approverType: string;
  approverValue: string | null;
  slaHours: number;
  autoApprove: boolean;
};

const DEFAULT_TRIGGER_EXAMPLES = [
  'employee.profile_updated',
  'leave.requested',
  'attendance.regularization_requested',
  'expense.submitted',
  'salary.changed',
  'offer.approval_requested',
  'payroll.locked',
  'asset.assigned',
  'exit.requested',
  'document.approval_requested',
  'custom.form_submitted',
];

const APPROVER_TYPES = [
  'REPORTING_MANAGER',
  'DEPARTMENT_HEAD',
  'HR_ADMIN',
  'PAYROLL_ADMIN',
  'FINANCE_ADMIN',
  'SPECIFIC_USER',
  'ROLE',
  'EMPLOYEE_GROUP',
  'API_BASED_EXTERNAL_APPROVER',
];

@Injectable()
export class WorkflowsService {
  constructor(private readonly prisma: PrismaService) {}

  async listWorkflows(tenantId: string) {
    const [workflows, approvals] = await Promise.all([
      this.prisma.workflow.findMany({
        where: { tenantId },
        include: { steps2: { orderBy: { stepNumber: 'asc' } } },
        orderBy: { name: 'asc' },
      }),
      this.prisma.approvalRequest.groupBy({
        by: ['workflowId'],
        where: { tenantId },
        _count: true,
      }),
    ]);

    return workflows.map((workflow) => ({
      ...workflow,
      pendingRequests: approvals.find((item) => item.workflowId === workflow.id)?._count ?? 0,
    }));
  }

  async getWorkflow(tenantId: string, id: string) {
    const workflow = await this.prisma.workflow.findFirst({
      where: { id, tenantId },
      include: {
        steps2: { orderBy: { stepNumber: 'asc' } },
        approvalRequests: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: {
            requester: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
            approver: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
            history: { orderBy: { createdAt: 'asc' } },
          },
        },
      },
    });
    if (!workflow) throw new NotFoundException('Workflow not found');
    return workflow;
  }

  async catalog() {
    return {
      triggerExamples: DEFAULT_TRIGGER_EXAMPLES,
      approverTypes: APPROVER_TYPES,
      finalActions: [
        'notify_requester',
        'notify_requester_and_manager',
        'create_notification',
        'trigger_webhook',
        'unlock_followup_task',
      ],
      rejectionBehaviors: ['return_to_draft', 'close_request', 'notify_requester'],
    };
  }

  async createWorkflow(tenantId: string, userId: string, dto: CreateWorkflowDto) {
    this.ensureSteps(dto.steps);
    return this.prisma.$transaction(async (tx) => {
      const workflow = await tx.workflow.create({
        data: {
          tenantId,
          name: dto.name,
          module: dto.module,
          trigger: dto.trigger,
          conditions: (dto.conditions ?? {}) as Prisma.InputJsonValue,
          steps: {
            trigger: dto.trigger,
            finalAction: dto.finalAction ?? 'notify_requester',
            rejectionBehavior: dto.rejectionBehavior ?? 'return_to_draft',
            notifications: dto.notifications ?? [],
            autoApproveRules: dto.autoApproveRules ?? [],
          } as Prisma.InputJsonValue,
          isActive: dto.isActive ?? true,
        },
      });

      await this.persistWorkflowSteps(tx, workflow.id, dto.steps);
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: userId,
          action: 'workflow.created',
          objectType: 'Workflow',
          objectId: workflow.id,
          newValue: dto as unknown as Prisma.InputJsonValue,
        },
      });
      return this.getWorkflow(tenantId, workflow.id);
    });
  }

  async updateWorkflow(tenantId: string, id: string, userId: string, dto: UpdateWorkflowDto) {
    const existing = await this.prisma.workflow.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Workflow not found');
    if (dto.steps) this.ensureSteps(dto.steps);

    return this.prisma.$transaction(async (tx) => {
      await tx.workflow.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.module !== undefined ? { module: dto.module } : {}),
          ...(dto.trigger !== undefined ? { trigger: dto.trigger } : {}),
          ...(dto.conditions !== undefined ? { conditions: dto.conditions as Prisma.InputJsonValue } : {}),
          ...(dto.finalAction !== undefined ||
          dto.rejectionBehavior !== undefined ||
          dto.notifications !== undefined ||
          dto.autoApproveRules !== undefined
            ? {
                steps: {
                  trigger: dto.trigger ?? existing.trigger,
                  finalAction: dto.finalAction ?? (existing.steps as Record<string, unknown> | null)?.finalAction ?? 'notify_requester',
                  rejectionBehavior:
                    dto.rejectionBehavior ??
                    (existing.steps as Record<string, unknown> | null)?.rejectionBehavior ??
                    'return_to_draft',
                  notifications:
                    dto.notifications ??
                    ((existing.steps as Record<string, unknown> | null)?.notifications as string[] | undefined) ??
                    [],
                  autoApproveRules:
                    dto.autoApproveRules ??
                    ((existing.steps as Record<string, unknown> | null)?.autoApproveRules as string[] | undefined) ??
                    [],
                } as Prisma.InputJsonValue,
              }
            : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });

      if (dto.steps) {
        await tx.workflowStep.deleteMany({ where: { workflowId: id } });
        await this.persistWorkflowSteps(tx, id, dto.steps);
      }

      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: userId,
          action: 'workflow.updated',
          objectType: 'Workflow',
          objectId: id,
          newValue: dto as unknown as Prisma.InputJsonValue,
        },
      });
      return this.getWorkflow(tenantId, id);
    });
  }

  async archiveWorkflow(tenantId: string, id: string, userId: string) {
    const existing = await this.prisma.workflow.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Workflow not found');
    await this.prisma.workflow.update({ where: { id }, data: { isActive: false } });
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId: userId,
        action: 'workflow.archived',
        objectType: 'Workflow',
        objectId: id,
      },
    });
    return { id, isActive: false };
  }

  async listApprovals(tenantId: string, user: AuthUser, status?: ApprovalStatus) {
    return this.prisma.approvalRequest.findMany({
      where: {
        tenantId,
        status: status ?? 'PENDING',
        ...(user.isSuperAdmin || user.roles.some((r) => ['HR Admin', 'Payroll Admin'].includes(r))
          ? {}
          : { approverId: user.employeeId ?? '__none__' }),
      },
      include: {
        requester: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
        approver: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
        workflow: { select: { id: true, name: true, module: true, trigger: true } },
        history: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async getApproval(tenantId: string, id: string) {
    const request = await this.prisma.approvalRequest.findFirst({
      where: { id, tenantId },
      include: {
        requester: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
        approver: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
        workflow: { include: { steps2: { orderBy: { stepNumber: 'asc' } } } },
        history: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!request) throw new NotFoundException('Approval request not found');
    return request;
  }

  async myRequests(user: AuthUser) {
    if (!user.employeeId) throw new ForbiddenException('No employee profile linked');
    return this.prisma.approvalRequest.findMany({
      where: { requesterId: user.employeeId },
      include: {
        workflow: { select: { id: true, name: true, module: true, trigger: true } },
        history: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async raise(
    user: AuthUser,
    data: RaiseApprovalDto,
  ) {
    if (!user.employeeId) throw new ForbiddenException('No employee profile linked');
    const workflow = data.workflowId
      ? await this.findWorkflow(user.tenantId, data.workflowId)
      : await this.prisma.workflow.findFirst({
          where: { tenantId: user.tenantId, module: data.module, isActive: true },
          include: { steps2: { orderBy: { stepNumber: 'asc' } } },
        });

    return this.prisma.$transaction(async (tx) => {
      const initial = await tx.approvalRequest.create({
        data: {
          tenantId: user.tenantId,
          workflowId: workflow?.id ?? null,
          requesterId: user.employeeId!,
          approverId: data.approverId ?? (workflow ? await this.resolveApprover(tx, user.tenantId, workflow, user.employeeId!, 1) : null),
          module: data.module,
          objectType: data.objectType,
          objectId: data.objectId,
          currentStep: 1,
          dueAt: workflow?.steps2?.[0]?.slaHours ? this.stepDueDate(workflow.steps2[0]!.slaHours) : null,
          requestData: (data.requestData ?? {}) as Prisma.InputJsonValue,
        },
      });

      await this.appendHistory(tx, {
        tenantId: user.tenantId,
        approvalRequestId: initial.id,
        stepNumber: 1,
        action: 'CREATED',
        actorId: user.userId,
        actorName: user.name ?? user.email,
        status: 'PENDING',
        metadata: { workflowId: workflow?.id ?? null },
      });

      if (workflow?.steps2?.[0]?.autoApprove) {
        return this.advanceAutoApproval(tx, user, initial.id);
      }
      return tx.approvalRequest.findUniqueOrThrow({
        where: { id: initial.id },
        include: {
          requester: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
          approver: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
          workflow: { include: { steps2: { orderBy: { stepNumber: 'asc' } } } },
          history: { orderBy: { createdAt: 'asc' } },
        },
      });
    });
  }

  async decide(user: AuthUser, id: string, decision: 'APPROVED' | 'REJECTED', comment?: string) {
    const request = await this.prisma.approvalRequest.findFirst({
      where: { id, tenantId: user.tenantId },
      include: { workflow: { include: { steps2: { orderBy: { stepNumber: 'asc' } } } } },
    });
    if (!request) throw new NotFoundException('Approval request not found');
    if (!['PENDING', 'ESCALATED'].includes(request.status)) {
      throw new BadRequestException(`Request already ${request.status.toLowerCase()}`);
    }

    return this.prisma.$transaction(async (tx) => {
      if (decision === 'REJECTED') {
        await this.appendHistory(tx, {
          tenantId: user.tenantId,
          approvalRequestId: request.id,
          stepNumber: request.currentStep,
          action: 'REJECTED',
          actorId: user.userId,
          actorName: user.name ?? user.email,
          comment: comment ?? null,
          status: 'REJECTED',
        });
        return tx.approvalRequest.update({
          where: { id },
          data: {
            status: 'REJECTED',
            resolvedAt: new Date(),
            dueAt: null,
            comments: this.appendComment(request.comments, user, decision, comment),
          },
        });
      }

      const workflow = request.workflow;
      const currentStep = workflow?.steps2?.find((step) => step.stepNumber === request.currentStep);
      if (!workflow || !currentStep) {
        await this.applyTerminalApprovalSideEffects(tx, request, user, comment);
        return tx.approvalRequest.update({
          where: { id },
          data: {
            status: 'APPROVED',
            resolvedAt: new Date(),
            dueAt: null,
            comments: this.appendComment(request.comments, user, decision, comment),
          },
        });
      }

      await this.appendHistory(tx, {
        tenantId: user.tenantId,
        approvalRequestId: request.id,
        stepNumber: request.currentStep,
        action: 'APPROVED',
        actorId: user.userId,
        actorName: user.name ?? user.email,
        comment: comment ?? null,
        status: 'APPROVED',
        metadata: { step: currentStep.approverType, approverValue: currentStep.approverValue },
      });

      const next = await this.findNextStep(tx, workflow.id, request.currentStep);
      if (next) {
        const nextApproverId = await this.resolveApprover(tx, user.tenantId, workflow, request.requesterId, next.stepNumber);
        const comments = this.appendComment(request.comments, user, decision, comment);
        const updated = await tx.approvalRequest.update({
          where: { id },
          data: {
            currentStep: next.stepNumber,
            approverId: nextApproverId,
            status: 'PENDING',
            dueAt: next.slaHours ? this.stepDueDate(next.slaHours) : null,
            comments,
          },
        });

        if (next.autoApprove) {
          return this.advanceAutoApproval(tx, user, updated.id);
        }
        return tx.approvalRequest.findUniqueOrThrow({
          where: { id: updated.id },
          include: {
            requester: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
            approver: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
            workflow: { include: { steps2: { orderBy: { stepNumber: 'asc' } } } },
            history: { orderBy: { createdAt: 'asc' } },
          },
        });
      }

      await this.applyTerminalApprovalSideEffects(tx, request, user, comment);
      return tx.approvalRequest.update({
        where: { id },
        data: {
          status: 'APPROVED',
          resolvedAt: new Date(),
          dueAt: null,
          comments: this.appendComment(request.comments, user, decision, comment),
        },
      });
    });
  }

  async runEscalations(tenantId?: string) {
    const requests = await this.prisma.approvalRequest.findMany({
      where: {
        status: 'PENDING',
        dueAt: { not: null, lt: new Date() },
        ...(tenantId ? { tenantId } : {}),
      },
      include: { workflow: true },
      take: 100,
    });

    for (const request of requests) {
      await this.prisma.$transaction(async (tx) => {
        await this.appendHistory(tx, {
          tenantId: request.tenantId,
          approvalRequestId: request.id,
          stepNumber: request.currentStep,
          action: 'ESCALATED',
          actorName: 'Workflow Engine',
          status: 'ESCALATED',
          metadata: { reason: 'SLA breach', dueAt: request.dueAt },
        });
        await tx.approvalRequest.update({
          where: { id: request.id },
          data: {
            status: 'ESCALATED',
            comments: this.appendComment(request.comments, { userId: 'system', email: 'system@peoplehub.internal', name: 'Workflow Engine' } as AuthUser, 'APPROVED', 'Escalated after SLA breach'),
          },
        });
      });
    }
    return { escalated: requests.length };
  }

  @Cron('*/15 * * * *')
  async scheduledEscalations() {
    await this.runEscalations();
  }

  async stats(tenantId: string) {
    const [byStatus, byModule, resolved, escalated] = await Promise.all([
      this.prisma.approvalRequest.groupBy({ by: ['status'], where: { tenantId }, _count: true }),
      this.prisma.approvalRequest.groupBy({
        by: ['module'],
        where: { tenantId, status: 'PENDING' },
        _count: true,
      }),
      this.prisma.approvalRequest.findMany({
        where: { tenantId, resolvedAt: { not: null } },
        select: { createdAt: true, resolvedAt: true },
        take: 100,
        orderBy: { resolvedAt: 'desc' },
      }),
      this.prisma.approvalRequest.count({ where: { tenantId, status: 'ESCALATED' } }),
    ]);
    return {
      pending: byStatus.find((b) => b.status === 'PENDING')?._count ?? 0,
      approved: byStatus.find((b) => b.status === 'APPROVED')?._count ?? 0,
      rejected: byStatus.find((b) => b.status === 'REJECTED')?._count ?? 0,
      escalated,
      pendingByModule: byModule.map((m) => ({ module: m.module, count: m._count })),
      avgApprovalHours: resolved.length
        ? Math.round(
            resolved.reduce(
              (s, r) => s + ((r.resolvedAt as Date).getTime() - r.createdAt.getTime()) / 3600000,
              0,
            ) / resolved.length,
          )
        : null,
      triggerExamples: DEFAULT_TRIGGER_EXAMPLES,
      approverTypes: APPROVER_TYPES,
    };
  }

  private ensureSteps(steps: WorkflowStepDto[]) {
    if (!steps?.length) throw new BadRequestException('At least one approval step is required');
    const numbers = steps.map((_, index) => index + 1);
    if (new Set(numbers).size !== steps.length) throw new BadRequestException('Invalid workflow steps');
  }

  private async persistWorkflowSteps(
    tx: Prisma.TransactionClient,
    workflowId: string,
    steps: WorkflowStepDto[],
  ) {
    await tx.workflowStep.createMany({
      data: steps.map((step, index) => ({
        workflowId,
        stepNumber: index + 1,
        approverType: step.approverType.toUpperCase(),
        approverValue: step.approverValue ?? null,
        slaHours: step.slaHours ?? 24,
        autoApprove: step.autoApprove ?? false,
      })),
    });
  }

  private async findWorkflow(tenantId: string, workflowId: string) {
    const workflow = await this.prisma.workflow.findFirst({
      where: { id: workflowId, tenantId },
      include: { steps2: { orderBy: { stepNumber: 'asc' } } },
    });
    if (!workflow) throw new NotFoundException('Workflow not found');
    return workflow;
  }

  private async findNextStep(
    client: Pick<Prisma.TransactionClient, 'workflowStep'>,
    workflowId: string,
    currentStepNumber: number,
  ) {
    return client.workflowStep.findFirst({
      where: { workflowId, stepNumber: currentStepNumber + 1 },
    });
  }

  private stepDueDate(slaHours: number) {
    return new Date(Date.now() + slaHours * 3600000);
  }

  private async advanceAutoApproval(tx: Prisma.TransactionClient, user: AuthUser, approvalRequestId: string) {
    const request = await tx.approvalRequest.findUnique({
      where: { id: approvalRequestId },
      include: { workflow: { include: { steps2: { orderBy: { stepNumber: 'asc' } } } } },
    });
    if (!request?.workflow) return request;

    let current = request;
    while (current) {
      const workflow = current.workflow;
      if (!workflow) break;

      const currentStep = workflow.steps2.find((step: WorkflowStepRecord) => step.stepNumber === current.currentStep);
      if (!currentStep) break;
      if (!currentStep.autoApprove) break;

      await this.appendHistory(tx, {
        tenantId: current.tenantId,
        approvalRequestId: current.id,
        stepNumber: current.currentStep,
        action: 'AUTO_APPROVED',
        actorName: 'Workflow Engine',
        status: 'APPROVED',
        metadata: { autoApprove: true, step: currentStep.stepNumber },
      });

      const next = await this.findNextStep(tx, current.workflowId!, current.currentStep);
      if (!next) {
        await this.applyTerminalApprovalSideEffects(tx, current, user, 'Auto-approved');
        await tx.approvalRequest.update({
          where: { id: current.id },
          data: {
            status: 'APPROVED',
            resolvedAt: new Date(),
            dueAt: null,
            comments: this.appendComment(current.comments, user, 'APPROVED', 'Auto-approved'),
          },
        });
        break;
      }

      const nextApproverId = await this.resolveApprover(tx, current.tenantId, workflow, current.requesterId, next.stepNumber);
      const updated = await tx.approvalRequest.update({
        where: { id: current.id },
        data: {
          currentStep: next.stepNumber,
          approverId: nextApproverId,
          status: 'PENDING',
          dueAt: next.slaHours ? this.stepDueDate(next.slaHours) : null,
          comments: this.appendComment(current.comments, user, 'APPROVED', 'Auto-approved'),
        },
      });
      current = { ...updated, workflow };
    }

    return tx.approvalRequest.findUniqueOrThrow({
      where: { id: approvalRequestId },
      include: {
        requester: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
        approver: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
        workflow: { include: { steps2: { orderBy: { stepNumber: 'asc' } } } },
        history: { orderBy: { createdAt: 'asc' } },
      },
    });
  }

  private async applyTerminalApprovalSideEffects(
    tx: Prisma.TransactionClient,
    request: { tenantId: string; objectId: string; objectType?: string; requestData: Prisma.JsonValue | null; id?: string; currentStep?: number },
    user: AuthUser,
    comment?: string,
  ) {
    if (request.objectId && request.requestData && request.objectType === 'AttendanceRegularization') {
      await this.applyAttendanceRegularization(tx, request);
    }
    await this.appendHistory(tx, {
      tenantId: request.tenantId,
      approvalRequestId: request.id ?? '',
      stepNumber: request.currentStep ?? 1,
      action: 'COMPLETED',
      actorId: user.userId,
      actorName: user.name ?? user.email,
      comment: comment ?? null,
      status: 'APPROVED',
    });
  }

  private async applyAttendanceRegularization(
    tx: Prisma.TransactionClient,
    request: { tenantId: string; objectId: string; requestData: Prisma.JsonValue | null },
  ) {
    const [employeeId, datePart] = request.objectId.split(':');
    if (!employeeId || !datePart || !request.requestData || typeof request.requestData !== 'object') {
      throw new BadRequestException('Invalid attendance regularization request data');
    }
    const data = request.requestData as Record<string, unknown>;
    const date = new Date(`${datePart}T00:00:00.000Z`);
    const punchIn = typeof data.punchIn === 'string' ? new Date(data.punchIn) : undefined;
    const punchOut = typeof data.punchOut === 'string' ? new Date(data.punchOut) : undefined;
    const reason = typeof data.reason === 'string' ? data.reason : 'Approved regularization';
    const workingMinutes =
      punchIn && punchOut ? Math.max(0, Math.round((punchOut.getTime() - punchIn.getTime()) / 60000)) : undefined;

    await tx.attendanceRecord.upsert({
      where: { employeeId_date: { employeeId, date } },
      create: {
        tenantId: request.tenantId,
        employeeId,
        date,
        status: 'PRESENT',
        punchIn,
        punchOut,
        workingMinutes,
        punchSource: 'MANUAL',
        remarks: `Regularization approved: ${reason}`,
      },
      update: {
        status: 'PRESENT',
        punchIn,
        punchOut,
        workingMinutes,
        punchSource: 'MANUAL',
        remarks: `Regularization approved: ${reason}`,
      },
    });
  }

  private async resolveApprover(
    tx: Prisma.TransactionClient,
    tenantId: string,
    workflow: { steps2: WorkflowStepRecord[] },
    requesterId: string,
    stepNumber: number,
  ) {
    const step = workflow.steps2.find((item) => item.stepNumber === stepNumber);
    if (!step) return null;
    const requester = await tx.employee.findUnique({
      where: { id: requesterId },
      include: {
        manager: { select: { id: true } },
        department: { select: { id: true, headId: true } },
      },
    });
    if (!requester) return null;

    const approverType = step.approverType.toUpperCase();
    if (approverType === 'REPORTING_MANAGER') return requester.managerId ?? null;
    if (approverType === 'DEPARTMENT_HEAD') return requester.department?.headId ?? null;
    if (approverType === 'SPECIFIC_USER') return step.approverValue ?? null;
    if (approverType === 'API_BASED_EXTERNAL_APPROVER') return null;

    const roleName =
      approverType === 'HR_ADMIN'
        ? 'HR Admin'
        : approverType === 'PAYROLL_ADMIN'
          ? 'Payroll Admin'
          : approverType === 'FINANCE_ADMIN'
            ? 'Finance Admin'
            : approverType === 'ROLE'
              ? step.approverValue ?? ''
              : '';
    if (!roleName) return step.approverValue ?? null;

    const employee = await tx.employee.findFirst({
      where: {
        tenantId,
        user: {
          userRoles: {
            some: {
              role: {
                name: roleName,
              },
            },
          },
        },
      },
      select: { id: true },
    });
    return employee?.id ?? null;
  }

  private async appendHistory(
    tx: Prisma.TransactionClient,
    data: {
      tenantId: string;
      approvalRequestId: string;
      stepNumber: number;
      action: string;
      comment?: string | null;
      actorId?: string | null;
      actorName?: string | null;
      status?: ApprovalStatus | null;
      metadata?: Record<string, unknown> | null;
    },
  ) {
    await tx.approvalRequestHistory.create({
      data: {
        tenantId: data.tenantId,
        approvalRequestId: data.approvalRequestId,
        stepNumber: data.stepNumber,
        action: data.action,
        comment: data.comment ?? null,
        actorId: data.actorId ?? null,
        actorName: data.actorName ?? null,
        status: data.status ?? null,
        metadata: (data.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  private appendComment(
    comments: Prisma.JsonValue | null,
    user: AuthUser,
    decision: 'APPROVED' | 'REJECTED',
    comment?: string,
  ) {
    return [
      ...(Array.isArray(comments) ? (comments as unknown[]) : []),
      { by: user.name ?? user.email, decision, comment: comment ?? null, at: new Date().toISOString() },
    ] as Prisma.InputJsonValue;
  }
}
