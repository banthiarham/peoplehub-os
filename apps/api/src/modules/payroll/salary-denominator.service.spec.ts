import { BadRequestException } from '@nestjs/common';
import { SalaryBasis } from '@prisma/client';
import { ShiftResolutionService, assignmentCoversDate } from '../attendance/shift-resolution.service';
import { PayrollPolicyService } from './payroll-policy.service';
import { SalaryDenominatorService } from './salary-denominator.service';

type PolicyFixture = Record<string, unknown>;
type HolidayFixture = { date: Date; locationId?: string | null };
type ShiftFixture = { weeklyOffDays: number[] };

/**
 * Doubles that honour the real `where` clauses: policy precedence and holiday location
 * applicability are what these tests are about, so stubbing them away would prove nothing.
 */
function buildService(options: {
  policies?: PolicyFixture[];
  holidays?: HolidayFixture[];
  /** Shift per employee id; a missing entry means the employee resolves to no shift. */
  shifts?: Record<string, ShiftFixture>;
} = {}) {
  const policies = options.policies ?? [];
  const holidays = options.holidays ?? [];

  const prisma = {
    payrollPolicy: {
      findFirst: jest.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(
          policies.find((policy) => Object.entries(where).every(([key, value]) => policy[key] === value)) ?? null,
        ),
      ),
    },
    holiday: {
      findMany: jest.fn(({ where }: { where: any }) => {
        // Mirrors the calendar filter the service builds: tenant-wide calendars always, plus
        // the employee's own location when they have one.
        const calendar = where.holidayCalendar;
        const allowedLocations: Array<string | null> = calendar.OR
          ? calendar.OR.map((clause: { locationId: string | null }) => clause.locationId)
          : [calendar.locationId ?? null];
        return Promise.resolve(
          holidays
            .filter((holiday) => allowedLocations.includes(holiday.locationId ?? null))
            .filter((holiday) => holiday.date >= where.date.gte && holiday.date <= where.date.lte)
            .map((holiday) => ({ date: holiday.date })),
        );
      }),
    },
  };

  const shifts = {
    resolverForRange: jest.fn((_tenantId: string, employeeId: string) =>
      Promise.resolve(() => ({
        shift: options.shifts?.[employeeId] ?? null,
        assignedLocationId: null,
        assignment: null,
      })),
    ),
  };

  const service = new SalaryDenominatorService(
    prisma as any,
    new PayrollPolicyService(prisma as any),
    shifts as any,
  );
  return { service, prisma, shifts };
}

const tenantPolicy = (overrides: PolicyFixture = {}): PolicyFixture => ({
  id: 'tenant-default',
  tenantId: 'tenant-1',
  locationId: null,
  salaryBasis: SalaryBasis.CALENDAR_DAYS,
  fixedDays: null,
  ...overrides,
});

const employee = (id: string, locationId: string | null = null) => ({ id, locationId });

async function daysFor(
  service: SalaryDenominatorService,
  month: number,
  year: number,
  employees = [employee('emp-1')],
) {
  const resolved = await service.resolveForMonth('tenant-1', month, year, employees);
  return resolved.get(employees[0].id)!;
}

describe('SalaryDenominatorService CALENDAR_DAYS', () => {
  it.each([
    ['a 28-day month', 2, 2026, 28],
    ['a 29-day leap month', 2, 2024, 29],
    ['a 30-day month', 4, 2026, 30],
    ['a 31-day month', 7, 2026, 31],
  ])('uses the actual calendar length for %s', async (_label, month, year, expected) => {
    const { service } = buildService({ policies: [tenantPolicy()] });
    const resolved = await daysFor(service, month, year);
    expect(resolved).toEqual({ days: expected, salaryBasis: SalaryBasis.CALENDAR_DAYS });
  });

  it('falls back to calendar days when the tenant has configured no policy at all', async () => {
    const { service, shifts } = buildService({ policies: [] });
    const resolved = await daysFor(service, 7, 2026);
    expect(resolved.days).toBe(31);
    expect(resolved.salaryBasis).toBe(SalaryBasis.CALENDAR_DAYS);
    // The default basis must not pay for shift lookups.
    expect(shifts.resolverForRange).not.toHaveBeenCalled();
  });
});

