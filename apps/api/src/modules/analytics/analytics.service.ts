import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { toLabelledCsv } from '../../common/utils/csv';
import { parseAttendanceDate } from '../../common/utils/attendance-date';
import { buildWorkbook, type InfoSheet, type SheetSpec } from '../../common/utils/xlsx';
import { AttendanceService } from '../attendance/attendance.service';
import {
  buildRegisterRows,
  buildSummaryRows,
  groupRowsByMonth,
  isoDay,
  REGISTER_COLUMNS,
  SUMMARY_COLUMNS,
  type ColumnSpec,
  type ReportEmployee,
  type ReportRow,
} from './attendance-report';

/**
 * The reports the builder can produce.
 *
 * `attendance` is the per-day register; `attendanceSummary` totals the same
 * days per employee per month. Both are attendance-only: no LOP, denominator,
 * payable-day or paid/unpaid-leave figure appears in either, because those are
 * payroll policy rather than attendance fact.
 */
export type ReportKind =
  | 'employees'
  | 'attendance'
  | 'attendanceSummary'
  | 'payroll'
  | 'expenses'
  | 'tickets';

export const REPORT_KINDS: ReportKind[] = [
  'employees',
  'attendance',
  'attendanceSummary',
  'payroll',
  'expenses',
  'tickets',
];

export type ReportFormat = 'csv' | 'xlsx';

/**
 * Hard ceiling on exported rows.
 *
 * The register emits one row per employee per day, so the old 2,000 cap clipped
 * a single month of seventy people — silently, because it was a `take`. This is
 * an explicit refusal instead: a reviewer is told to narrow the range rather
 * than handed a file that quietly stops partway through a month.
 */
export const MAX_REPORT_ROWS = 50_000;

/**
 * Rows the on-screen preview is sent. The table shows the first handful; the
 * rest would be megabytes of JSON nobody renders.
 */
export const PREVIEW_ROW_LIMIT = 50;

/** Status fills for the register's Status column, as `AARRGGBB`. */
const STATUS_FILLS: Record<string, string> = {
  Present: 'FFE4F3EA',
  Late: 'FFFDF0D5',
  'Half Day': 'FFFDF0D5',
  Absent: 'FFFBE2E2',
  'Missing Punch': 'FFFBE2E2',
  'On Leave': 'FFE4EDF9',
  'Weekly Off': 'FFF0F1F2',
  Holiday: 'FFF0F1F2',
};

