import { BadRequestException, Injectable } from '@nestjs/common';
import { SalaryBasis } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { ShiftResolutionService } from '../attendance/shift-resolution.service';
import { MAX_FIXED_DAYS, PayrollPolicyService } from './payroll-policy.service';

/** Weekly offs when an employee resolves to no shift at all - the convention attendance and leave already use. */
const FALLBACK_WEEKLY_OFF_DAYS = [0, 6];

export type DenominatorEmployee = { id: string; locationId: string | null };

export type ResolvedDenominator = {
  /** Days a monthly salary is divided by. Zero only when `error` is set. */
  days: number;
  salaryBasis: SalaryBasis;
  /**
   * Set when this employee's configuration cannot produce a usable denominator.
   * The caller records it against the employee rather than paying them on a
   * denominator that would silently be wrong.
   */
  error?: string;
};

/**
 * Resolves the salary denominator - the day count a monthly salary is divided by to get a
 * daily rate - for each employee in a payroll month.
 *
 * The denominator comes from the {@link PayrollPolicyService} policy that applies to the
 * employee's location, so two employees in the same run can legitimately resolve different
 * denominators:
 *
 * - `CALENDAR_DAYS` - actual days in the payroll month (28/29/30/31).
 * - `FIXED_DAYS`    - the policy's `fixedDays`, identical in every month.
 * - `WORKING_DAYS`  - days the employee is actually scheduled to work, excluding their
 *                     shift's weekly offs and the holidays that apply at their location.
 *
 * Only `WORKING_DAYS` reads shifts and holidays, so a tenant on the default `CALENDAR_DAYS`
 * policy pays for no extra queries.
 */
@Injectable()
export class SalaryDenominatorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policies: PayrollPolicyService,
    private readonly shifts: ShiftResolutionService,
  ) {}

  /**
   * Denominator per employee id for one payroll month.
   *
   * Throws when a policy is configured as `FIXED_DAYS` without a usable `fixedDays`: that is
   * a tenant configuration error affecting everyone under the policy, and falling back to
   * calendar days would silently pay a different amount than the policy asks for.
   */
  async resolveForMonth(
    tenantId: string,
    month: number,
    year: number,
    employees: DenominatorEmployee[],
  ): Promise<Map<string, ResolvedDenominator>> {
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEnd = new Date(Date.UTC(year, month, 0));
    const calendarDays = monthEnd.getUTCDate();

    const policyCache = new Map<string, Awaited<ReturnType<PayrollPolicyService['resolve']>>>();
    const holidayCache = new Map<string, Set<string>>();
    const resolved = new Map<string, ResolvedDenominator>();

    for (const employee of employees) {
      const locationKey = employee.locationId ?? '';
      let policy = policyCache.get(locationKey);
      if (!policy) {
        policy = await this.policies.resolve(tenantId, employee.locationId);
        policyCache.set(locationKey, policy);
      }

      if (policy.salaryBasis === SalaryBasis.FIXED_DAYS) {
        const fixedDays = policy.fixedDays;
        if (!Number.isInteger(fixedDays) || (fixedDays as number) < 1 || (fixedDays as number) > MAX_FIXED_DAYS) {
          throw new BadRequestException(
            `Payroll policy ${this.scopeLabel(employee.locationId)} is set to FIXED_DAYS but has no valid fixedDays value; ` +
              'set fixedDays on the policy before processing payroll',
          );
        }
        resolved.set(employee.id, { days: fixedDays as number, salaryBasis: SalaryBasis.FIXED_DAYS });
        continue;
      }

      if (policy.salaryBasis === SalaryBasis.WORKING_DAYS) {
        let holidays = holidayCache.get(locationKey);
        if (!holidays) {
          holidays = await this.holidayDates(tenantId, employee.locationId, monthStart, monthEnd);
          holidayCache.set(locationKey, holidays);
        }
        const days = await this.scheduledWorkingDays(tenantId, employee.id, monthStart, monthEnd, holidays);
        resolved.set(
          employee.id,
          days > 0
            ? { days, salaryBasis: SalaryBasis.WORKING_DAYS }
            : {
                days: 0,
                salaryBasis: SalaryBasis.WORKING_DAYS,
                error:
                  'Payroll policy is set to WORKING_DAYS but this employee has no scheduled working day in ' +
                  'this month; review their shift weekly offs and the holiday calendar',
              },
        );
        continue;
      }

      resolved.set(employee.id, { days: calendarDays, salaryBasis: SalaryBasis.CALENDAR_DAYS });
    }

    return resolved;
  }

  /**
   * Days in the month the employee is scheduled to work: every day that is neither a weekly
   * off on their effective shift nor a holiday applying at their location.
   *
   * The shift is resolved per date through {@link ShiftResolutionService.resolverForRange}, so
   * a mid-month shift change is honoured day by day and payroll agrees with attendance about
   * which days were working days.
   */
  private async scheduledWorkingDays(
    tenantId: string,
    employeeId: string,
    monthStart: Date,
    monthEnd: Date,
    holidays: Set<string>,
  ): Promise<number> {
    const resolveAt = await this.shifts.resolverForRange(tenantId, employeeId, monthStart, monthEnd);
    let days = 0;
    for (let cursor = new Date(monthStart); cursor <= monthEnd; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      const date = new Date(cursor);
      if (holidays.has(this.dayKey(date))) continue;
      const weeklyOffDays = resolveAt(date).shift?.weeklyOffDays ?? FALLBACK_WEEKLY_OFF_DAYS;
      if (weeklyOffDays.includes(date.getUTCDay())) continue;
      days += 1;
    }
    return days;
  }

  /**
   * Holiday days applying to a location: the tenant-wide calendars plus that location's own.
   *
   * Unlike the tenant-wide holiday reads in attendance and leave, this filters by location -
   * a per-location calendar must not shorten the denominator of employees at another site.
   * Optional (restricted) holidays are included, matching how attendance classifies the day.
   */
  private async holidayDates(
    tenantId: string,
    locationId: string | null,
    monthStart: Date,
    monthEnd: Date,
  ): Promise<Set<string>> {
    const holidays = await this.prisma.holiday.findMany({
      where: {
        holidayCalendar: locationId
          ? { tenantId, OR: [{ locationId: null }, { locationId }] }
          : { tenantId, locationId: null },
        date: { gte: monthStart, lte: monthEnd },
      },
      select: { date: true },
    });
    return new Set(holidays.map((holiday) => this.dayKey(holiday.date)));
  }

  /** Every holiday reader keys on the UTC day. */
  private dayKey(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private scopeLabel(locationId: string | null): string {
    return locationId ? `for location ${locationId}` : 'for this tenant';
  }
}
