import { ConfigService } from '@nestjs/config';
import { AuthUser } from '../../common/types/auth-user';
import { PayrollPolicyService } from '../payroll/payroll-policy.service';
import { AttendanceQrService } from './attendance-qr.service';
import { AttendanceService } from './attendance.service';
import { DeviceBindingService } from './device-binding.service';
import { ShiftResolutionService } from './shift-resolution.service';

/**
 * Exact-duration Comp-Off usage.
 *
 * A grant is indivisible - one `days`, one `status`, one `usedOnDate` - so spending it is
 * all-or-nothing. Before this rule a 0.5-day grant could be marked used against a full absence
 * (clearing 0.5 and leaving 0.5 payable as LOP), a 1-day grant against a half day (clearing
 * 0.5 and losing the rest), and either against a date with no absence at all (clearing
 * nothing). None of those ever *overpaid* - `PayrollService.applyCompOffOffsets` caps every
 * grant at what its date actually contributed - so the loss fell on the employee's balance,
 * silently, with no message at decision time.
 *
 * These tests pin both halves of the rule: an exact match is accepted, and every inexact one is
 * refused with an error naming what went wrong. The duration is resolved through the same
 * `absence-duration` module payroll's LOP uses, so what is accepted here is by construction
 * what payroll later offsets.
 *
 * Kept in its own file rather than appended to `attendance.service.spec.ts` because it needs
 * its own fixture shape: the absence on the target date is the subject, so every case states it
 * explicitly instead of inheriting a default.
 */
function newAttendanceService(prisma: unknown): AttendanceService {
  const client = prisma as never;
  const config = new ConfigService();
  return new AttendanceService(
    client,
    new ShiftResolutionService(client),
    new DeviceBindingService(client, config),
    new AttendanceQrService(client, config),
    new PayrollPolicyService(client),
  );
}

const hrAdmin = {
  userId: 'user-hr',
  tenantId: 'tenant-1',
  email: 'hr@x.com',
  name: 'HR',
  isSuperAdmin: false,
  employeeId: 'emp-hr',
  roles: ['HR Admin'],
} as AuthUser;

/** 2026-08-17 is a Monday, in the same calendar month as the 2026-08-15 earned date. */
const USED_ON = '2026-08-17';
const USED_ON_DATE = new Date(Date.UTC(2026, 7, 17));

type HarnessOptions = {
  grantDays: number;
  /** The finalized attendance status on the target day, or `null` for a day with no record. */
  absence?: 'ABSENT' | 'HALF_DAY' | null;
  unpaidLeave?: Array<{ days: number; fromDate: Date; toDate: Date }>;
  finalized?: boolean;
  coveringGrant?: Record<string, unknown> | null;
  locationId?: string | null;
};

/**
 * One available grant plus whatever absence the test wants on `USED_ON`.
 *
 * The grant lookup discriminates on the `where`, because `decideCompOff` now issues two
 * distinct `compOffGrant.findFirst` queries - the grant by id, and "is another USED grant
 * already covering this date". A mock answering both with the same row would report the grant
 * as covered by itself.
 */