/** Employment statuses with no attendance to report: employment never started. */
const NEVER_STARTED_STATUSES = ['CANDIDATE', 'PREBOARDING'] as const;
/** Employment statuses whose attendance window must be closed by a relieving date. */
const ENDED_STATUSES = ['EXITED', 'INACTIVE'] as const;

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
  constructor(
    private readonly prisma: PrismaService,
    // The attendance ledger is reused rather than re-queried: the register, the
    // daily attendance screen and month finalization must not be able to
    // disagree about what an unrecorded day was.
    private readonly attendance: AttendanceService,
  ) {}

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
    report: ReportKind,
    options: AnalyticsFilters & { status?: string; includeNonWorkingDays?: boolean } = {},
  ): Promise<ReportRow[]> {
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

    if (report === 'attendance' || report === 'attendanceSummary') {
      return (await this.attendanceReport(tenantId, report, options)).rows;
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

  /**
   * The range an attendance report covers, as UTC day anchors.
   *
   * Defaults to the current month when neither bound is given: the builder used
   * to hand whatever 2,000 records fell out of an unbounded query, which is not
   * a period anyone asked for.
   */
  private attendanceRangeFor(options: AnalyticsFilters): { start: Date; endInclusive: Date } {
    const today = dateOnly(new Date());
    const parse = (value: string | undefined, field: string): Date | undefined => {
      if (!value) return undefined;
      const parsed = parseAttendanceDate(value);
      if (!parsed) throw new BadRequestException(`Invalid ${field} — use YYYY-MM-DD`);
      return parsed;
    };
    const from = parse(options.from, 'from');
    const to = parse(options.to, 'to');
    if (!from && !to) {
      return {
        start: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)),
        endInclusive: today,
      };
    }
    const start = from ?? new Date(Date.UTC(
      (to as Date).getUTCFullYear(),
      (to as Date).getUTCMonth(),
      1,
    ));
    const endInclusive = to ?? today;
    if (start > endInclusive) throw new BadRequestException('`from` must not be after `to`');
    return { start, endInclusive };
  }

  /** Whole months the range touches, used to bound the summary's row count. */
  private monthSpan(start: Date, endInclusive: Date): number {
    return (
      (endInclusive.getUTCFullYear() - start.getUTCFullYear()) * 12 +
      (endInclusive.getUTCMonth() - start.getUTCMonth()) +
      1
    );
  }

  /**
   * The employee population an attendance report covers.
   *
   * Wider than the live attendance roster on purpose: a report over a past
   * range must still show the days someone worked before they left, so employees
   * who have since exited are included and their rows are clamped by their
   * relieving date.
   *
   * Three groups are left out, each for a reason the caller is told about:
   * employment that never started (candidates, preboarding) has no attendance;
   * anyone whose window cannot overlap the range contributes nothing; and
   * someone recorded as having ended employment *without* a relieving date has
   * no closing boundary, so including them would manufacture absences through
   * to today. That last count is surfaced in the export's Report Info rather
   * than dropped silently.
   */
  private async attendanceEmployees(
    tenantId: string,
    options: AnalyticsFilters,
    start: Date,
    endInclusive: Date,
  ) {
    const scope = this.employeeScope(tenantId, options, false);
    const select = {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      locationId: true,
      joiningDate: true,
      exitDate: true,
      department: { select: { name: true } },
      location: { select: { name: true } },
    } as const;
    const joinedByRangeEnd: Prisma.EmployeeWhereInput = {
      OR: [{ joiningDate: null }, { joiningDate: { lte: endInclusive } }],
    };
    const overlapsRange: Prisma.EmployeeWhereInput[] = [
      joinedByRangeEnd,
      { OR: [{ exitDate: null }, { exitDate: { gte: start } }] },
    ];
    const [employees, endedWithoutExitDate] = await Promise.all([
      this.prisma.employee.findMany({
        where: {
          ...scope,
          status: { notIn: [...NEVER_STARTED_STATUSES] },
          AND: [...overlapsRange, { NOT: { status: { in: [...ENDED_STATUSES] }, exitDate: null } }],
        },
        select,
      }),
      // Counted against the same joining-date bound the population uses, so the
      // reported number is only those an unclosable window actually cost the
      // report — not someone who had not joined by the end of the range anyway.
      this.prisma.employee.count({
        where: {
          ...scope,
          status: { in: [...ENDED_STATUSES] },
          exitDate: null,
          AND: [joinedByRangeEnd],
        },
      }),
    ]);
    return { employees, endedWithoutExitDate };
  }

  /**
   * Builds the register or the summary from one batched ledger pass.
   *
   * The row ceiling is checked against the range's own dimensions *before* the
   * ledger is read, so an over-wide request is refused for a few hundred bytes
   * instead of after assembling tens of thousands of rows.
   */
  private async attendanceReport(
    tenantId: string,
    report: 'attendance' | 'attendanceSummary',
    options: AnalyticsFilters & { status?: string; includeNonWorkingDays?: boolean } = {},
  ): Promise<{ columns: ColumnSpec[]; rows: ReportRow[]; rowCount: number; info: InfoSheet }> {
    const { start, endInclusive } = this.attendanceRangeFor(options);
    const { employees, endedWithoutExitDate } = await this.attendanceEmployees(
      tenantId,
      options,
      start,
      endInclusive,
    );

    const dayCount =
      Math.floor((endInclusive.getTime() - start.getTime()) / 86_400_000) + 1;
    const rowsPerEmployee =
      report === 'attendance' ? dayCount : this.monthSpan(start, endInclusive);
    const projected = employees.length * rowsPerEmployee;
    if (projected > MAX_REPORT_ROWS) {
      throw new BadRequestException(
        `This range would export about ${projected.toLocaleString('en-IN')} rows, over the ` +
          `${MAX_REPORT_ROWS.toLocaleString('en-IN')} row limit. Narrow the date range or ` +
          'filter by department, location or legal entity.',
      );
    }

    const ledger = await this.attendance.rangeLedger(
      tenantId,
      employees.map((employee) => ({
        id: employee.id,
        locationId: employee.locationId,
        joiningDate: employee.joiningDate,
        exitDate: employee.exitDate,
      })),
      start,
      endInclusive,
    );

    const reportEmployees: ReportEmployee[] = employees.map((employee) => ({
      id: employee.id,
      employeeCode: employee.employeeCode,
      firstName: employee.firstName,
      lastName: employee.lastName,
      departmentName: employee.department?.name ?? null,
      locationName: employee.location?.name ?? null,
      joiningDate: employee.joiningDate,
      exitDate: employee.exitDate,
    }));

    const rows =
      report === 'attendance'
        ? buildRegisterRows(reportEmployees, ledger, {
            includeNonWorkingDays: options.includeNonWorkingDays ?? true,
          })
        : buildSummaryRows(reportEmployees, ledger);

    const columns = report === 'attendance' ? REGISTER_COLUMNS : SUMMARY_COLUMNS;
    return {
      columns,
      rows,
      rowCount: rows.length,
      info: this.attendanceInfoSheet({
        report,
        start,
        endInclusive,
        options,
        employeeCount: employees.length,
        rowCount: rows.length,
        endedWithoutExitDate,
      }),
    };
  }

  /** Records how an attendance export was produced, as its own worksheet. */
  private attendanceInfoSheet(input: {
    report: 'attendance' | 'attendanceSummary';
    start: Date;
    endInclusive: Date;
    options: AnalyticsFilters & { status?: string; includeNonWorkingDays?: boolean };
    employeeCount: number;
    rowCount: number;
    endedWithoutExitDate: number;
  }): InfoSheet {
    const { options } = input;
    const filters: string[] = [];
    if (options.departmentId) filters.push(`Department: ${options.departmentId}`);
    if (options.locationId) filters.push(`Location: ${options.locationId}`);
    if (options.legalEntityId) filters.push(`Legal entity: ${options.legalEntityId}`);
    if (options.managerId) filters.push(`Manager: ${options.managerId}`);
    if (options.employmentType) filters.push(`Employment type: ${options.employmentType}`);
    const entries: Array<[string, string]> = [
      ['Report', input.report === 'attendance' ? 'Attendance — Monthly Register' : 'Attendance Summary'],
      ['Period', `${isoDay(input.start)} to ${isoDay(input.endInclusive)}`],
      ['Generated at', new Date().toISOString()],
      ['Employees', String(input.employeeCount)],
      ['Rows', String(input.rowCount)],
      ['Filters', filters.length ? filters.join('\n') : 'None'],
    ];
    if (input.report === 'attendance') {
      entries.push([
        'Weekly offs & holidays',
        (options.includeNonWorkingDays ?? true) ? 'Included' : 'Excluded',
      ]);
    }
    if (input.endedWithoutExitDate) {
      entries.push([
        'Excluded employees',
        `${input.endedWithoutExitDate} employee(s) are marked as having ended employment but ` +
          'have no relieving date, so their attendance window cannot be closed. Set a ' +
          'relieving date to include them.',
      ]);
    }
    entries.push([
      'Basis',
      'Attendance only. Days with no attendance record are derived with the same ' +
        'precedence the attendance screen uses: approved leave, then holiday, then weekly ' +
        'off, then absent. Days before joining, after relieving and after today are omitted. ' +
        'No payroll figure (LOP, payable days, denominator) is computed here; ' +
        '"Unfinalized Days" is the portion payroll would not yet count.',
    ]);
    return { name: 'Report Info', title: 'Attendance export', entries };
  }

  /**
   * One report as labelled columns plus rows — what both the on-screen preview
   * and the file exports read, so they cannot drift apart.
   *
   * Reports that predate the labelled column set derive their headers from
   * their row keys, which keeps them working unchanged while still giving the
   * preview something readable to render.
   *
   * `previewLimit` truncates the returned rows while `rowCount` keeps reporting
   * the full total. The register is one row per employee per day, so a
   * two-month export runs to thousands of rows; shipping all of them as JSON to
   * render a ten-row preview would send megabytes on every filter change. The
   * export path passes no limit and gets everything.
   */
  async reportTable(
    tenantId: string,
    report: ReportKind,
    options: AnalyticsFilters & { status?: string; includeNonWorkingDays?: boolean } = {},
    previewLimit?: number,
  ): Promise<{ columns: ColumnSpec[]; rows: ReportRow[]; rowCount: number; info?: InfoSheet }> {
    const table =
      report === 'attendance' || report === 'attendanceSummary'
        ? await this.attendanceReport(tenantId, report, options)
        : await (async () => {
            const rows = await this.reportBuilder(tenantId, report, options);
            return { columns: derivedColumns(rows), rows, rowCount: rows.length, info: undefined };
          })();
    if (previewLimit !== undefined && table.rows.length > previewLimit) {
      return { ...table, rows: table.rows.slice(0, previewLimit) };
    }
    return table;
  }

  async reportBuilderCsv(
    tenantId: string,
    report: ReportKind,
    options: AnalyticsFilters & { status?: string; includeNonWorkingDays?: boolean } = {},
  ) {
    const { columns, rows } = await this.reportTable(tenantId, report, options);
    return { csv: toLabelledCsv(columns, rows), filename: reportFilename(report, options, 'csv') };
  }

  /**
   * An attendance export as a styled workbook.
   *
   * The register gets one worksheet per month when the range spans more than
   * one, plus a combined sheet, because a reviewer works a month at a time even
   * when they asked for two. Identity columns are frozen and rows band per
   * employee, so a six-thousand-row register stays navigable.
   */
  async reportBuilderWorkbook(
    tenantId: string,
    report: ReportKind,
    options: AnalyticsFilters & { status?: string; includeNonWorkingDays?: boolean } = {},
  ) {
    const { columns, rows, info } = await this.reportTable(tenantId, report, options);
    const sheets: SheetSpec[] = [];

    if (report === 'attendance') {
      const months = groupRowsByMonth(rows);
      const base = {
        columns,
        // Month, Date, Day, Employee Code, Employee Name.
        frozenColumns: 5,
        bandByKey: 'employeeCode',
        statusKey: 'status',
        statusFills: STATUS_FILLS,
      };
      if (months.length > 1) {
        sheets.push({ name: 'All Months', rows, ...base });
        for (const month of months) sheets.push({ name: month.label, rows: month.rows, ...base });
      } else {
        sheets.push({ name: months[0]?.label ?? 'Register', rows, ...base });
      }
    } else if (report === 'attendanceSummary') {
      sheets.push({
        name: 'Attendance Summary',
        columns,
        rows,
        // Month, Employee Code, Employee Name.
        frozenColumns: 3,
        bandByKey: 'employeeCode',
      });
    } else {
      sheets.push({ name: titleForReport(report), columns, rows, frozenColumns: 1 });
    }

    return {
      buffer: await buildWorkbook(sheets, info),
      filename: reportFilename(report, options, 'xlsx'),
    };
  }
}