describe('SalaryDenominatorService FIXED_DAYS', () => {
  it.each([26, 27])('uses the configured fixedDays value of %i', async (fixedDays) => {
    const { service } = buildService({
      policies: [tenantPolicy({ salaryBasis: SalaryBasis.FIXED_DAYS, fixedDays })],
    });
    const resolved = await daysFor(service, 7, 2026);
    expect(resolved).toEqual({ days: fixedDays, salaryBasis: SalaryBasis.FIXED_DAYS });
  });

  it('is identical across months of different lengths', async () => {
    const { service } = buildService({
      policies: [tenantPolicy({ salaryBasis: SalaryBasis.FIXED_DAYS, fixedDays: 26 })],
    });
    const february = await daysFor(service, 2, 2026);
    const july = await daysFor(service, 7, 2026);
    expect(february.days).toBe(26);
    expect(july.days).toBe(26);
  });

  it.each([null, undefined, 0, -3, 40, 26.5])(
    'fails clearly rather than falling back when fixedDays is %p',
    async (fixedDays) => {
      const { service } = buildService({
        policies: [tenantPolicy({ salaryBasis: SalaryBasis.FIXED_DAYS, fixedDays })],
      });
      await expect(daysFor(service, 7, 2026)).rejects.toThrow(BadRequestException);
    },
  );

  it('names the location whose policy is misconfigured', async () => {
    const { service } = buildService({
      policies: [
        tenantPolicy(),
        tenantPolicy({ id: 'loc', locationId: 'loc-1', salaryBasis: SalaryBasis.FIXED_DAYS, fixedDays: null }),
      ],
    });
    await expect(
      service.resolveForMonth('tenant-1', 7, 2026, [employee('emp-1', 'loc-1')]),
    ).rejects.toThrow(/loc-1/);
  });
});

describe('SalaryDenominatorService WORKING_DAYS', () => {
  const workingDaysPolicy = [tenantPolicy({ salaryBasis: SalaryBasis.WORKING_DAYS })];

  // July 2026 starts on a Wednesday: 31 days, 4 Saturdays and 4 Sundays.
  it('excludes the shift weekly offs', async () => {
    const { service } = buildService({
      policies: workingDaysPolicy,
      shifts: { 'emp-1': { weeklyOffDays: [0, 6] } },
    });
    const resolved = await daysFor(service, 7, 2026);
    expect(resolved).toEqual({ days: 23, salaryBasis: SalaryBasis.WORKING_DAYS });
  });

  it('honours a single-day weekly off', async () => {
    const { service } = buildService({
      policies: workingDaysPolicy,
      shifts: { 'emp-1': { weeklyOffDays: [0] } },
    });
    expect((await daysFor(service, 7, 2026)).days).toBe(27);
  });

  it('falls back to Sat/Sun offs when the employee resolves to no shift', async () => {
    const { service } = buildService({ policies: workingDaysPolicy, shifts: {} });
    expect((await daysFor(service, 7, 2026)).days).toBe(23);
  });

  it('excludes holidays that fall on a working day', async () => {
    const { service } = buildService({
      policies: workingDaysPolicy,
      shifts: { 'emp-1': { weeklyOffDays: [0, 6] } },
      holidays: [{ date: new Date(Date.UTC(2026, 6, 15)) }],
    });
    expect((await daysFor(service, 7, 2026)).days).toBe(22);
  });

  it('does not double-count a holiday that falls on a weekly off', async () => {
    const { service } = buildService({
      policies: workingDaysPolicy,
      shifts: { 'emp-1': { weeklyOffDays: [0, 6] } },
      holidays: [{ date: new Date(Date.UTC(2026, 6, 4)) }], // a Saturday
    });
    expect((await daysFor(service, 7, 2026)).days).toBe(23);
  });

  it('ignores holidays outside the payroll month', async () => {
    const { service } = buildService({
      policies: workingDaysPolicy,
      shifts: { 'emp-1': { weeklyOffDays: [0, 6] } },
      holidays: [{ date: new Date(Date.UTC(2026, 7, 12)) }],
    });
    expect((await daysFor(service, 7, 2026)).days).toBe(23);
  });

  it('applies another location holiday calendar to nobody but that location', async () => {
    const { service } = buildService({
      policies: workingDaysPolicy,
      shifts: { 'emp-1': { weeklyOffDays: [0, 6] }, 'emp-2': { weeklyOffDays: [0, 6] } },
      holidays: [{ date: new Date(Date.UTC(2026, 6, 15)), locationId: 'loc-1' }],
    });
    const resolved = await service.resolveForMonth('tenant-1', 7, 2026, [
      employee('emp-1', 'loc-1'),
      employee('emp-2', 'loc-2'),
    ]);
    expect(resolved.get('emp-1')!.days).toBe(22);
    expect(resolved.get('emp-2')!.days).toBe(23);
  });

  it('gives each employee their own schedule rather than one run-wide count', async () => {
    const { service } = buildService({
      policies: workingDaysPolicy,
      shifts: {
        'five-day': { weeklyOffDays: [0, 6] },
        'six-day': { weeklyOffDays: [0] },
        'all-week': { weeklyOffDays: [] },
      },
    });
    const resolved = await service.resolveForMonth('tenant-1', 7, 2026, [
      employee('five-day'),
      employee('six-day'),
      employee('all-week'),
    ]);
    expect(resolved.get('five-day')!.days).toBe(23);
    expect(resolved.get('six-day')!.days).toBe(27);
    expect(resolved.get('all-week')!.days).toBe(31);
  });

  it('reports an error instead of a zero denominator when nothing is schedulable', async () => {
    const { service } = buildService({
      policies: workingDaysPolicy,
      shifts: { 'emp-1': { weeklyOffDays: [0, 1, 2, 3, 4, 5, 6] } },
    });
    const resolved = await daysFor(service, 7, 2026);
    expect(resolved.days).toBe(0);
    expect(resolved.error).toMatch(/no scheduled working day/i);
  });
});