function harness(options: HarnessOptions) {
  let grantRow: Record<string, unknown> | null = null;
  const isCoverageQuery = (args: any) =>
    args?.where?.status === 'USED' && 'usedOnDate' in (args?.where ?? {});

  const prisma: Record<string, any> = {
    compOffGrant: {
      findFirst: jest.fn((args: any) =>
        Promise.resolve(
          isCoverageQuery(args)
            ? options.coveringGrant ?? null
            : {
                id: 'grant-1',
                status: 'AVAILABLE',
                employeeId: 'emp-1',
                earnedDate: new Date(Date.UTC(2026, 7, 15)),
                expiresAt: null,
                days: options.grantDays,
                employee: { managerId: 'mgr-1', locationId: options.locationId ?? null },
              },
        ),
      ),
      updateMany: jest.fn((args: any) => {
        grantRow = { id: args.where.id, ...args.data };
        return Promise.resolve({ count: 1 });
      }),
      findFirstOrThrow: jest.fn(() => Promise.resolve(grantRow)),
    },
    attendanceFinalization: {
      findFirst: jest
        .fn()
        .mockResolvedValue(options.finalized === false ? null : { id: 'finalization-1' }),
    },
    attendanceRecord: {
      findMany: jest.fn(({ where }: any) =>
        Promise.resolve(
          options.absence
            ? [{ employeeId: where.employeeId, date: where.date, status: options.absence }]
            : [],
        ),
      ),
    },
    leaveRequest: {
      findMany: jest.fn(() =>
        Promise.resolve(
          (options.unpaidLeave ?? []).map((leave) => ({ employeeId: 'emp-1', ...leave })),
        ),
      ),
    },
    // MONTHLY with no carry-forward, so the August earned date and August usage date stay in
    // the same period and the pre-existing period rule never intervenes. Expiry is left
    // NOT_ENFORCED, matching the migration's default.
    payrollPolicy: {
      findFirst: jest.fn().mockResolvedValue({
        tenantId: 'tenant-1',
        locationId: null,
        compOffEnabled: true,
        compOffUsagePeriod: 'MONTHLY',
        compOffCarryForwardEnabled: false,
        compOffUnusedTreatment: 'PAY',
        compOffExpiryTreatment: 'NOT_ENFORCED',
        compOffExpiryDays: null,
      }),
    },
    shiftAssignment: { findFirst: jest.fn().mockResolvedValue(null) },
    shift: { findFirst: jest.fn().mockResolvedValue({ id: 'shift-1', weeklyOffDays: [0, 6] }) },
    holiday: { findMany: jest.fn().mockResolvedValue([]) },
    // No frozen payroll run and no existing payout, so neither the payroll-period lock nor the
    // payout-freeze guard intervenes in these cases.
    payrollRun: { findFirst: jest.fn().mockResolvedValue(null) },
    payrollVariableInput: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  return { prisma, service: newAttendanceService(prisma) };
}

const markUsed = (service: AttendanceService, usedOnDate = USED_ON) =>
  service.decideCompOff(hrAdmin, 'grant-1', { status: 'USED' as never, usedOnDate });

const EXPECTED_TRANSITION = {
  where: { id: 'grant-1', status: 'AVAILABLE', paidInPayrollRunId: null },
  data: { status: 'USED', usedOnDate: USED_ON_DATE },
};

describe('exact-duration comp-off usage', () => {
  describe('an exact match is accepted', () => {
    it('uses a half-day grant against a finalized half-day absence', async () => {
      const { prisma, service } = harness({ grantDays: 0.5, absence: 'HALF_DAY' });

      await markUsed(service);

      expect(prisma.compOffGrant.updateMany).toHaveBeenCalledWith(EXPECTED_TRANSITION);
    });

    it('uses a full-day grant against a finalized full-day absence', async () => {
      const { prisma, service } = harness({ grantDays: 1, absence: 'ABSENT' });

      await markUsed(service);

      expect(prisma.compOffGrant.updateMany).toHaveBeenCalledWith(EXPECTED_TRANSITION);
    });

    it('uses a full-day grant against a full day of approved unpaid leave', async () => {
      // The absence need not come from attendance: unpaid leave contributes identically, which
      // is the point of sharing payroll's resolver rather than reading `status` alone.
      const { prisma, service } = harness({
        grantDays: 1,
        absence: null,
        unpaidLeave: [{ days: 1, fromDate: USED_ON_DATE, toDate: USED_ON_DATE }],
      });

      await markUsed(service);

      expect(prisma.compOffGrant.updateMany).toHaveBeenCalledWith(EXPECTED_TRANSITION);
    });

    it('uses a half-day grant against half a day of unpaid leave spread over two days', async () => {
      // 1 day across a 2-day span is 0.5 on each - the fractional case a per-request total
      // would get wrong.
      const { prisma, service } = harness({
        grantDays: 0.5,
        absence: null,
        unpaidLeave: [
          { days: 1, fromDate: USED_ON_DATE, toDate: new Date(Date.UTC(2026, 7, 18)) },
        ],
      });

      await markUsed(service);

      expect(prisma.compOffGrant.updateMany).toHaveBeenCalledWith(EXPECTED_TRANSITION);
    });
  });

  describe('a mismatched duration is refused', () => {
    it('refuses a half-day grant against a full-day absence', async () => {
      const { prisma, service } = harness({ grantDays: 0.5, absence: 'ABSENT' });

      await expect(markUsed(service)).rejects.toThrow(
        /half-day comp-off \(0\.5 day\)\. It can only be used against a half-day absence \(0\.5 day\), but 2026-08-17 is a full-day absence \(1 day\)/,
      );
      expect(prisma.compOffGrant.updateMany).not.toHaveBeenCalled();
    });

    it('refuses a full-day grant against a half-day absence', async () => {
      const { prisma, service } = harness({ grantDays: 1, absence: 'HALF_DAY' });

      await expect(markUsed(service)).rejects.toThrow(
        /full-day comp-off \(1 day\)\. It can only be used against a full-day absence \(1 day\), but 2026-08-17 is a half-day absence \(0\.5 day\)/,
      );
      expect(prisma.compOffGrant.updateMany).not.toHaveBeenCalled();
    });

    it('refuses a date whose absence totals more than any single grant', async () => {
      // Attendance half day plus a full day of unpaid leave sums to 1.5 - the aggregation case
      // the shared resolver handles and no grant can match.
      const { prisma, service } = harness({
        grantDays: 1,
        absence: 'HALF_DAY',
        unpaidLeave: [{ days: 1, fromDate: USED_ON_DATE, toDate: USED_ON_DATE }],
      });

      await expect(markUsed(service)).rejects.toThrow(/is an absence of 1\.5 day\(s\)/);
      expect(prisma.compOffGrant.updateMany).not.toHaveBeenCalled();
    });

    it('refuses two half-day grants against one full-day absence', async () => {
      // Not a rule of its own - a half-day grant is already refused against a full absence,
      // because 0.5 never matches 1. There is deliberately no path that splits a full absence
      // into two halves.
      const { prisma, service } = harness({ grantDays: 0.5, absence: 'ABSENT' });

      await expect(markUsed(service)).rejects.toThrow(/half-day absence/);
      await expect(markUsed(service)).rejects.toThrow(/half-day absence/);
      expect(prisma.compOffGrant.updateMany).not.toHaveBeenCalled();
    });

    it('describes a historical out-of-range grant rather than claiming a half or full day', async () => {
      // 0.75 is no longer creatable, but a grant credited before the manual form was narrowed
      // must still explain itself instead of being mislabelled.
      const { service } = harness({ grantDays: 0.75, absence: 'ABSENT' });

      await expect(markUsed(service)).rejects.toThrow(
        /worth 0\.75 day\(s\).*exactly 0\.75 day\(s\)/s,
      );
    });
  });

  describe('a date with nothing to offset is refused', () => {
    it('refuses a date with no qualifying absence at all', async () => {
      const { prisma, service } = harness({ grantDays: 1, absence: null });

      await expect(markUsed(service)).rejects.toThrow(
        /No qualifying absence was found on 2026-08-17/,
      );
      expect(prisma.compOffGrant.updateMany).not.toHaveBeenCalled();
    });

    it('counts only unpaid leave, so a paid leave day offsets nothing', async () => {
      const { prisma, service } = harness({ grantDays: 1, absence: null });

      await expect(markUsed(service)).rejects.toThrow(/No qualifying absence/);

      expect(prisma.leaveRequest.findMany.mock.calls[0][0].where).toMatchObject({
        status: 'APPROVED',
        leaveType: { isPaid: false },
      });
    });

    it('reads only finalized attendance', async () => {
      const { prisma, service } = harness({ grantDays: 1, absence: 'ABSENT' });

      await markUsed(service);

      expect(prisma.attendanceRecord.findMany.mock.calls[0][0].where).toMatchObject({
        tenantId: 'tenant-1',
        employeeId: 'emp-1',
        isFinalized: true,
        status: { in: ['ABSENT', 'HALF_DAY'] },
      });
    });
  });

  describe('finalization is required', () => {
    it('refuses usage before the month is finalized', async () => {
      const { prisma, service } = harness({ grantDays: 1, absence: 'ABSENT', finalized: false });

      await expect(markUsed(service)).rejects.toThrow(
        /Attendance must be finalized before this comp-off can be used.*2026-08-17/s,
      );
      expect(prisma.compOffGrant.updateMany).not.toHaveBeenCalled();
    });

    it('asks about the used month, not the earned month', async () => {
      const { prisma, service } = harness({ grantDays: 1, absence: 'ABSENT' });

      await markUsed(service);

      expect(prisma.attendanceFinalization.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ month: 8, year: 2026, status: 'FINALIZED' }),
        }),
      );
    });

    it('accepts a tenant-wide or own-location finalization for a located employee', async () => {
      const { prisma, service } = harness({
        grantDays: 1,
        absence: 'ABSENT',
        locationId: 'loc-1',
      });

      await markUsed(service);

      expect(prisma.attendanceFinalization.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ locationId: null }, { locationId: 'loc-1' }],
          }),
        }),
      );
    });

    it('requires a tenant-wide finalization for an employee with no location', async () => {
      const { prisma, service } = harness({ grantDays: 1, absence: 'ABSENT' });

      await markUsed(service);

      expect(prisma.attendanceFinalization.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ locationId: null }) }),
      );
    });
  });

  describe('an absence already offset is refused', () => {
    it('refuses a date another USED grant already covers', async () => {
      const { prisma, service } = harness({
        grantDays: 1,
        absence: 'ABSENT',
        coveringGrant: { id: 'grant-earlier' },
      });

      await expect(markUsed(service)).rejects.toThrow(
        /already covered by another comp-off \(grant-earlier\).*cannot be offset twice/s,
      );
      expect(prisma.compOffGrant.updateMany).not.toHaveBeenCalled();
    });

    it('refuses a second half-day grant on a half-day absence the first already cleared', async () => {
      const { prisma, service } = harness({
        grantDays: 0.5,
        absence: 'HALF_DAY',
        coveringGrant: { id: 'grant-earlier' },
      });

      await expect(markUsed(service)).rejects.toThrow(/cannot be offset twice/);
      expect(prisma.compOffGrant.updateMany).not.toHaveBeenCalled();
    });

    it('excludes the grant being decided from that lookup', async () => {
      // Without `id: { not: grant.id }` a grant would find itself and refuse every usage.
      const { prisma, service } = harness({ grantDays: 1, absence: 'ABSENT' });

      await markUsed(service);

      const coverageCall = prisma.compOffGrant.findFirst.mock.calls.find(
        (call: any) => call[0]?.where?.status === 'USED',
      );
      expect(coverageCall[0].where).toMatchObject({
        tenantId: 'tenant-1',
        employeeId: 'emp-1',
        id: { not: 'grant-1' },
        usedOnDate: USED_ON_DATE,
      });
    });
  });

  describe('the pre-existing guards still run first', () => {
    it('reports a weekly off rather than a missing absence', async () => {
      // 2026-08-16 is a Sunday. The weekly-off check is the clearer error and must win.
      const { service } = harness({ grantDays: 1, absence: null });

      await expect(markUsed(service, '2026-08-16')).rejects.toThrow(
        'A comp-off cannot be used on a weekly off',
      );
    });

    it('reports a holiday rather than a missing absence', async () => {
      const { prisma, service } = harness({ grantDays: 1, absence: null });
      prisma.holiday.findMany.mockResolvedValue([{ date: USED_ON_DATE }]);

      await expect(markUsed(service)).rejects.toThrow('A comp-off cannot be used on a holiday');
    });

    it('does not run the duration check for a CANCELLED decision', async () => {
      const { prisma, service } = harness({ grantDays: 1, absence: null });

      await service.decideCompOff(hrAdmin, 'grant-1', { status: 'CANCELLED' as never });

      expect(prisma.attendanceRecord.findMany).not.toHaveBeenCalled();
      expect(prisma.attendanceFinalization.findFirst).not.toHaveBeenCalled();
      expect(prisma.compOffGrant.updateMany).toHaveBeenCalledWith({
        where: { id: 'grant-1', status: 'AVAILABLE', paidInPayrollRunId: null },
        data: { status: 'CANCELLED' },
      });
    });

    it('still gates the transition on the payout claim, so a paid grant cannot be used', async () => {
      // The duration check must not displace the `paidInPayrollRunId: null` condition that
      // makes this update race safely against `PayrollService.lockRun`.
      const { prisma, service } = harness({ grantDays: 1, absence: 'ABSENT' });

      await markUsed(service);

      expect(prisma.compOffGrant.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ paidInPayrollRunId: null }),
        }),
      );
    });
  });
});