/** Headers for the reports that predate labelled columns: `workEmail` -> `Work Email`. */
function derivedColumns(rows: ReportRow[]): ColumnSpec[] {
  if (!rows.length) return [];
  return Object.keys(rows[0]).map((key) => ({
    key,
    label: key
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/^./, (character) => character.toUpperCase()),
    width: 18,
    numeric: typeof rows[0][key] === 'number',
  }));
}

const REPORT_TITLES: Record<ReportKind, string> = {
  employees: 'Employees',
  attendance: 'Attendance Register',
  attendanceSummary: 'Attendance Summary',
  payroll: 'Payroll',
  expenses: 'Expenses',
  tickets: 'Tickets',
};

function titleForReport(report: ReportKind): string {
  return REPORT_TITLES[report] ?? 'Report';
}

/**
 * Export filename, carrying the period so a downloaded file still says what it
 * covers. The period is the only metadata in a CSV: a preamble above the header
 * would break every parser that opens it.
 */
function reportFilename(
  report: ReportKind,
  options: AnalyticsFilters,
  extension: 'csv' | 'xlsx',
): string {
  const slug = report === 'attendance' ? 'attendance-register' : kebab(report);
  const period = options.from || options.to
    ? `_${options.from ?? 'start'}_to_${options.to ?? 'today'}`
    : '';
  return `${slug}${period}.${extension}`;
}

function kebab(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}
