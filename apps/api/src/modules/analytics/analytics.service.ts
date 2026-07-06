import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { toCsv } from '../../common/utils/csv';

function dateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard(tenantId: string) {
    const today = dateOnly(new Date());
    const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const in14d = new Date(today);
    in14d.setUTCDate(in14d.getUTCDate() + 14);

    const results = await Promise.allSettled([
      // 0: headcount
      this.prisma.employee.groupBy({ by: ['status'], where: { tenantId }, _count: true }),
      // 1: joins this month
      this.prisma.employee.count({ where: { tenantId, joiningDate: { gte: monthStart } } }),
      // 2: exits this month
      this.prisma.employee.count({ where: { tenantId, exitDate: { gte: monthStart } } }),
      // 3: today's attendance
      this.prisma.attendanceRecord.groupBy({
        by: ['status'],
        where: { tenantId, date: today },
        _count: true,
      }),
      // 4: on leave today
      this.prisma.leaveRequest.count({
        where: { tenantId, status: 'APPROVED', fromDate: { lte: today }, toDate: { gte: today } },
      }),
      // 5: pending leave approvals
      this.prisma.leaveRequest.count({ where: { tenantId, status: 'PENDING' } }),
      // 6: pending expenses
      this.prisma.expenseClaim.count({ where: { tenantId, status: 'SUBMITTED' } }),
      // 7: payroll runs (last 6)
      this.prisma.payrollRun.findMany({
        where: { tenantId },
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
        take: 6,
        include: { entries: { select: { netPay: true } } },
      }),
      // 8: hiring
      this.prisma.jobRequisition.count({ where: { tenantId, status: 'OPEN' } }),
      // 9: candidates in play
      this.prisma.candidate.count({
        where: { tenantId, currentStage: { notIn: ['JOINED', 'REJECTED'] } },
      }),
      // 10: offers pending
      this.prisma.offer.count({ where: { tenantId, status: { in: ['DRAFT', 'SENT'] } } }),
      // 11: headcount by department
      this.prisma.employee.groupBy({
        by: ['departmentId'],
        where: { tenantId, status: { notIn: ['EXITED', 'INACTIVE'] } },
        _count: true,
      }),
      // 12: departments
      this.prisma.department.findMany({ where: { tenantId }, select: { id: true, name: true } }),
      // 13: birthdays / anniversaries pool
      this.prisma.employee.findMany({
        where: { tenantId, status: { notIn: ['EXITED', 'INACTIVE'] } },
        select: { id: true, firstName: true, lastName: true, dateOfBirth: true, joiningDate: true },
      }),
      // 14: upcoming holidays
      this.prisma.holiday.findMany({
        where: { holidayCalendar: { tenantId }, date: { gte: today } },
        orderBy: { date: 'asc' },
        take: 3,
      }),
      // 15: attendance trend last 6 months
      this.prisma.attendanceRecord.findMany({
        where: {
          tenantId,
          date: { gte: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 5, 1)) },
        },
        select: { date: true, status: true },
      }),
      // 16: open helpdesk tickets
      this.prisma.ticket.count({ where: { tenantId, status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
    ]);

    const val = <T>(i: number, fallback: T): T =>
      results[i].status === 'fulfilled'
        ? ((results[i] as PromiseFulfilledResult<T>).value ?? fallback)
        : fallback;

    const byStatus = val<Array<{ status: string; _count: number }>>(0, []);
    const active = byStatus
      .filter((b) => ['ACTIVE', 'ON_PROBATION', 'CONFIRMED', 'ON_NOTICE'].includes(b.status))
      .reduce((s, b) => s + b._count, 0);
    const total = byStatus.reduce((s, b) => s + b._count, 0);

    const attToday = val<Array<{ status: string; _count: number }>>(3, []);
    const att = (s: string) => attToday.find((a) => a.status === s)?._count ?? 0;
    const present = att('PRESENT') + att('LATE');
    const onLeaveToday = val<number>(4, 0);
    const absent = Math.max(0, active - present - onLeaveToday);

    const runs = val<Array<{ month: number; year: number; entries: Array<{ netPay: number }> }>>(7, []);

    const deptCounts = val<Array<{ departmentId: string | null; _count: number }>>(11, []);
    const deptNames = new Map(val<Array<{ id: string; name: string }>>(12, []).map((d) => [d.id, d.name]));

    const people = val<
      Array<{ id: string; firstName: string; lastName: string; dateOfBirth: Date | null; joiningDate: Date | null }>
    >(13, []);
    const inWindow = (d: Date | null): boolean => {
      if (!d) return false;
      const thisYear = new Date(Date.UTC(today.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      return thisYear >= today && thisYear <= in14d;
    };

    const attRecords = val<Array<{ date: Date; status: string }>>(15, []);
    const attByMonth = new Map<string, { attended: number; total: number }>();
    for (const r of attRecords) {
      const key = monthKey(r.date);
      const v = attByMonth.get(key) ?? { attended: 0, total: 0 };
      v.total++;
      if (['PRESENT', 'LATE'].includes(r.status)) v.attended++;
      attByMonth.set(key, v);
    }

    return {
      headcount: {
        total,
        active,
        newThisMonth: val<number>(1, 0),
        exitsThisMonth: val<number>(2, 0),
      },
      attendanceToday: {
        present: att('PRESENT'),
        late: att('LATE'),
        absent,
        onLeave: onLeaveToday,
        rate: active > 0 ? Math.round(((present + onLeaveToday) / active) * 1000) / 10 : 0,
      },
      attendanceTrend: [...attByMonth.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, v]) => ({
          month,
          rate: v.total ? Math.round((v.attended / v.total) * 1000) / 10 : 0,
        })),
      pendingApprovals: {
        leave: val<number>(5, 0),
        expenses: val<number>(6, 0),
        tickets: val<number>(16, 0),
        total: val<number>(5, 0) + val<number>(6, 0) + val<number>(16, 0),
      },
      payroll: {
        lastRunMonth: runs[0] ? `${runs[0].year}-${String(runs[0].month).padStart(2, '0')}` : null,
        lastRunNet: runs[0]
          ? Math.round(runs[0].entries.reduce((s, e) => s + e.netPay, 0))
          : 0,
        trend: runs
          .map((r) => ({
            month: `${r.year}-${String(r.month).padStart(2, '0')}`,
            amount: Math.round(r.entries.reduce((s, e) => s + e.netPay, 0)),
          }))
          .reverse(),
      },
      hiring: {
        openPositions: val<number>(8, 0),
        activeCandidates: val<number>(9, 0),
        offersPending: val<number>(10, 0),
      },
      headcountByDepartment: deptCounts.map((d) => ({
        name: (d.departmentId && deptNames.get(d.departmentId)) ?? 'Unassigned',
        value: d._count,
      })),
      upcoming: {
        birthdays: people
          .filter((p) => inWindow(p.dateOfBirth))
          .map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`, date: p.dateOfBirth }))
          .slice(0, 6),
        anniversaries: people
          .filter((p) => inWindow(p.joiningDate))
          .map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`, date: p.joiningDate }))
          .slice(0, 6),
        holidays: val<Array<{ name: string; date: Date }>>(14, []),
      },
    };
  }

  async headcountTrend(tenantId: string, months = 12) {
    const employees = await this.prisma.employee.findMany({
      where: { tenantId },
      select: { joiningDate: true, exitDate: true },
    });
    const now = new Date();
    const out: Array<{ month: string; headcount: number; joins: number; exits: number }> = [];
    for (let i = months - 1; i >= 0; i--) {
      const start = new Date(Date.UTC(now.getFullYear(), now.getMonth() - i, 1));
      const end = new Date(Date.UTC(now.getFullYear(), now.getMonth() - i + 1, 1));
      const headcount = employees.filter(
        (e) =>
          e.joiningDate &&
          e.joiningDate < end &&
          (!e.exitDate || e.exitDate >= end),
      ).length;
      const joins = employees.filter(
        (e) => e.joiningDate && e.joiningDate >= start && e.joiningDate < end,
      ).length;
      const exits = employees.filter(
        (e) => e.exitDate && e.exitDate >= start && e.exitDate < end,
      ).length;
      out.push({ month: monthKey(start), headcount, joins, exits });
    }
    return out;
  }

  async attrition(tenantId: string, months = 12) {
    const [employees, departments] = await Promise.all([
      this.prisma.employee.findMany({
        where: { tenantId },
        select: { joiningDate: true, exitDate: true, departmentId: true },
      }),
      this.prisma.department.findMany({ where: { tenantId }, select: { id: true, name: true } }),
    ]);

    const now = new Date();
    const windowStart = new Date(Date.UTC(now.getFullYear(), now.getMonth() - (months - 1), 1));
    const windowEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1));

    const monthly: Array<{ month: string; headcount: number; exits: number; attritionPct: number }> = [];
    for (let i = months - 1; i >= 0; i--) {
      const start = new Date(Date.UTC(now.getFullYear(), now.getMonth() - i, 1));
      const end = new Date(Date.UTC(now.getFullYear(), now.getMonth() - i + 1, 1));
      const headcount = employees.filter(
        (e) => e.joiningDate && e.joiningDate < start && (!e.exitDate || e.exitDate >= start),
      ).length;
      const exits = employees.filter(
        (e) => e.exitDate && e.exitDate >= start && e.exitDate < end,
      ).length;
      monthly.push({
        month: monthKey(start),
        headcount,
        exits,
        attritionPct: headcount > 0 ? Math.round((exits / headcount) * 1000) / 10 : 0,
      });
    }

    const deptNames = new Map(departments.map((d) => [d.id, d.name]));
    const exitsByDept = new Map<string, number>();
    for (const e of employees) {
      if (e.exitDate && e.exitDate >= windowStart && e.exitDate < windowEnd) {
        const name = (e.departmentId && deptNames.get(e.departmentId)) ?? 'Unassigned';
        exitsByDept.set(name, (exitsByDept.get(name) ?? 0) + 1);
      }
    }

    return {
      monthly,
      byDepartment: [...exitsByDept.entries()]
        .map(([name, exits]) => ({ name, exits }))
        .sort((a, b) => b.exits - a.exits),
    };
  }

  async demographics(tenantId: string) {
    const employees = await this.prisma.employee.findMany({
      where: { tenantId, status: { notIn: ['EXITED', 'INACTIVE'] } },
      select: {
        gender: true,
        dateOfBirth: true,
        joiningDate: true,
        location: { select: { name: true } },
      },
    });
    const now = Date.now();
    const years = (d: Date) => (now - d.getTime()) / (365.25 * 24 * 3600 * 1000);
    const bucket = (map: Map<string, number>, key: string) =>
      map.set(key, (map.get(key) ?? 0) + 1);

    const byGender = new Map<string, number>();
    const byAge = new Map<string, number>();
    const byTenure = new Map<string, number>();
    const byLocation = new Map<string, number>();
    for (const e of employees) {
      bucket(byGender, e.gender ?? 'UNSPECIFIED');
      if (e.dateOfBirth) {
        const a = years(e.dateOfBirth);
        bucket(byAge, a < 25 ? '<25' : a < 35 ? '25-34' : a < 45 ? '35-44' : a < 55 ? '45-54' : '55+');
      }
      if (e.joiningDate) {
        const t = years(e.joiningDate);
        bucket(byTenure, t < 1 ? '<1y' : t < 3 ? '1-3y' : t < 5 ? '3-5y' : '5y+');
      }
      bucket(byLocation, e.location?.name ?? 'Unassigned');
    }
    const toArr = (m: Map<string, number>) => [...m.entries()].map(([name, value]) => ({ name, value }));
    return {
      gender: toArr(byGender),
      ageBuckets: toArr(byAge),
      tenureBuckets: toArr(byTenure),
      byLocation: toArr(byLocation),
    };
  }

  async reportBuilder(
    tenantId: string,
    report: 'employees' | 'attendance' | 'payroll' | 'expenses' | 'tickets',
    options: { from?: string; to?: string; status?: string },
  ) {
    const from = options.from ? new Date(options.from) : undefined;
    const to = options.to ? new Date(options.to) : undefined;
    const dateRange = from || to ? { ...(from && { gte: from }), ...(to && { lte: to }) } : undefined;

    if (report === 'employees') {
      const rows = await this.prisma.employee.findMany({
        where: { tenantId, ...(options.status && { status: options.status as never }) },
        include: {
          department: { select: { name: true } },
          designation: { select: { name: true } },
          location: { select: { name: true } },
          manager: { select: { firstName: true, lastName: true, employeeCode: true } },
        },
        orderBy: { employeeCode: 'asc' },
        take: 1000,
      });
      return rows.map((employee) => ({
        employeeCode: employee.employeeCode,
        name: `${employee.firstName} ${employee.lastName}`,
        workEmail: employee.workEmail ?? '',
        status: employee.status,
        department: employee.department?.name ?? '',
        designation: employee.designation?.name ?? '',
        location: employee.location?.name ?? '',
        manager: employee.manager ? `${employee.manager.firstName} ${employee.manager.lastName}` : '',
        joiningDate: employee.joiningDate?.toISOString().slice(0, 10) ?? '',
      }));
    }

    if (report === 'attendance') {
      const rows = await this.prisma.attendanceRecord.findMany({
        where: { tenantId, ...(dateRange && { date: dateRange }), ...(options.status && { status: options.status as never }) },
        include: {
          employee: { select: { employeeCode: true, firstName: true, lastName: true, department: { select: { name: true } } } },
        },
        orderBy: [{ date: 'desc' }, { employeeId: 'asc' }],
        take: 2000,
      });
      return rows.map((record) => ({
        date: record.date.toISOString().slice(0, 10),
        employeeCode: record.employee.employeeCode,
        name: `${record.employee.firstName} ${record.employee.lastName}`,
        department: record.employee.department?.name ?? '',
        status: record.status,
        punchIn: record.punchIn?.toISOString() ?? '',
        punchOut: record.punchOut?.toISOString() ?? '',
        workingMinutes: record.workingMinutes ?? '',
        source: record.punchSource ?? '',
      }));
    }

    if (report === 'payroll') {
      const rows = await this.prisma.payrollRunEmployee.findMany({
        where: {
          payrollRun: {
            tenantId,
            ...(dateRange && {
              createdAt: dateRange,
            }),
          },
        },
        include: {
          payrollRun: { select: { month: true, year: true, status: true } },
          employee: { select: { employeeCode: true, firstName: true, lastName: true, department: { select: { name: true } } } },
        },
        orderBy: [{ payrollRun: { year: 'desc' } }, { payrollRun: { month: 'desc' } }],
        take: 2000,
      });
      return rows.map((entry) => ({
        period: `${entry.payrollRun.year}-${String(entry.payrollRun.month).padStart(2, '0')}`,
        payrollStatus: entry.payrollRun.status,
        employeeCode: entry.employee.employeeCode,
        name: `${entry.employee.firstName} ${entry.employee.lastName}`,
        department: entry.employee.department?.name ?? '',
        grossPay: entry.grossPay,
        totalDeductions: entry.totalDeductions,
        netPay: entry.netPay,
        lopDays: entry.lopDays,
      }));
    }

    if (report === 'expenses') {
      const rows = await this.prisma.expenseClaim.findMany({
        where: { tenantId, ...(dateRange && { createdAt: dateRange }), ...(options.status && { status: options.status as never }) },
        include: { employee: { select: { employeeCode: true, firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 2000,
      });
      return rows.map((claim) => ({
        createdAt: claim.createdAt.toISOString(),
        employeeCode: claim.employee.employeeCode,
        name: `${claim.employee.firstName} ${claim.employee.lastName}`,
        category: claim.category,
        amount: claim.amount,
        currency: claim.currency,
        status: claim.status,
        description: claim.description ?? '',
      }));
    }

    const rows = await this.prisma.ticket.findMany({
      where: { tenantId, ...(dateRange && { createdAt: dateRange }), ...(options.status && { status: options.status as never }) },
      include: { employee: { select: { employeeCode: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 2000,
    });
    return rows.map((ticket) => ({
      createdAt: ticket.createdAt.toISOString(),
      employeeCode: ticket.employee.employeeCode,
      name: `${ticket.employee.firstName} ${ticket.employee.lastName}`,
      category: ticket.category,
      priority: ticket.priority,
      status: ticket.status,
      assignedTo: ticket.assignedTo ?? '',
      subject: ticket.subject,
      resolvedAt: ticket.resolvedAt?.toISOString() ?? '',
    }));
  }

  async reportBuilderCsv(
    tenantId: string,
    report: 'employees' | 'attendance' | 'payroll' | 'expenses' | 'tickets',
    options: { from?: string; to?: string; status?: string },
  ) {
    const rows = await this.reportBuilder(tenantId, report, options);
    return { csv: toCsv(rows), filename: `${report}-report.csv` };
  }
}