/**
 * The eligible-date lookup behind the "mark used" dialog.
 *
 * It exists because the dialog previously offered a free date field defaulted to today - a
 * date that on an ordinary working day carries no absence, so the common case was a guess that
 * earned a 400. It is a convenience only: these tests assert it offers nothing the validator
 * would refuse, not that it is the thing enforcing anything.
 */
describe('compOffEligibleDates', () => {
  const AUG = (day: number) => new Date(Date.UTC(2026, 7, day));

  function lookupHarness(
    options: {
      grantDays?: number;
      status?: string;
      paidInPayrollRunId?: string | null;
      absences?: Array<{ date: Date; status: 'ABSENT' | 'HALF_DAY' }>;
      unpaidLeave?: Array<{ days: number; fromDate: Date; toDate: Date }>;
      usedGrants?: Array<{ usedOnDate: Date }>;
      holidays?: Date[];
      finalized?: boolean;
      usagePeriod?: 'MONTHLY' | 'ANNUAL';
      carryForward?: boolean;
      expiryTreatment?: 'NOT_ENFORCED' | 'FORFEIT' | 'PAY_OUT';
      expiresAt?: Date | null;
    } = {},
  ) {
    const prisma: Record<string, any> = {
      compOffGrant: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'grant-1',
          status: options.status ?? 'AVAILABLE',
          paidInPayrollRunId: options.paidInPayrollRunId ?? null,
          employeeId: 'emp-1',
          earnedDate: AUG(15),
          expiresAt: options.expiresAt ?? null,
          days: options.grantDays ?? 1,
          employee: { managerId: 'mgr-1', locationId: null },
        }),
        findMany: jest.fn().mockResolvedValue(options.usedGrants ?? []),
      },
      attendanceRecord: {
        findMany: jest.fn().mockResolvedValue(
          (options.absences ?? []).map((absence) => ({
            employeeId: 'emp-1',
            date: absence.date,
            status: absence.status,
          })),
        ),
      },
      leaveRequest: {
        findMany: jest.fn().mockResolvedValue(
          (options.unpaidLeave ?? []).map((leave) => ({ employeeId: 'emp-1', ...leave })),
        ),
      },
      attendanceFinalization: {
        findFirst: jest
          .fn()
          .mockResolvedValue(options.finalized === false ? null : { id: 'finalization-1' }),
      },
      holiday: {
        findMany: jest.fn().mockResolvedValue((options.holidays ?? []).map((date) => ({ date }))),
      },
      payrollPolicy: {
        findFirst: jest.fn().mockResolvedValue({
          tenantId: 'tenant-1',
          locationId: null,
          compOffEnabled: true,
          compOffUsagePeriod: options.usagePeriod ?? 'MONTHLY',
          compOffCarryForwardEnabled: options.carryForward ?? false,
          compOffUnusedTreatment: 'PAY',
          compOffExpiryTreatment: options.expiryTreatment ?? 'NOT_ENFORCED',
          compOffExpiryDays: null,
        }),
      },
      shiftAssignment: { findFirst: jest.fn().mockResolvedValue(null) },
      shift: { findFirst: jest.fn().mockResolvedValue({ id: 'shift-1', weeklyOffDays: [0, 6] }) },
    };
    return { prisma, service: newAttendanceService(prisma) };
  }

  const dates = (result: any) => result.dates.map((d: any) => d.date);

  it('offers a full-day absence to a full-day grant', async () => {
    const { service } = lookupHarness({
      grantDays: 1,
      absences: [{ date: AUG(17), status: 'ABSENT' }],
    });

    const result = await service.compOffEligibleDates(hrAdmin, 'grant-1');

    expect(dates(result)).toEqual(['2026-08-17']);
    expect(result.days).toBe(1);
  });

  it('offers a half-day absence to a half-day grant', async () => {
    const { service } = lookupHarness({
      grantDays: 0.5,
      absences: [{ date: AUG(17), status: 'HALF_DAY' }],
    });

    expect(dates(await service.compOffEligibleDates(hrAdmin, 'grant-1'))).toEqual(['2026-08-17']);
  });

  it('withholds a full-day absence from a half-day grant', async () => {
    const { service } = lookupHarness({
      grantDays: 0.5,
      absences: [{ date: AUG(17), status: 'ABSENT' }],
    });

    expect(dates(await service.compOffEligibleDates(hrAdmin, 'grant-1'))).toEqual([]);
  });

  it('withholds a half-day absence from a full-day grant', async () => {
    const { service } = lookupHarness({
      grantDays: 1,
      absences: [{ date: AUG(17), status: 'HALF_DAY' }],
    });

    expect(dates(await service.compOffEligibleDates(hrAdmin, 'grant-1'))).toEqual([]);
  });

  it('offers only the matching dates when the month holds a mix', async () => {
    const { service } = lookupHarness({
      grantDays: 1,
      absences: [
        { date: AUG(17), status: 'ABSENT' },
        { date: AUG(18), status: 'HALF_DAY' },
        { date: AUG(19), status: 'ABSENT' },
      ],
    });

    expect(dates(await service.compOffEligibleDates(hrAdmin, 'grant-1'))).toEqual([
      '2026-08-17',
      '2026-08-19',
    ]);
  });

  it('excludes a date another USED grant already covers', async () => {
    const { service } = lookupHarness({
      grantDays: 1,
      absences: [
        { date: AUG(17), status: 'ABSENT' },
        { date: AUG(19), status: 'ABSENT' },
      ],
      usedGrants: [{ usedOnDate: AUG(17) }],
    });

    expect(dates(await service.compOffEligibleDates(hrAdmin, 'grant-1'))).toEqual(['2026-08-19']);
  });

  it('excludes a weekly off even when it carries an absence', async () => {
    // 2026-08-16 is a Sunday.
    const { service } = lookupHarness({
      grantDays: 1,
      absences: [{ date: AUG(16), status: 'ABSENT' }],
    });

    expect(dates(await service.compOffEligibleDates(hrAdmin, 'grant-1'))).toEqual([]);
  });

  it('excludes a holiday even when it carries an absence', async () => {
    const { service } = lookupHarness({
      grantDays: 1,
      absences: [{ date: AUG(17), status: 'ABSENT' }],
      holidays: [AUG(17)],
    });

    expect(dates(await service.compOffEligibleDates(hrAdmin, 'grant-1'))).toEqual([]);
  });

  it('excludes every date when the month is not finalized', async () => {
    const { service } = lookupHarness({
      grantDays: 1,
      absences: [{ date: AUG(17), status: 'ABSENT' }],
      finalized: false,
    });

    expect(dates(await service.compOffEligibleDates(hrAdmin, 'grant-1'))).toEqual([]);
  });

  it('offers a full day built from unpaid leave', async () => {
    const { service } = lookupHarness({
      grantDays: 1,
      unpaidLeave: [{ days: 1, fromDate: AUG(17), toDate: AUG(17) }],
    });

    expect(dates(await service.compOffEligibleDates(hrAdmin, 'grant-1'))).toEqual(['2026-08-17']);
  });

  it('withholds a date whose sources sum past the grant duration', async () => {
    const { service } = lookupHarness({
      grantDays: 1,
      absences: [{ date: AUG(17), status: 'HALF_DAY' }],
      unpaidLeave: [{ days: 1, fromDate: AUG(17), toDate: AUG(17) }],
    });

    expect(dates(await service.compOffEligibleDates(hrAdmin, 'grant-1'))).toEqual([]);
  });

  it('reports an already-paid grant as unavailable rather than failing', async () => {
    const { service } = lookupHarness({ paidInPayrollRunId: 'run-9' });

    const result = await service.compOffEligibleDates(hrAdmin, 'grant-1');

    expect(result.dates).toEqual([]);
    expect(result.unavailableReason).toMatch(/no longer available/);
  });

  it('reports a used grant as unavailable rather than failing', async () => {
    const { service } = lookupHarness({ status: 'USED' });

    const result = await service.compOffEligibleDates(hrAdmin, 'grant-1');

    expect(result.dates).toEqual([]);
    expect(result.unavailableReason).toMatch(/no longer available/);
  });

  it('bounds a MONTHLY grant to its earned month', async () => {
    const { prisma, service } = lookupHarness({ grantDays: 1 });

    await service.compOffEligibleDates(hrAdmin, 'grant-1');

    const { date } = prisma.attendanceRecord.findMany.mock.calls[0][0].where;
    expect(date.gte.toISOString().slice(0, 10)).toBe('2026-08-01');
    expect(date.lte.toISOString().slice(0, 10)).toBe('2026-08-31');
  });

  it('bounds an ANNUAL grant to its earned year', async () => {
    const { prisma, service } = lookupHarness({ grantDays: 1, usagePeriod: 'ANNUAL' });

    await service.compOffEligibleDates(hrAdmin, 'grant-1');

    const { date } = prisma.attendanceRecord.findMany.mock.calls[0][0].where;
    expect(date.gte.toISOString().slice(0, 10)).toBe('2026-01-01');
    expect(date.lte.toISOString().slice(0, 10)).toBe('2026-12-31');
  });

  it('extends the window to expiresAt when carry-forward is enabled', async () => {
    const { prisma, service } = lookupHarness({
      grantDays: 1,
      carryForward: true,
      expiresAt: new Date(Date.UTC(2026, 9, 10)),
    });

    await service.compOffEligibleDates(hrAdmin, 'grant-1');

    const { date } = prisma.attendanceRecord.findMany.mock.calls[0][0].where;
    expect(date.lte.toISOString().slice(0, 10)).toBe('2026-10-10');
  });

  it('clamps the window to an enforced expiry inside the period', async () => {
    const { prisma, service } = lookupHarness({
      grantDays: 1,
      expiryTreatment: 'FORFEIT',
      expiresAt: AUG(20),
    });

    await service.compOffEligibleDates(hrAdmin, 'grant-1');

    const { date } = prisma.attendanceRecord.findMany.mock.calls[0][0].where;
    expect(date.lte.toISOString().slice(0, 10)).toBe('2026-08-20');
  });

  it('ignores an unenforced expiry inside the period, as the validator does', async () => {
    const { prisma, service } = lookupHarness({
      grantDays: 1,
      expiryTreatment: 'NOT_ENFORCED',
      expiresAt: AUG(20),
    });

    await service.compOffEligibleDates(hrAdmin, 'grant-1');

    const { date } = prisma.attendanceRecord.findMany.mock.calls[0][0].where;
    expect(date.lte.toISOString().slice(0, 10)).toBe('2026-08-31');
  });

  it('scopes every query to the caller tenant and the grant employee', async () => {
    const { prisma, service } = lookupHarness({ grantDays: 1 });

    await service.compOffEligibleDates(hrAdmin, 'grant-1');

    for (const call of [
      prisma.attendanceRecord.findMany.mock.calls[0][0],
      prisma.leaveRequest.findMany.mock.calls[0][0],
      prisma.compOffGrant.findMany.mock.calls[0][0],
    ]) {
      expect(call.where).toMatchObject({ tenantId: 'tenant-1', employeeId: 'emp-1' });
    }
  });

  it('refuses a grant from another tenant', async () => {
    const { prisma, service } = lookupHarness();
    prisma.compOffGrant.findFirst.mockResolvedValue(null);

    await expect(service.compOffEligibleDates(hrAdmin, 'grant-1')).rejects.toThrow(
      'Comp-off not found',
    );
  });
});

