import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { AuthUser } from '../../common/types/auth-user';
import {
  ApplyLeaveDto,
  DecideLeaveDto,
  ListLeaveDto,
  UpsertLeavePolicyDto,
  UpsertLeaveTypeDto,
} from './dto/leave.dto';

function dateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

@Injectable()
export class LeaveService {
  constructor(private readonly prisma: PrismaService) {}

  private requireEmployee(user: AuthUser): string {
    if (!user.employeeId) throw new ForbiddenException('No employee profile linked to this user');
    return user.employeeId;
  }

  async types(tenantId: string) {
    return this.prisma.leaveType.findMany({ where: { tenantId, isActive: true } });
  }

  async createType(tenantId: string, dto: UpsertLeaveTypeDto) {
    return this.prisma.leaveType.create({
      data: { ...dto, tenantId, code: dto.code.trim().toUpperCase() },
    });
  }

  async updateType(tenantId: string, id: string, dto: UpsertLeaveTypeDto) {
    const type = await this.prisma.leaveType.findFirst({ where: { id, tenantId } });
    if (!type) throw new NotFoundException('Leave type not found');
    return this.prisma.leaveType.update({
      where: { id },
      data: { ...dto, code: dto.code?.trim().toUpperCase() },
    });
  }

  async policies(tenantId: string) {
    return this.prisma.leavePolicy.findMany({
      where: { tenantId },
      include: {
        leaveType: { select: { id: true, name: true, code: true, isPaid: true } },
        location: { select: { id: true, name: true, city: true } },
      },
      orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async createPolicy(tenantId: string, dto: UpsertLeavePolicyDto) {
    await this.ensureLeaveType(tenantId, dto.leaveTypeId);
    return this.prisma.leavePolicy.create({ data: { ...dto, tenantId } });
  }

  async updatePolicy(tenantId: string, id: string, dto: UpsertLeavePolicyDto) {
    const policy = await this.prisma.leavePolicy.findFirst({ where: { id, tenantId } });
    if (!policy) throw new NotFoundException('Leave policy not found');
    await this.ensureLeaveType(tenantId, dto.leaveTypeId);
    return this.prisma.leavePolicy.update({ where: { id }, data: dto });
  }

  private async ensureLeaveType(tenantId: string, leaveTypeId: string) {
    const leaveType = await this.prisma.leaveType.findFirst({ where: { id: leaveTypeId, tenantId } });
    if (!leaveType) throw new NotFoundException('Leave type not found');
    return leaveType;
  }

  async balances(tenantId: string, employeeId: string) {
    const year = new Date().getFullYear();
    return this.prisma.leaveBalance.findMany({
      where: { employee: { tenantId }, employeeId, year },
      include: { leaveType: { select: { id: true, name: true, code: true, isPaid: true } } },
    });
  }

  private async currentShiftAt(tenantId: string, employeeId: string, at: Date) {
    const assignment = await this.prisma.shiftAssignment.findFirst({
      where: {
        employeeId,
        effectiveFrom: { lte: at },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: at } }],
      },
      include: { shift: true },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (assignment) return assignment.shift;
    return this.prisma.shift.findFirst({ where: { tenantId, isActive: true } });
  }

  private async isWeeklyOffAt(tenantId: string, employeeId: string, at: Date) {
    const shift = await this.currentShiftAt(tenantId, employeeId, at);
    const dayOfWeek = at.getUTCDay();
    return shift?.weeklyOffDays.includes(dayOfWeek) ?? (dayOfWeek === 0 || dayOfWeek === 6);
  }

  private async workingDays(
    tenantId: string,
    employeeId: string,
    from: Date,
    to: Date,
    includeWeekends = false,
  ): Promise<number> {
    const holidays = await this.prisma.holiday.findMany({
      where: { holidayCalendar: { tenantId }, date: { gte: from, lte: to } },
      select: { date: true },
    });
    const holidaySet = new Set(holidays.map((h) => h.date.toISOString().slice(0, 10)));
    let days = 0;
    for (let d = new Date(from); d <= to; d.setUTCDate(d.getUTCDate() + 1)) {
      if (!includeWeekends && (await this.isWeeklyOffAt(tenantId, employeeId, new Date(d)))) {
        continue;
      }
      if (holidaySet.has(d.toISOString().slice(0, 10))) continue;
      days++;
    }
    return days;
  }

  private async policyFor(
    tenantId: string,
    leaveTypeId: string,
    employee: { locationId: string | null; gender: string | null; employmentType: string },
  ) {
    return this.prisma.leavePolicy.findFirst({
      where: {
        tenantId,
        leaveTypeId,
        isActive: true,
        OR: [{ locationId: employee.locationId }, { locationId: null }],
        AND: [
          {
            OR: [
              { genderRestriction: null },
              { genderRestriction: employee.gender },
            ],
          },
          {
            OR: [
              { employmentTypes: { isEmpty: true } },
              { employmentTypes: { has: employee.employmentType } },
            ],
          },
        ],
      },
      orderBy: [{ locationId: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async apply(user: AuthUser, dto: ApplyLeaveDto) {
    const employeeId = dto.employeeId ?? this.requireEmployee(user);
    const from = dateOnly(new Date(dto.fromDate));
    const to = dateOnly(new Date(dto.toDate));
    if (to < from) throw new BadRequestException('toDate must be on or after fromDate');

    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId: user.tenantId },
      select: {
        id: true,
        status: true,
        gender: true,
        employmentType: true,
        locationId: true,
        probationEndDate: true,
      },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    const leaveType = await this.ensureLeaveType(user.tenantId, dto.leaveTypeId);
    if (!leaveType) throw new NotFoundException('Leave type not found');
    const policy = await this.policyFor(user.tenantId, dto.leaveTypeId, employee);

    if ((policy?.genderRestriction ?? leaveType.genderRestriction) && (policy?.genderRestriction ?? leaveType.genderRestriction) !== employee.gender) {
      throw new BadRequestException(`${leaveType.name} is not applicable for this employee`);
    }
    if (policy?.employmentTypes.length && !policy.employmentTypes.includes(employee.employmentType)) {
      throw new BadRequestException(`${leaveType.name} is not applicable for this employment type`);
    }
    if (employee.status === 'ON_PROBATION' && policy && !policy.probationAllowed) {
      throw new BadRequestException(`${leaveType.name} is restricted during probation`);
    }
    if (employee.status === 'ON_NOTICE' && policy && !policy.noticePeriodAllowed) {
      throw new BadRequestException(`${leaveType.name} is restricted during notice period`);
    }
    if ((policy?.requiresAttachment ?? leaveType.requiresAttachment) && !dto.attachmentKey) {
      throw new BadRequestException(`${leaveType.name} requires an attachment`);
    }

    let days = await this.workingDays(
      user.tenantId,
      employeeId,
      from,
      to,
      policy?.sandwichRule ?? false,
    );
    if (dto.halfDay) {
      if (from.getTime() !== to.getTime()) {
        throw new BadRequestException('Half day requires fromDate == toDate');
      }
      if (days <= 0) {
        throw new BadRequestException('Selected range has no working days');
      }
      days = 0.5;
    }
    if (days <= 0) throw new BadRequestException('Selected range has no working days');
    const minDuration = policy?.minDuration ?? leaveType.minDuration;
    const maxDuration = policy?.maxDuration ?? leaveType.maxDuration;
    if (days < minDuration) throw new BadRequestException(`Minimum leave duration is ${minDuration} day(s)`);
    if (maxDuration != null && days > maxDuration) {
      throw new BadRequestException(`Maximum leave duration is ${maxDuration} day(s)`);
    }

    const year = from.getUTCFullYear();
    const balance = await this.prisma.leaveBalance.findUnique({
      where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId: dto.leaveTypeId, year } },
    });
    if (
      leaveType.isPaid &&
      !(policy?.allowNegativeBalance ?? leaveType.allowNegativeBalance) &&
      (balance?.balance ?? 0) < days
    ) {
      throw new BadRequestException(
        `Insufficient ${leaveType.name} balance (available: ${balance?.balance ?? 0}, requested: ${days})`,
      );
    }

    return this.prisma.leaveRequest.create({
      data: {
        tenantId: user.tenantId,
        employeeId,
        leaveTypeId: dto.leaveTypeId,
        fromDate: from,
        toDate: to,
        days,
        reason: dto.reason,
        attachmentKey: dto.attachmentKey,
        policySnapshot: policy ? (policy as unknown as Prisma.InputJsonValue) : undefined,
      },
      include: { leaveType: { select: { name: true, code: true } } },
    });
  }

  async list(tenantId: string, q: ListLeaveDto) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const where: Prisma.LeaveRequestWhereInput = {
      tenantId,
      ...(q.status && { status: q.status }),
      ...(q.employeeId && { employeeId: q.employeeId }),
      ...(q.leaveTypeId && { leaveTypeId: q.leaveTypeId }),
      ...(q.from && { toDate: { gte: new Date(q.from) } }),
      ...(q.to && { fromDate: { lte: new Date(q.to) } }),
    };
    const [data, total] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              employeeCode: true,
              department: { select: { name: true } },
            },
          },
          leaveType: { select: { id: true, name: true, code: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.leaveRequest.count({ where }),
    ]);
    return { data, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }

  async myRequests(user: AuthUser) {
    const employeeId = this.requireEmployee(user);
    return this.prisma.leaveRequest.findMany({
      where: { employeeId },
      include: { leaveType: { select: { name: true, code: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async decide(user: AuthUser, id: string, decision: 'APPROVED' | 'REJECTED', dto: DecideLeaveDto) {
    const request = await this.prisma.leaveRequest.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!request) throw new NotFoundException('Leave request not found');
    if (request.status !== 'PENDING') {
      throw new BadRequestException(`Request already ${request.status.toLowerCase()}`);
    }

    const updated = await this.prisma.leaveRequest.update({
      where: { id },
      data: { status: decision },
    });

    if (decision === 'APPROVED') {
      const year = request.fromDate.getUTCFullYear();
      await this.prisma.leaveBalance.upsert({
        where: {
          employeeId_leaveTypeId_year: {
            employeeId: request.employeeId,
            leaveTypeId: request.leaveTypeId,
            year,
          },
        },
        create: {
          employeeId: request.employeeId,
          leaveTypeId: request.leaveTypeId,
          year,
          used: request.days,
          balance: -request.days,
        },
        update: {
          used: { increment: request.days },
          balance: { decrement: request.days },
        },
      });
    }
    void dto;
    return updated;
  }

  async cancel(user: AuthUser, id: string) {
    const employeeId = this.requireEmployee(user);
    const request = await this.prisma.leaveRequest.findFirst({
      where: { id, tenantId: user.tenantId, employeeId },
    });
    if (!request) throw new NotFoundException('Leave request not found');
    if (request.status !== 'PENDING') {
      throw new BadRequestException('Only pending requests can be cancelled');
    }
    return this.prisma.leaveRequest.update({ where: { id }, data: { status: 'CANCELLED' } });
  }

  async calendar(tenantId: string, month?: string) {
    const now = new Date();
    const [y, m] = month ? month.split('-').map(Number) : [now.getFullYear(), now.getMonth() + 1];
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 0));
    const requests = await this.prisma.leaveRequest.findMany({
      where: { tenantId, status: 'APPROVED', fromDate: { lte: end }, toDate: { gte: start } },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true } },
        leaveType: { select: { name: true, code: true } },
      },
    });
    return { month: `${y}-${String(m).padStart(2, '0')}`, requests };
  }

  async stats(tenantId: string) {
    const today = dateOnly(new Date());
    const weekEnd = new Date(today);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
    const [pendingCount, onLeaveToday, upcoming, types, balances] = await Promise.all([
      this.prisma.leaveRequest.count({ where: { tenantId, status: 'PENDING' } }),
      this.prisma.leaveRequest.count({
        where: { tenantId, status: 'APPROVED', fromDate: { lte: today }, toDate: { gte: today } },
      }),
      this.prisma.leaveRequest.count({
        where: {
          tenantId,
          status: 'APPROVED',
          fromDate: { gt: today, lte: weekEnd },
        },
      }),
      this.prisma.leaveType.findMany({ where: { tenantId }, select: { id: true, name: true } }),
      this.prisma.leaveBalance.groupBy({
        by: ['leaveTypeId'],
        where: { employee: { tenantId }, year: new Date().getFullYear() },
        _sum: { used: true, balance: true },
      }),
    ]);
    const typeName = new Map(types.map((t) => [t.id, t.name]));
    return {
      pendingCount,
      onLeaveToday,
      upcomingThisWeek: upcoming,
      byType: balances.map((b) => ({
        type: typeName.get(b.leaveTypeId) ?? b.leaveTypeId,
        used: b._sum.used ?? 0,
        remaining: b._sum.balance ?? 0,
      })),
    };
  }
}
