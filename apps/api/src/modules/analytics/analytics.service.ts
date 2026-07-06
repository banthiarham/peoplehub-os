import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { toCsv } from '../../common/utils/csv';

export type AnalyticsFilters = {
  departmentId?: string;
  locationId?: string;
  legalEntityId?: string;
  managerId?: string;
  employmentType?: string;
  from?: string;
  to?: string;
};

function dateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function jsonStringArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return jsonStringArray(parsed);
    } catch {
      return [value];
    }
  }
  return [];
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private employeeScope(tenantId: string, filters: AnalyticsFilters = {}, activeOnly = false): Prisma.EmployeeWhereInput {
    return {
      tenantId,
      ...(activeOnly && { status: { notIn: ['EXITED', 'INACTIVE'] } }),
      ...(filters.departmentId && { departmentId: filters.departmentId }),
      ...(filters.locationId && { locationId: filters.locationId }),
      ...(filters.legalEntityId && { legalEntityId: filters.legalEntityId }),
      ...(filters.managerId && { managerId: filters.managerId }),
      ...(filters.employmentType && { employmentType: filters.employmentType as never }),
    };
  }

  private dateRange(filters: AnalyticsFilters) {
    const from = filters.from ? new Date(filters.from) : undefined;
    const to = filters.to ? new Date(filters.to) : undefined;
    return from || to ? { ...(from && { gte: from }), ...(to && { lte: to }) } : undefined;
  }

  async dashboard(tenantId: string, filters: AnalyticsFilters = {}) {
    const today = dateOnly(new Date());
    const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const in14d = new Date(today);
    in14d.setUTCDate(in14d.getUTCDate() + 14);
    const activeEmployeeWhere = this.employeeScope(tenantId, filters, true);
    const allEmployeeWhere = this.employeeScope(tenantId, filters, false);

    const results = await Promise.allSettled([
      this.prisma.employee.groupBy({ by: ['status'], where: activeEmployeeWhere, _count: true }),
      this.prisma.employee.count({ where: { ...activeEmployeeWhere, joiningDate: { gte: monthStart } } }),
      this.prisma.employee.count({ where: { ...allEmployeeWhere, exitDate: { gte: monthStart } } }),
      this.prisma.attendanceRecord.groupBy({
        by: ['status'],
        where: { tenantId, date: today, employee: { ...activeEmployeeWhere } },
        _count: true,
      }),
      this.prisma.leaveRequest.count({
        where: {
          tenantId,
          status: 'APPROVED',
          fromDate: { lte: today },
          toDate: { gte: today },
          employee: { ...activeEmployeeWhere },
        },
      }),
      this.prisma.leaveRequest.count({ where: { tenantId, status: 'PENDING', employee: { ...activeEmployeeWhere } } }),
      this.prisma.expenseClaim.count({ where: { tenantId, status: 'SUBMITTED', employee: { ...activeEmployeeWhere } } }),
      this.prisma.payrollRun.findMany({
        where: { tenantId },
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
        take: 6,
        include: {
          entries: {
            where: { employee: { ...allEmployeeWhere } },
            select: { netPay: true, grossPay: true, errors: true, warnings: true },
          },
        },
      }),
      this.prisma.jobRequisition.count({ where: { tenantId, status: 'OPEN' } }),
      this.prisma.candidate.count({
        where: { tenantId, currentStage: { notIn: ['JOINED', 'REJECTED'] } },
      }),
      this.prisma.offer.count({ where: { tenantId, status: { in: ['DRAFT', 'SENT'] } } }),
      this.prisma.employee.groupBy({
        by: ['departmentId'],
        where: { ...activeEmployeeWhere },
        _count: true,
      }),
      this.prisma.department.findMany({ where: { tenantId }, select: { id: true, name: true } }),
      this.prisma.employee.findMany({
        where: { ...activeEmployeeWhere },
        select: { id: true, firstName: true, lastName: true, dateOfBirth: true, joiningDate: true },
      }),
      this.prisma.holiday.findMany({
        where: { holidayCalendar: { tenantId }, date: { gte: today } },
        orderBy: { date: 'asc' },
        take: 3,
      }),
      this.prisma.attendanceRecord.findMany({
        where: {
          tenantId,
          date: { gte: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 5, 1)) },
          employee: { ...activeEmployeeWhere },
        },
        select: { date: true, status: true },
      }),
      this.prisma.ticket.count({ where: { tenantId, status: { in: ['OPEN', 'IN_PROGRESS'] }, employee: { ...activeEmployeeWhere } } }),
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
    const absent = att('ABSENT');
    const notMarked = Math.max(0, active - present - onLeaveToday - absent);

    const runs = val<
      Array<{
        id: string;
        month: number;
        year: number;
        status: string;
        entries: Array<{ netPay: number; grossPay: number; errors: unknown; warnings: unknown }>;
      }>
    >(7, []);

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

    const payrollRows = runs.map((r) => ({
      month: `${r.year}-${String(r.month).padStart(2, '0')}`,
      amount: Math.round(r.entries.reduce((s, e) => s + e.netPay, 0)),
      gross: Math.round(r.entries.reduce((s, e) => s + e.grossPay, 0)),
    }));
    const latestRun = runs[0];
    const latestRunEntries = latestRun?.entries ?? [];
    const topIssues = new Map<string, { label: string; count: number; severity: 'critical' | 'warning' }>();
    let payrollErrors = 0;
    let payrollWarnings = 0;
    let readyEmployees = 0;

    for (const entry of latestRunEntries) {
      const errors = jsonStringArray(entry.errors);
      const warnings = jsonStringArray(entry.warnings);
      payrollErrors += errors.length;
      payrollWarnings += warnings.length;
      if (!errors.length && !warnings.length) readyEmployees++;
      for (const message of errors) {
        const current = topIssues.get(message) ?? { label: message, count: 0, severity: 'critical' as const };
        current.count++;
        topIssues.set(message, current);
      }
      for (const message of warnings) {
        const current = topIssues.get(message) ?? { label: message, count: 0, severity: 'warning' as const };
        current.count++;
        topIssues.set(message, current);
      }
    }

    if (latestRun && !latestRunEntries.length && ['DRAFT', 'PROCESSING'].includes(latestRun.status)) {
      topIssues.set('Payroll run has not been processed', {
        label: 'Payroll run has not been processed',
        count: 1,
        severity: 'critical',
      });
    }
    if (val<number>(5, 0) > 0) {
      topIssues.set('Leave approvals pending before payroll', {
        label: 'Leave approvals pending before payroll',
        count: val<number>(5, 0),
        severity: 'warning',
      });
    }
    if (val<number>(6, 0) > 0) {
      topIssues.set('Expense reimbursements need review', {
        label: 'Expense reimbursements need review',
        count: val<number>(6, 0),
        severity: 'warning',
      });
    }

    const payrollEmployeeCount = latestRunEntries.length || active;
    const readinessRate = payrollEmployeeCount
      ? Math.round((readyEmployees / payrollEmployeeCount) * 100)
      : 0;

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
        notMarked,
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
        lastRunMonth: payrollRows[0] ? payrollRows[0].month : null,
        lastRunNet: payrollRows[0]?.amount ?? 0,
        trend: payrollRows.reverse(),
      },
      payrollReadiness: {
        period: latestRun ? `${latestRun.year}-${String(latestRun.month).padStart(2, '0')}` : null,
        status: latestRun?.status ?? 'NO_RUN',
        totalEmployees: payrollEmployeeCount,
        readyEmployees,
        criticalBlockers: payrollErrors + (latestRun && !latestRunEntries.length && ['DRAFT', 'PROCESSING'].includes(latestRun.status) ? 1 : 0),
        warnings: payrollWarnings + val<number>(5, 0) + val<number>(6, 0),
        readinessRate,
        topIssues: [...topIssues.values()]
          .sort((a, b) => {
            if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1;
            return b.count - a.count;
          })
          .slice(0, 5),
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

  async headcountTrend(tenantId: string, months = 12, filters: AnalyticsFilters = {}) {
    const employees = await this.prisma.employee.findMany({
      where: this.employeeScope(tenantId, filters, false),
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

  async attrition(tenantId: string, months = 12, filters: AnalyticsFilters = {}) {
    const [employees, departments] = await Promise.all([
      this.prisma.employee.findMany({
        where: this.employeeScope(tenantId, filters, false),
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

  async demographics(tenantId: string, filters: AnalyticsFilters = {}) {
    const employees = await this.prisma.employee.findMany({
      where: this.employeeScope(tenantId, filters, true),
      select: {
        gender: true,
        dateOfBirth: true,
        joiningDate: true,
        location: { select: { name: true } },
      },
    });
    const now = Date.now();
    const years = (d: Date) => (now - d.getTime()) / (365.25 * 24 * 3600 * 1000);
    const bucket = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);

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
    options: AnalyticsFilters & { status?: string } = {},
  ) {
    const dateRange = this.dateRange(options);
    const employeeScope = this.employeeScope(tenantId, options, false);
    const activeEmployeeScope = this.employeeScope(tenantId, options, true);

    if (report === 'employees') {
      const rows = await this.prisma.employee.findMany({
        where: { ...activeEmployeeScope, ...(options.status && { status: options.status as never }) },
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
        where: {
          tenantId,
          ...(dateRange && { date: dateRange }),
          ...(options.status && { status: options.status as never }),
          employee: { ...employeeScope },
        },
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
          employee: { ...employeeScope },
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
        where: {
          tenantId,
          ...(dateRange && { createdAt: dateRange }),
          ...(options.status && { status: options.status as never }),
          employee: { ...employeeScope },
        },
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
      where: {
        tenantId,
        ...(dateRange && { createdAt: dateRange }),
        ...(options.status && { status: options.status as never }),
        employee: { ...employeeScope },
      },
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
    options: AnalyticsFilters & { status?: string } = {},
  ) {
    const rows = await this.reportBuilder(tenantId, report, options);
    return { csv: toCsv(rows), filename: `${report}-report.csv` };
  }
}
