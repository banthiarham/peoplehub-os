import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { AuthUser } from '../../common/types/auth-user';
import { AttendanceService } from '../attendance/attendance.service';
import { LeaveService } from '../leave/leave.service';

const SUMMARY_ROLES = ['Super Admin', 'HR Admin', 'Tenant Owner'];

/**
 * Optional explanations displayed in the Attendance & Leave Summary.
 * Keep these user-focused and avoid implementation details.
 */
const DATA_QUALITY = {
  lateSource:
    'Late arrivals are calculated based on the employee’s assigned shift and grace period.',

  halfDaySource:
    'Half-day attendance is calculated from finalized attendance records.',

  earlyDepartureSource:
    'Early departures are calculated based on the employee’s assigned shift timings.',

  holidayCalendarScope:
    'Holiday counts are based on the holidays applicable to the employee.',

  leaveDaysSource:
    'Leave Taken reflects attendance records, while Leave Balance follows your organization’s leave policy. These values may differ for half-day or multi-month leave requests.',
};

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

@Injectable()
export class EmployeeSummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attendance: AttendanceService,
    private readonly leave: LeaveService,
  ) {}

  async attendanceSummary(user: AuthUser, employeeId: string, month?: string) {
    this.assertCanViewSummary(user);
    const selectedMonth = month ?? currentMonthKey();
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId: user.tenantId },
      select: { id: true, status: true, joiningDate: true, exitDate: true },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    const ledger = await this.attendance.monthlyLedgerFor(
      user.tenantId,
      employeeId,
      selectedMonth,
      { joiningDate: employee.joiningDate, exitDate: employee.exitDate },
    );
    const [balances, monthRequests, recent] = await Promise.all([
      this.leave.balances(user.tenantId, employeeId, Number(selectedMonth.slice(0, 4))),
      this.leave.list(user.tenantId, {
        employeeId,
        from: dateKey(ledger.windowStart),
        to: dateKey(ledger.windowEnd),
        pageSize: 100,
      }),
      this.leave.list(user.tenantId, { employeeId, pageSize: 5 }),
    ]);

    return {
      month: selectedMonth,
      employee,
      window: {
        start: ledger.windowStart,
        end: ledger.windowEnd,
        clampedToToday: ledger.clampedToToday,
      },
      attendance: ledger.counts,
      leave: {
        calendarDaysOnLeave: ledger.counts.onLeave,
        byType: this.leaveDaysByType(monthRequests.data, ledger.windowStart, ledger.windowEnd),
        balances: balances.map((balance) => ({
          leaveTypeId: balance.leaveTypeId,
          name: balance.leaveType.name,
          code: balance.leaveType.code,
          isPaid: balance.leaveType.isPaid,
          opening: balance.openingBalance,
          accrued: balance.accrued,
          used: balance.used,
          balance: balance.balance,
        })),
      },
      recentLeaveHistory: recent.data.map((request) => ({
        id: request.id,
        leaveTypeId: request.leaveTypeId,
        name: request.leaveType.name,
        code: request.leaveType.code,
        fromDate: request.fromDate,
        toDate: request.toDate,
        days: request.days,
        status: request.status,
        reason: request.reason,
      })),
      dataQuality: DATA_QUALITY,
    };
  }

  /**
   * Approved leave grouped by type, in policy-charged days. A request that sits
   * entirely inside the window contributes its `days`; one that straddles the
   * window contributes only the calendar days that fall inside it.
   */
  private leaveDaysByType(
    requests: Array<{
      leaveTypeId: string;
      leaveType: { name: string; code: string };
      fromDate: Date;
      toDate: Date;
      days: number;
      status: string;
    }>,
    windowStart: Date,
    windowEnd: Date,
  ) {
    const byType = new Map<
      string,
      { leaveTypeId: string; name: string; code: string; policyDays: number }
    >();
    for (const request of requests) {
      if (request.status !== 'APPROVED') continue;
      const clippedStart = request.fromDate < windowStart ? windowStart : request.fromDate;
      const clippedEnd = request.toDate > windowEnd ? windowEnd : request.toDate;
      if (clippedStart > clippedEnd) continue;
      const straddles = request.fromDate < windowStart || request.toDate > windowEnd;
      const policyDays = straddles
        ? Math.round((clippedEnd.getTime() - clippedStart.getTime()) / 86_400_000) + 1
        : request.days;
      const entry = byType.get(request.leaveTypeId) ?? {
        leaveTypeId: request.leaveTypeId,
        name: request.leaveType.name,
        code: request.leaveType.code,
        policyDays: 0,
      };
      entry.policyDays += policyDays;
      byType.set(request.leaveTypeId, entry);
    }
    return [...byType.values()];
  }

  /**
   * `RolesGuard` treats `@Roles` and `@Scopes` as an OR, and every employee
   * holds `employees:read`, so the restriction has to be enforced here.
   */
  private assertCanViewSummary(user: AuthUser) {
    if (user.isSuperAdmin) return;
    if (user.roles.some((role) => SUMMARY_ROLES.includes(role))) return;
    throw new ForbiddenException(
      'Only HR and admin roles can view the attendance and leave summary',
    );
  }
}