/**
 * Manual grant durations.
 *
 * Automatic earning has only ever produced 0.5 or 1 (`compOffDaysForStatus`); the manual form
 * accepted anything in [0.5, 2]. Under exact-duration usage a grant worth 0.75 is unusable by
 * construction - no date is ever worth 0.75 - so it would credit a balance the employee could
 * only be paid out for, never take as leave. Historical grants outside the set are left alone.
 */
describe('manual comp-off duration is restricted to half and full days', () => {
  function createHarness() {
    const prisma: Record<string, any> = {
      employee: { findFirst: jest.fn().mockResolvedValue({ id: 'emp-1', locationId: null }) },
      attendanceRecord: { findUnique: jest.fn().mockResolvedValue(null) },
      compOffGrant: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn((args: any) => Promise.resolve({ id: 'grant-1', ...args.data })),
      },
      payrollPolicy: {
        findFirst: jest.fn().mockResolvedValue({
          tenantId: 'tenant-1',
          locationId: null,
          compOffEnabled: true,
          compOffUsagePeriod: 'MONTHLY',
          compOffCarryForwardEnabled: false,
          compOffUnusedTreatment: 'PAY',
          compOffExpiryTreatment: 'NOT_ENFORCED',
          compOffExpiryDays: null,
        }),
      },
    };
    return { prisma, service: newAttendanceService(prisma) };
  }

  const credit = (service: AttendanceService, days?: number) =>
    service.createCompOff('tenant-1', {
      employeeId: 'emp-1',
      earnedDate: '2026-08-15',
      ...(days !== undefined && { days }),
    } as never);

  it.each([0.5, 1])('credits a %s-day grant', async (days) => {
    const { prisma, service } = createHarness();

    await credit(service, days);

    expect(prisma.compOffGrant.create.mock.calls[0][0].data.days).toBe(days);
  });

  it('defaults to a full day when no duration is given', async () => {
    const { prisma, service } = createHarness();

    await credit(service);

    expect(prisma.compOffGrant.create.mock.calls[0][0].data.days).toBe(1);
  });

  it.each([0.75, 1.5, 2, 0, -1, 3])('refuses %s at the service, not only the DTO', async (days) => {
    // The service is the one path every caller shares, so the check cannot live only at the
    // HTTP boundary.
    const { prisma, service } = createHarness();

    await expect(credit(service, days)).rejects.toThrow(
      /can only be credited as 0\.5 \(half day\) or 1 \(full day\)/,
    );
    expect(prisma.compOffGrant.create).not.toHaveBeenCalled();
  });
});
