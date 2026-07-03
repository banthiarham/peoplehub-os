import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { AuthUser } from '../../common/types/auth-user';
import { ApplyLeaveDto, DecideLeaveDto, ListLeaveDto } from './dto/leave.dto';

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

  async balances(tenantId: string, employeeId: string) {
    const year = new Date().getFullYear();
    return this.prisma.leaveBalance.findMany({
      where: { employee: { tenantId }, employeeId, year },
      include: { leaveType: { select: { id: true, name: true, code: true, isPaid: true } } },
    });
  }

  private async workingDays(tenantId: string, from: Date, to: Date): Promise<number> {
    const holidays = await this.prisma.holiday.findMany({
      where: { holidayCalendar: { tenantId }, date: { gte: from, lte: to } },
      select: { date: true },
    });
    const holidaySet = new Set(holidays.map((h) => h.date.toISOString().slice(0, 10)));
    let days = 0;
    for (let d = new Date(from); d <= to; d.setUTCDate(d.getUTCDate() + 1)) {
      const dow = d.getUTCDay();
      if (dow === 0 || dow === 6) continue;
      if (holidaySet.has(d.toISOString().slice(0, 10))) continue;
      days++;
    }
    return days;
  }

  async apply(user: AuthUser, dto: ApplyLeaveDto) {
    const employeeId = dto.employeeId ?? this.requireEmployee(user);
    const from = dateOnly(new Date(dto.fromDate));
    const to = dateOnly(new Date(dto.toDate));
    if (to < from) throw new BadRequestException('toDate must be on or after fromDate');

    let days = await this.workingDays(user.tenantId, from, to);
    if (dto.halfDay) {
      if (from.getTime() !== to.getTime()) {
        throw new BadRequestException('Half day requires fromDate == toDate');
      }
      days = 0.5;
    }
    if (days <= 0) throw new BadRequestException('Selected range has no working days');

    const leaveType = await this.prisma.leaveType.findFirst({
      where: { id: dto.leaveTypeId, tenantId: user.tenantId },
    });
    if (!leaveType) throw new NotFoundException('Leave type not found');

    const year = from.getUTCFullYear();
    const balance = await this.prisma.leaveBalance.findUnique({
      where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId: dto.leaveTypeId, year } },
    });
    if (
      leaveType.isPaid &&
      !leaveType.allowNegativeBalance &&
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