/**
 * Driven through the real ShiftResolutionService rather than a flat stub, so the per-date
 * shift precedence payroll relies on is genuinely exercised - a resolver that returned one
 * shift for the whole month would pass the tests above but fail these.
 */
describe('SalaryDenominatorService WORKING_DAYS with real shift resolution', () => {
  function buildWithRealShifts(assignments: Array<Record<string, unknown>>) {
    const prisma = {
      payrollPolicy: {
        findFirst: jest.fn(({ where }: { where: Record<string, unknown> }) =>
          Promise.resolve(
            where.locationId === null
              ? { id: 'p', tenantId: 'tenant-1', locationId: null, salaryBasis: SalaryBasis.WORKING_DAYS, fixedDays: null }
              : null,
          ),
        ),
      },
      holiday: { findMany: jest.fn().mockResolvedValue([]) },
      shift: { findFirst: jest.fn().mockResolvedValue(null) },
      shiftAssignment: {
        findMany: jest.fn(({ where }: { where: any }) =>
          Promise.resolve(
            assignments.filter(
              (assignment) =>
                assignment.employeeId === where.employeeId &&
                (assignment.effectiveFrom as Date) <= where.effectiveFrom.lte &&
                ((assignment.effectiveTo as Date | null) === null ||
                  (assignment.effectiveTo as Date) >= where.OR[1].effectiveTo.gte),
            ),
          ),
        ),
      },
    };
    const service = new SalaryDenominatorService(
      prisma as any,
      new PayrollPolicyService(prisma as any),
      new ShiftResolutionService(prisma as any),
    );
    return { service, prisma };
  }

  const fiveDayWeek = { id: 's1', weeklyOffDays: [0, 6] };
  const sixDayWeek = { id: 's2', weeklyOffDays: [0] };

  it('applies a mid-month shift change day by day', async () => {
    // July 2026 starts on a Wednesday. Jul 1-15 on a 5-day week is 11 working days
    // (4 weekend days); Jul 16-31 on a 6-day week is 14 (2 Sundays). Neither 23 (all
    // five-day) nor 27 (all six-day) - only per-date resolution yields 25.
    const { service } = buildWithRealShifts([
      {
        id: 'a1',
        employeeId: 'emp-1',
        shift: fiveDayWeek,
        locationId: null,
        source: 'MANUAL',
        effectiveFrom: new Date(Date.UTC(2026, 6, 1)),
        effectiveTo: new Date(Date.UTC(2026, 6, 15)),
        createdAt: new Date(Date.UTC(2026, 5, 1)),
      },
      {
        id: 'a2',
        employeeId: 'emp-1',
        shift: sixDayWeek,
        locationId: null,
        source: 'MANUAL',
        effectiveFrom: new Date(Date.UTC(2026, 6, 16)),
        effectiveTo: null,
        createdAt: new Date(Date.UTC(2026, 5, 1)),
      },
    ]);

    const resolved = await service.resolveForMonth('tenant-1', 7, 2026, [employee('emp-1')]);

    expect(resolved.get('emp-1')!.days).toBe(25);
  });

  it('honours a single-day override that wins by assignment precedence', async () => {
    // A one-day roster override on Saturday Jul 4 puts the employee on a shift with no
    // weekly off at all, adding exactly that day to an otherwise 23-day five-day month.
    const { service } = buildWithRealShifts([
      {
        id: 'base',
        employeeId: 'emp-1',
        shift: fiveDayWeek,
        locationId: null,
        source: 'MANUAL',
        effectiveFrom: new Date(Date.UTC(2026, 6, 1)),
        effectiveTo: null,
        createdAt: new Date(Date.UTC(2026, 5, 1)),
      },
      {
        id: 'override',
        employeeId: 'emp-1',
        shift: { id: 's3', weeklyOffDays: [] },
        locationId: null,
        source: 'ROSTER_UPLOAD',
        effectiveFrom: new Date(Date.UTC(2026, 6, 4)),
        effectiveTo: new Date(Date.UTC(2026, 6, 4)),
        createdAt: new Date(Date.UTC(2026, 6, 2)),
      },
    ]);

    const resolved = await service.resolveForMonth('tenant-1', 7, 2026, [employee('emp-1')]);

    expect(resolved.get('emp-1')!.days).toBe(24);
  });

  it('reads assignments once for the whole month rather than once per day', async () => {
    const { service, prisma } = buildWithRealShifts([
      {
        id: 'base',
        employeeId: 'emp-1',
        shift: fiveDayWeek,
        locationId: null,
        source: 'MANUAL',
        effectiveFrom: new Date(Date.UTC(2026, 6, 1)),
        effectiveTo: null,
        createdAt: new Date(Date.UTC(2026, 5, 1)),
      },
    ]);

    await service.resolveForMonth('tenant-1', 7, 2026, [employee('emp-1')]);

    expect(prisma.shiftAssignment.findMany).toHaveBeenCalledTimes(1);
  });

  it('keeps the assignment window helper agreeing with the day anchors payroll passes', () => {
    const assignment = {
      effectiveFrom: new Date(Date.UTC(2026, 6, 1)),
      effectiveTo: new Date(Date.UTC(2026, 6, 15)),
    };
    expect(assignmentCoversDate(assignment, new Date(Date.UTC(2026, 6, 15)))).toBe(true);
    expect(assignmentCoversDate(assignment, new Date(Date.UTC(2026, 6, 16)))).toBe(false);
  });
});

