import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ApprovalStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { AuthUser } from '../../common/types/auth-user';

@Injectable()
export class WorkflowsService {
  constructor(private readonly prisma: PrismaService) {}

  async listWorkflows(tenantId: string) {
    return this.prisma.workflow.findMany({
      where: { tenantId },
      include: { steps2: { orderBy: { stepNumber: 'asc' } } },
      orderBy: { name: 'asc' },
    });
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
        approver: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async myRequests(user: AuthUser) {
    if (!user.employeeId) throw new ForbiddenException('No employee profile linked');
    return this.prisma.approvalRequest.findMany({
      where: { requesterId: user.employeeId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async raise(
    user: AuthUser,
    data: { module: string; objectType: string; objectId: string; requestData?: Record<string, unknown>; approverId?: string },
  ) {
    if (!user.employeeId) throw new ForbiddenException('No employee profile linked');
    return this.prisma.approvalRequest.create({
      data: {
        tenantId: user.tenantId,
        requesterId: user.employeeId,
        approverId: data.approverId,
        module: data.module,
        objectType: data.objectType,
        objectId: data.objectId,
        requestData: (data.requestData ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  async decide(user: AuthUser, id: string, decision: 'APPROVED' | 'REJECTED', comment?: string) {
    const request = await this.prisma.approvalRequest.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!request) throw new NotFoundException('Approval request not found');
    if (request.status !== 'PENDING') {
      throw new BadRequestException(`Request already ${request.status.toLowerCase()}`);
    }
    const comments = [
      ...(Array.isArray(request.comments) ? (request.comments as unknown[]) : []),
      { by: user.name ?? user.email, decision, comment: comment ?? null, at: new Date().toISOString() },
    ];
    return this.prisma.$transaction(async (tx) => {
      if (decision === 'APPROVED' && request.module === 'attendance' && request.objectType === 'AttendanceRegularization') {
        await this.applyAttendanceRegularization(tx, request);
      }
      return tx.approvalRequest.update({
        where: { id },
        data: {
          status: decision,
          resolvedAt: new Date(),
          comments: comments as Prisma.InputJsonValue,
        },
      });
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

  async stats(tenantId: string) {
    const [byStatus, byModule, resolved] = await Promise.all([
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
    ]);
    return {
      pending: byStatus.find((b) => b.status === 'PENDING')?._count ?? 0,
      approved: byStatus.find((b) => b.status === 'APPROVED')?._count ?? 0,
      rejected: byStatus.find((b) => b.status === 'REJECTED')?._count ?? 0,
      pendingByModule: byModule.map((m) => ({ module: m.module, count: m._count })),
      avgApprovalHours: resolved.length
        ? Math.round(
            resolved.reduce(
              (s, r) => s + ((r.resolvedAt as Date).getTime() - r.createdAt.getTime()) / 3600000,
              0,
            ) / resolved.length,
          )
        : null,
    };
  }
}
