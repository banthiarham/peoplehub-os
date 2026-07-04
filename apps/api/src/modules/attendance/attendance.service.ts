import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { AuthUser } from '../../common/types/auth-user';
import {
  AssignShiftDto,
  CreateShiftDto,
  ListAttendanceDto,
  RegularizeDto,
} from './dto/attendance.dto';

function dateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

function parseMonth(month?: string): { start: Date; end: Date } {
  const now = new Date();
  const [y, m] = month
    ? month.split('-').map(Number)
    : [now.getFullYear(), now.getMonth() + 1];
  return {
    start: new Date(Date.UTC(y, m - 1, 1)),
    end: new Date(Date.UTC(y, m, 1)),
  };
}


function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  private requireEmployee(user: AuthUser): string {
    if (!user.employeeId) {
      throw new ForbiddenException('No employee profile linked to this user');
    }
    return user.employeeId;
  }

  private async currentShift(tenantId: string, employeeId: string) {
    const now = new Date();
    const assignment = await this.prisma.shiftAssignment.findFirst({
      where: {
        employeeId,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
      },
      include: { shift: true },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (assignment) return assignment.shift;
    return this.prisma.shift.findFirst({ where: { tenantId, isActive: true } });
  }

  async checkIn(user: AuthUser, geo?: { geoLat?: number; geoLng?: number }) {
    const employeeId = this.requireEmployee(user);
    const today = dateOnly(new Date());

    await this.validateGeofence(user.tenantId, employeeId, geo);
    const existing = await this.prisma.attendanceRecord.findUnique({
      where: { employeeId_date: { employeeId, date: today } },
    });
    if (existing?.punchIn) throw new BadRequestException('Already checked in today');

    const shift = await this.currentShift(user.tenantId, employeeId);
    const now = new Date();
    let status: 'PRESENT' | 'LATE' = 'PRESENT';
    if (shift) {
      const [h, m] = shift.startTime.split(':').map(Number);
      const shiftStart = new Date(now);
      shiftStart.setHours(h, m + (shift.gracePeriodMins ?? 15), 0, 0);
      if (now > shiftStart) status = 'LATE';
    }
    return this.prisma.attendanceRecord.upsert({
      where: { employeeId_date: { employeeId, date: today } },
      create: {
        tenantId: user.tenantId,
        employeeId,
        date: today,
        status,
        punchIn: now,
        punchSource: geo?.geoLat != null ? 'GPS' : 'WEB',
        geoLat: geo?.geoLat,
        geoLng: geo?.geoLng,
      },
      update: {
        punchIn: now,
        status,
        punchSource: geo?.geoLat != null ? 'GPS' : 'WEB',
        geoLat: geo?.geoLat,
        geoLng: geo?.geoLng,
      },
    });
  }


  /**
   * Enforces the office geofence when everything needed is known:
   * device coords provided, employee works from OFFICE, and their location
   * has coordinates plus an attendanceRadius configured.
   */
  private async validateGeofence(
    tenantId: string,
    employeeId: string,
    geo?: { geoLat?: number; geoLng?: number },
  ): Promise<void> {
    if (geo?.geoLat == null || geo?.geoLng == null) return;
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
      select: { workMode: true, location: true },
    });
    const loc = employee?.location;
    if (
      employee?.workMode !== 'OFFICE' ||
      !loc?.geoLat ||
      !loc?.geoLng ||
      !loc?.attendanceRadius
    ) {
      return;
    }
    const distance = haversineMeters(geo.geoLat, geo.geoLng, loc.geoLat, loc.geoLng);
    if (distance > loc.attendanceRadius) {
      const away =
        distance >= 1000 ? `${(distance / 1000).toFixed(1)}km` : `${Math.round(distance)}m`;
      throw new BadRequestException(
        `You are ${away} away from ${loc.name} — check-in is allowed within ${loc.attendanceRadius}m`,
      );
    }
  }

  async checkOut(user: AuthUser) {
    const employeeId = this.requireEmployee(user);
    const today = dateOnly(new Date());
    const record = await this.prisma.attendanceRecord.findUnique({
      where: { employeeId_date: { employeeId, date: today } },
    });
    if (!record?.punchIn) throw new BadRequestException('Check in first');
    const now = new Date();
    const workingMinutes = Math.round((now.getTime() - record.punchIn.getTime()) / 60000);
    return this.prisma.attendanceRecord.update({
      where: { id: record.id },
      data: { punchOut: now, workingMinutes },
    });
  }

  async today(tenantId: string) {
    const today = dateOnly(new Date());
    const [employees, records, onLeave] = await Promise.all([
      this.prisma.employee.findMany({
        where: { tenantId, status: { notIn: ['EXITED', 'INACTIVE', 'CANDIDATE', 'PREBOARDING'] } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeCode: true,
          department: { select: { name: true } },
        },
      }),
      this.prisma.attendanceRecord.findMany({ where: { tenantId, date: today } }),
      this.prisma.leaveRequest.findMany({
        where: { tenantId, status: 'APPROVED', fromDate: { lte: today }, toDate: { gte: today } },
        select: { employeeId: true },
      }),
    ]);
    const recordMap = new Map(records.map((r) => [r.employeeId, r]));
    const leaveSet = new Set(onLeave.map((l) => l.employeeId));

    const rows = employees.map((e) => {
      const rec = recordMap.get(e.id);
      const status = rec?.status ?? (leaveSet.has(e.id) ? 'ON_LEAVE' : 'ABSENT');
      return {
        employee: e,
        status,
        punchIn: rec?.punchIn ?? null,
        punchOut: rec?.punchOut ?? null,
        workingMinutes: rec?.workingMinutes ?? null,
        punchSource: rec?.punchSource ?? null,
      };
    });
    return {
      date: today,
      summary: {
        present: rows.filter((r) => r.status === 'PRESENT').length,
        late: rows.filter((r) => r.status === 'LATE').length,
        absent: rows.filter((r) => r.status === 'ABSENT').length,
        onLeave: rows.filter((r) => r.status === 'ON_LEAVE').length,
        total: rows.length,
      },
      rows,
    };
  }

  async list(tenantId: string, q: ListAttendanceDto) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const where: Prisma.AttendanceRecordWhereInput = {
      tenantId,
      ...(q.employeeId && { employeeId: q.employeeId }),
      ...(q.status && { status: q.status }),
      ...((q.from || q.to) && {
        date: {
          ...(q.from && { gte: new Date(q.from) }),
          ...(q.to && { lte: new Date(q.to) }),
        },
      }),
    };
    const [data, total] = await Promise.all([
      this.prisma.attendanceRecord.findMany({
        where,
        include: {
          employee: {
            select: { id: true, firstName: true, lastName: true, employeeCode: true },
          },
        },
        orderBy: { date: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.attendanceRecord.count({ where }),
    ]);
    return { data, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }

  async me(user: AuthUser, month?: string) {
    const employeeId = this.requireEmployee(user);
    const { start, end } = parseMonth(month);
    const records = await this.prisma.attendanceRecord.findMany({
      where: { employeeId, date: { gte: start, lt: end } },
      orderBy: { date: 'desc' },
    });
    const count = (s: string) => records.filter((r) => r.status === s).length;
    const worked = records.filter((r) => r.workingMinutes != null);
    return {
      records,
      summary: {
        present: count('PRESENT'),
        late: count('LATE'),
        absent: count('ABSENT'),
        onLeave: count('ON_LEAVE'),
        avgWorkHours: worked.length
          ? Math.round(
              (worked.reduce((s, r) => s + (r.workingMinutes ?? 0), 0) / worked.length / 60) * 10,
            ) / 10
          : 0,
      },
    };
  }

  async regularize(user: AuthUser, dto: RegularizeDto) {
    const employeeId = dto.employeeId ?? this.requireEmployee(user);
    const date = dateOnly(new Date(dto.date));
    return this.prisma.attendanceRecord.upsert({
      where: { employeeId_date: { employeeId, date } },
      create: {
        tenantId: user.tenantId,
        employeeId,
        date,
        status: 'PRESENT',
        punchIn: dto.punchIn ? new Date(dto.punchIn) : undefined,
        punchOut: dto.punchOut ? new Date(dto.punchOut) : undefined,
        punchSource: 'MANUAL',
        remarks: `Regularization: ${dto.reason}`,
      },
      update: {
        punchIn: dto.punchIn ? new Date(dto.punchIn) : undefined,
        punchOut: dto.punchOut ? new Date(dto.punchOut) : undefined,
        status: 'PRESENT',
        remarks: `Regularization: ${dto.reason}`,
      },
    });
  }

  async stats(tenantId: string, month?: string) {
    const { start, end } = parseMonth(month);
    const records = await this.prisma.attendanceRecord.findMany({
      where: { tenantId, date: { gte: start, lt: end } },
      select: { date: true, status: true, workingMinutes: true },
    });
    const byDay = new Map<string, { present: number; late: number; absent: number }>();
    for (const r of records) {
      const key = r.date.toISOString().slice(0, 10);
      const day = byDay.get(key) ?? { present: 0, late: 0, absent: 0 };
      if (r.status === 'PRESENT') day.present++;
      else if (r.status === 'LATE') day.late++;
      else if (r.status === 'ABSENT') day.absent++;
      byDay.set(key, day);
    }
    const attended = records.filter((r) => ['PRESENT', 'LATE'].includes(r.status)).length;
    const total = records.length || 1;
    const worked = records.filter((r) => r.workingMinutes != null);
    return {
      attendanceRate: Math.round((attended / total) * 1000) / 10,
      avgWorkHours: worked.length
        ? Math.round(
            (worked.reduce((s, r) => s + (r.workingMinutes ?? 0), 0) / worked.length / 60) * 10,
          ) / 10
        : 0,
      lateArrivals: records.filter((r) => r.status === 'LATE').length,
      trend: [...byDay.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({ date, ...v })),
    };
  }

  async listShifts(tenantId: string) {
    return this.prisma.shift.findMany({
      where: { tenantId },
      include: { _count: { select: { shiftAssignments: true } } },
    });
  }

  async createShift(tenantId: string, dto: CreateShiftDto) {
    return this.prisma.shift.create({ data: { ...dto, tenantId } });
  }

  async assignShift(tenantId: string, dto: AssignShiftDto) {
    const shift = await this.prisma.shift.findFirst({ where: { id: dto.shiftId, tenantId } });
    if (!shift) throw new NotFoundException('Shift not found');
    const effectiveFrom = dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date();
    await this.prisma.shiftAssignment.createMany({
      data: dto.employeeIds.map((employeeId) => ({ employeeId, shiftId: dto.shiftId, effectiveFrom })),
    });
    return { assigned: dto.employeeIds.length };
  }

  async holidays(tenantId: string, year?: number) {
    const y = year ?? new Date().getFullYear();
    return this.prisma.holiday.findMany({
      where: {
        holidayCalendar: { tenantId, year: y },
      },
      orderBy: { date: 'asc' },
    });
  }
}