describe('SalaryDenominatorService policy resolution by tenant and location', () => {
  it('prefers the location policy over the tenant default', async () => {
    const { service } = buildService({
      policies: [
        tenantPolicy({ salaryBasis: SalaryBasis.CALENDAR_DAYS }),
        tenantPolicy({
          id: 'loc',
          locationId: 'loc-1',
          salaryBasis: SalaryBasis.FIXED_DAYS,
          fixedDays: 26,
        }),
      ],
    });
    const resolved = await service.resolveForMonth('tenant-1', 7, 2026, [
      employee('emp-at-location', 'loc-1'),
      employee('emp-elsewhere', 'loc-2'),
      employee('emp-no-location', null),
    ]);
    expect(resolved.get('emp-at-location')).toEqual({ days: 26, salaryBasis: SalaryBasis.FIXED_DAYS });
    expect(resolved.get('emp-elsewhere')).toEqual({ days: 31, salaryBasis: SalaryBasis.CALENDAR_DAYS });
    expect(resolved.get('emp-no-location')).toEqual({ days: 31, salaryBasis: SalaryBasis.CALENDAR_DAYS });
  });

  it('resolves each distinct location once however many employees share it', async () => {
    const { service, prisma } = buildService({ policies: [tenantPolicy()] });
    await service.resolveForMonth('tenant-1', 7, 2026, [
      employee('emp-1', 'loc-1'),
      employee('emp-2', 'loc-1'),
      employee('emp-3', 'loc-1'),
    ]);
    // One resolve() for the location, which itself looks up the location row then the default.
    expect(prisma.payrollPolicy.findFirst).toHaveBeenCalledTimes(2);
  });

  it('never resolves a policy belonging to another tenant', async () => {
    const { service } = buildService({
      policies: [tenantPolicy({ tenantId: 'tenant-2', salaryBasis: SalaryBasis.FIXED_DAYS, fixedDays: 26 })],
    });
    expect((await daysFor(service, 7, 2026)).days).toBe(31);
  });
});
