import { AttendanceService } from './attendance.service';
import { ShiftResolutionService } from './shift-resolution.service';

/**
 * Both services share the same prisma double: `ShiftResolutionService` is the
 * single resolver attendance reads shifts and locations through, so stubbing it
 * separately would let the tests drift from production behaviour.
 */
function newAttendanceService(prisma: unknown): AttendanceService {
  return new AttendanceService(
    prisma as never,
    new ShiftResolutionService(prisma as never),
  );
}

type ExistingRecordFixture = {
  id: string;
  employeeId: string;
  date: Date;
  status: string;
  overtimeMinutes?: number | null;
  workingMinutes?: number | null;
  shift?: Record<string, unknown> | null;
};

/**
 * Minimal prisma double for `finalizeMonth`. `attendanceRecord.findMany` serves
 * three different shapes inside the method, so it dispatches on the requested
 * projection rather than returning one fixed payload.
 */
function buildFinalizeHarness(options: {
  employees?: Array<{ id: string; employeeCode: string; locationId: string | null }>;
  existing?: ExistingRecordFixture[];
  approvedLeaves?: Array<{ employeeId: string; fromDate: Date; toDate: Date }>;
  holidays?: Date[];
} = {}) {
  const employees = options.employees ?? [
    { id: 'emp-1', employeeCode: 'PH001', locationId: 'loc-b' },
  ];
  const existing = options.existing ?? [];
  const prisma = {
    employee: {
      count: jest.fn().mockResolvedValue(employees.length),
      findMany: jest.fn().mockResolvedValue(employees),
    },
    leaveRequest: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue(options.approvedLeaves ?? []),
    },
    holiday: {
      findMany: jest.fn().mockResolvedValue((options.holidays ?? []).map((date) => ({ date }))),
    },
    attendanceFinalization: {
      create: jest.fn().mockResolvedValue({ id: 'finalization-1' }),
    },
    attendanceRecord: {
      findMany: jest.fn((args: { select?: Record<string, unknown>; include?: unknown }) => {
        if (args.include) {
          return Promise.resolve(
            existing.map((record) => ({
              ...record,
              overtimeMinutes: record.overtimeMinutes ?? null,
              workingMinutes: record.workingMinutes ?? null,
              shift: record.shift ?? null,
            })),
          );
        }
        if (args.select?.id) {
          return Promise.resolve(
            existing.map(({ id, employeeId, date, status }) => ({ id, employeeId, date, status })),
          );
        }
        return Promise.resolve(
          existing.map((record) => ({
            status: record.status,
            isFinalized: false,
            overtimeMinutes: record.overtimeMinutes ?? null,
          })),
        );
      }),
      create: jest.fn().mockResolvedValue({}),
      // Applies the status change to the fixture so the later `include` read
      // sees post-reconciliation statuses, as the real query would.
      updateMany: jest.fn((args: { where: { id: { in: string[] } }; data: { status?: string } }) => {
        if (args.data.status) {
          for (const record of existing) {
            if (args.where.id.in.includes(record.id)) record.status = args.data.status;
          }
        }
        return Promise.resolve({ count: args.where.id.in.length });
      }),
    },
    payrollVariableInput: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue({}),
    },
    compOffGrant: { upsert: jest.fn().mockResolvedValue({}), findFirst: jest.fn() },
    shiftAssignment: { findFirst: jest.fn().mockResolvedValue(null) },
    shift: { findFirst: jest.fn().mockResolvedValue({ id: 'shift-1', weeklyOffDays: [0, 6] }) },
  };
  const service = newAttendanceService(prisma);
  const reconcileCall = () =>
    prisma.attendanceRecord.updateMany.mock.calls
      .map(([args]: [{ data: { status?: string } }]) => args)
      .find((args) => args.data.status === 'ON_LEAVE');
  return { prisma, service, reconcileCall };
}

describe('AttendanceService', () => {
  it('builds the complete attendance ledger for a selected date', async () => {
    const date = new Date('2026-07-05T00:00:00.000Z');
    const prisma = {
      employee: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'emp-1', firstName: 'A', lastName: 'One', employeeCode: 'PH001', department: null },
          { id: 'emp-2', firstName: 'B', lastName: 'Two', employeeCode: 'PH002', department: null },
          {
            id: 'emp-3',
            firstName: 'C',
            lastName: 'Three',
            employeeCode: 'PH003',
            department: null,
          },
        ]),
      },
      attendanceRecord: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            {
              id: 'record-1',
              employeeId: 'emp-1',
              date,
              status: 'PRESENT',
              punchIn: null,
              punchOut: null,
            },
          ]),
      },
      leaveRequest: {
        findMany: jest.fn().mockResolvedValue([{ employeeId: 'emp-2' }]),
      },
      shiftAssignment: { findFirst: jest.fn().mockResolvedValue(null) },
      shift: {
        findFirst: jest.fn().mockResolvedValue({ id: 'shift-1', weeklyOffDays: [0, 6] }),
      },
    };
    const service = newAttendanceService(prisma);

    const result = await service.forDate('tenant-1', date);

    expect(prisma.attendanceRecord.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', date },
    });
    expect(prisma.leaveRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          fromDate: { lte: date },
          toDate: { gte: date },
        }),
      }),
    );
    expect(result.summary).toEqual({ present: 1, late: 0, absent: 0, onLeave: 1, total: 3 });
    expect(result.rows.map((row) => row.status)).toEqual(['PRESENT', 'ON_LEAVE', 'WEEKEND']);
  });

  it('uses configured weekly offs after records and approved leave but before absence', async () => {
    const date = new Date('2026-07-05T00:00:00.000Z');
    const employees = ['emp-record', 'emp-leave', 'emp-weekend', 'emp-working'].map((id) => ({
      id,
      firstName: id,
      lastName: 'Employee',
      employeeCode: id,
      department: null,
    }));
    const prisma = {
      employee: { findMany: jest.fn().mockResolvedValue(employees) },
      attendanceRecord: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'record-1',
            employeeId: 'emp-record',
            date,
            status: 'PRESENT',
            punchIn: null,
            punchOut: null,
          },
        ]),
      },
      leaveRequest: { findMany: jest.fn().mockResolvedValue([{ employeeId: 'emp-leave' }]) },
      shiftAssignment: {
        findFirst: jest.fn().mockImplementation(({ where }: { where: { employeeId: string } }) =>
          Promise.resolve({
            shift: {
              id: `shift-${where.employeeId}`,
              weeklyOffDays: where.employeeId === 'emp-working' ? [] : [0],
            },
          }),
        ),
      },
      shift: { findFirst: jest.fn() },
    };
    const service = newAttendanceService(prisma);

    const result = await service.forDate('tenant-1', date);

    expect(result.rows.map((row) => row.status)).toEqual([
      'PRESENT',
      'ON_LEAVE',
      'WEEKEND',
      'ABSENT',
    ]);
    expect(result.summary.absent).toBe(1);
  });

  it('updates only weekly off days on a tenant shift', async () => {
    const prisma = {
      shift: {
        findFirst: jest.fn().mockResolvedValue({ id: 'shift-1' }),
        update: jest.fn().mockResolvedValue({ id: 'shift-1', weeklyOffDays: [0] }),
      },
    };
    const service = newAttendanceService(prisma);

    await expect(
      service.updateShiftWeeklyOffs('tenant-1', 'shift-1', { weeklyOffDays: [0] }),
    ).resolves.toEqual({ id: 'shift-1', weeklyOffDays: [0] });
    expect(prisma.shift.findFirst).toHaveBeenCalledWith({
      where: { id: 'shift-1', tenantId: 'tenant-1' },
    });
    expect(prisma.shift.update).toHaveBeenCalledWith({
      where: { id: 'shift-1' },
      data: { weeklyOffDays: [0] },
    });
  });

  it('imports biometric punches by employee code and reports unknown codes', async () => {
    const prisma = {
      employee: {
        findMany: jest.fn().mockResolvedValue([{ id: 'emp-1', employeeCode: 'PH001', locationId: null }]),
        findFirst: jest.fn().mockResolvedValue({ locationId: null }),
      },
      shiftAssignment: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      shift: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'shift-1',
          startTime: '09:00',
          endTime: '18:00',
          overtimeAfterMinutes: 480,
          halfDayAfterMinutes: 240,
          minWorkingMinutes: 480,
        }),
      },
      attendanceRecord: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      attendanceCaptureSetting: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      attendanceRule: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = newAttendanceService(prisma);

    await expect(
      service.importBiometricPunches('tenant-1', {
        rows: [
          {
            employeeCode: 'PH001',
            date: '2026-07-05',
            punchIn: new Date(2026, 6, 5, 9, 30).toISOString(),
            punchOut: new Date(2026, 6, 5, 18, 15).toISOString(),
            deviceId: 'bio-1',
          },
          { employeeCode: 'MISSING', date: '2026-07-05' },
        ],
      }),
    ).resolves.toEqual({
      imported: 1,
      skipped: 1,
      unknownEmployeeCodes: ['MISSING'],
      errors: [
        { row: 2, employeeCode: 'MISSING', date: '2026-07-05', error: 'Employee code not found' },
      ],
    });
    expect(prisma.attendanceRecord.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        employeeId: 'emp-1',
        shiftId: 'shift-1',
        punchSource: 'BIOMETRIC',
        workingMinutes: 525,
        // 15 minutes past the 18:00 shift end.
        overtimeMinutes: 15,
        isFinalized: true,
      }),
    }));
  });

  it('imports API attendance rows as finalized API source records', async () => {
    const prisma = {
      employee: {
        findMany: jest.fn().mockResolvedValue([{ id: 'emp-1', employeeCode: 'PH001', locationId: null }]),
        findFirst: jest.fn().mockResolvedValue({ locationId: null }),
      },
      shiftAssignment: { findFirst: jest.fn().mockResolvedValue(null) },
      shift: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'shift-1',
          overtimeAfterMinutes: 540,
          halfDayAfterMinutes: 240,
          minWorkingMinutes: 480,
        }),
      },
      attendanceRecord: { upsert: jest.fn().mockResolvedValue({}) },
      attendanceCaptureSetting: { findFirst: jest.fn().mockResolvedValue(null) },
      attendanceRule: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = newAttendanceService(prisma);

    await service.importAttendanceRows('tenant-1', {
      rows: [{
        employeeCode: 'PH001',
        date: '2026-07-05',
        punchIn: '2026-07-05T09:00:00.000Z',
        punchOut: '2026-07-05T17:30:00.000Z',
      }],
    }, 'API');

    expect(prisma.attendanceRecord.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        punchSource: 'API',
        status: 'PRESENT',
        isFinalized: true,
      }),
    }));
  });

  describe('check-out reclassifies the finished day', () => {
    const user = { tenantId: 'tenant-1', employeeId: 'emp-1' } as never;
    const device = { deviceId: 'device-1' } as never;
    /** 09:00-18:00 less a 60 minute break: 480 full day, 240 half day. */
    const shift = {
      id: 'shift-1',
      startTime: '09:00',
      endTime: '18:00',
      gracePeriodMins: 15,
      earlyLeavingGraceMins: 15,
      breakDurationMins: 60,
      minWorkingMinutes: 480,
      halfDayAfterMinutes: 240,
      weeklyOffDays: [0, 6],
    };
    /** Wall-clock on Wednesday 15 July 2026. */
    const at = (hour: number, minute: number) => new Date(2026, 6, 15, hour, minute, 0, 0);

    /**
     * Persists what the punch path writes, so check-out reads back the row
     * check-in created and the ledger reads back the row check-out finished.
     * Stubbing each call in isolation is what let a stale status survive.
     */
    function punchHarness(options?: { rule?: Record<string, any> | null }) {
      const records = new Map<string, Record<string, any>>();
      const devices = new Map<string, Record<string, any>>();
      let seq = 0;
      const key = (employeeId: string, date: Date) => `${employeeId}|${date.toISOString()}`;
      return {
        employee: {
          findFirst: jest.fn().mockResolvedValue({ locationId: null, workMode: 'REMOTE' }),
          findMany: jest
            .fn()
            .mockResolvedValue([{ id: 'emp-1', employeeCode: 'PH001', locationId: null }]),
        },
        shiftAssignment: {
          findFirst: jest.fn().mockResolvedValue(null),
          findMany: jest.fn().mockResolvedValue([]),
        },
        shift: { findFirst: jest.fn().mockResolvedValue(shift) },
        attendanceCaptureSetting: { findFirst: jest.fn().mockResolvedValue(null) },
        attendanceRule: {
          findFirst: jest.fn().mockResolvedValue(options?.rule ?? null),
          findMany: jest.fn().mockResolvedValue(options?.rule ? [options.rule] : []),
        },
        holiday: { findMany: jest.fn().mockResolvedValue([]) },
        leaveRequest: { findMany: jest.fn().mockResolvedValue([]) },
        employeeDevice: {
          findUnique: jest.fn(({ where }: { where: Record<string, any> }) =>
            Promise.resolve(where.employeeId ? (devices.get(where.employeeId) ?? null) : null),
          ),
          create: jest.fn(({ data }: { data: Record<string, any> }) => {
            devices.set(data.employeeId, { ...data });
            return Promise.resolve(data);
          }),
          update: jest.fn(({ where, data }: { where: any; data: any }) => {
            const bound = { ...devices.get(where.employeeId), ...data };
            devices.set(where.employeeId, bound);
            return Promise.resolve(bound);
          }),
        },
        attendanceRecord: {
          findUnique: jest.fn(({ where }: { where: any }) =>
            Promise.resolve(
              records.get(key(where.employeeId_date.employeeId, where.employeeId_date.date)) ?? null,
            ),
          ),
          upsert: jest.fn(({ where, create, update }: { where: any; create: any; update: any }) => {
            const k = key(where.employeeId_date.employeeId, where.employeeId_date.date);
            const existing = records.get(k);
            const row = existing ? { ...existing, ...update } : { id: `rec-${++seq}`, ...create };
            records.set(k, row);
            return Promise.resolve(row);
          }),
          update: jest.fn(({ where, data }: { where: any; data: any }) => {
            for (const [k, row] of records) {
              if (row.id === where.id) {
                const next = { ...row, ...data };
                records.set(k, next);
                return Promise.resolve(next);
              }
            }
            return Promise.resolve(null);
          }),
          findMany: jest.fn(() => Promise.resolve([...records.values()])),
        },
      };
    }

    /** The real interactive flow: punch in, wait, punch out. */
    async function workDay(
      service: AttendanceService,
      punchIn: Date,
      punchOut: Date,
    ): Promise<Record<string, any>> {
      jest.setSystemTime(punchIn);
      await service.checkIn(user, device);
      jest.setSystemTime(punchOut);
      return (await service.checkOut(user, device)) as never;
    }

    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('marks a ten minute day ABSENT instead of leaving the check-in PRESENT', async () => {
      const prisma = punchHarness();
      const service = newAttendanceService(prisma);

      jest.setSystemTime(at(9, 0));
      const afterCheckIn = (await service.checkIn(user, device)) as never as { status: string };
      // The punch-in can only guess, and it guesses PRESENT — the bug was that
      // nothing ever revisited that guess.
      expect(afterCheckIn.status).toBe('PRESENT');

      jest.setSystemTime(at(9, 10));
      const record = (await service.checkOut(user, device)) as never as {
        status: string;
        workingMinutes: number;
      };

      expect(record.workingMinutes).toBe(10);
      expect(record.status).toBe('ABSENT');
    });

    it('marks a ten minute day ABSENT even when the check-in was late', async () => {
      const service = newAttendanceService(punchHarness());
      const record = await workDay(service, at(9, 30), at(9, 40));
      expect(record).toMatchObject({ workingMinutes: 10, status: 'ABSENT' });
    });

    it('marks a 300 minute day HALF_DAY on time and late alike', async () => {
      const onTime = await workDay(newAttendanceService(punchHarness()), at(9, 0), at(14, 0));
      expect(onTime).toMatchObject({ workingMinutes: 300, status: 'HALF_DAY' });

      const late = await workDay(newAttendanceService(punchHarness()), at(9, 30), at(14, 30));
      expect(late).toMatchObject({ workingMinutes: 300, status: 'HALF_DAY' });
    });

    it('keeps PRESENT for a full day started on time', async () => {
      const record = await workDay(newAttendanceService(punchHarness()), at(9, 0), at(17, 0));
      expect(record).toMatchObject({ workingMinutes: 480, status: 'PRESENT' });
    });

    it('preserves LATE for a full day started late', async () => {
      const record = await workDay(newAttendanceService(punchHarness()), at(9, 30), at(18, 30));
      expect(record).toMatchObject({ workingMinutes: 540, status: 'LATE' });
    });

    describe('derived values match every other write path', () => {
      /** Only the values the summary, preview and finalization read back. */
      const derived = (row: Record<string, any>) => ({
        shiftId: row.shiftId,
        workingMinutes: row.workingMinutes,
        overtimeMinutes: row.overtimeMinutes,
        status: row.status,
      });

      it('banks overtime for a punch-out past the shift end', async () => {
        const record = await workDay(newAttendanceService(punchHarness()), at(9, 0), at(19, 30));
        // 18:00 shift end, so 90 minutes past it.
        expect(derived(record)).toEqual({
          shiftId: 'shift-1',
          workingMinutes: 630,
          overtimeMinutes: 90,
          status: 'PRESENT',
        });
      });

      it('banks no overtime for clocking off at or before the shift end', async () => {
        const atEnd = await workDay(newAttendanceService(punchHarness()), at(9, 0), at(18, 0));
        expect(atEnd.overtimeMinutes).toBe(0);
        const early = await workDay(newAttendanceService(punchHarness()), at(9, 0), at(17, 30));
        expect(early.overtimeMinutes).toBe(0);
      });

      it('writes the same derived values as importing the identical punches', async () => {
        // The consistency this whole change is about: one attendance day must
        // not depend on whether it arrived by punch or by file.
        const punched = await workDay(newAttendanceService(punchHarness()), at(9, 0), at(19, 30));

        const importPrisma = punchHarness();
        await newAttendanceService(importPrisma).importAttendanceRows(
          'tenant-1',
          {
            rows: [
              {
                employeeCode: 'PH001',
                date: '2026-07-15',
                punchIn: at(9, 0).toISOString(),
                punchOut: at(19, 30).toISOString(),
              },
            ],
          },
          'MANUAL',
        );
        const imported = importPrisma.attendanceRecord.upsert.mock.calls[0][0].create;

        expect(derived(punched)).toEqual(derived(imported));
      });

      it('persists the shift the status and overtime were derived from', async () => {
        const prisma = punchHarness();
        const service = newAttendanceService(prisma);
        await workDay(service, at(9, 0), at(19, 30));
        const [{ data }] = prisma.attendanceRecord.update.mock.calls.at(-1) as [{ data: any }];
        expect(data.shiftId).toBe('shift-1');
      });

      it('surfaces interactive overtime in the monthly summary', async () => {
        const service = newAttendanceService(punchHarness());
        await workDay(service, at(9, 0), at(19, 30));

        const ledger = await service.monthlyLedgerFor('tenant-1', 'emp-1', '2026-07');

        // Before this, a punched day contributed nothing to the overtime the
        // summary, finalization preview and finalization all read.
        expect(ledger.counts.overtimeMinutes).toBe(90);
        const day = ledger.days.find((d) => d.date.toISOString().slice(0, 10) === '2026-07-15');
        expect(day).toMatchObject({ overtimeMinutes: 90, status: 'PRESENT' });
      });

      /**
       * Imports the same two punches the interactive flow used, with no status
       * column, and returns what the row import would store.
       */
      async function importPunches(
        punchIn: Date,
        punchOut: Date | null,
        options?: { rule?: Record<string, any> | null },
      ): Promise<Record<string, any>> {
        const prisma = punchHarness(options);
        await newAttendanceService(prisma).importAttendanceRows(
          'tenant-1',
          {
            rows: [
              {
                employeeCode: 'PH001',
                date: '2026-07-15',
                punchIn: punchIn.toISOString(),
                ...(punchOut ? { punchOut: punchOut.toISOString() } : {}),
              },
            ],
          },
          'MANUAL',
        );
        return prisma.attendanceRecord.upsert.mock.calls[0][0].create;
      }

      // Shift starts 09:00 with a 15 minute grace: 09:15 is on time, 09:16 late.
      const parity: Array<[string, Date, Date, string]> = [
        ['a full day started on time', at(9, 0), at(17, 0), 'PRESENT'],
        ['a full day started exactly on the grace boundary', at(9, 15), at(17, 15), 'PRESENT'],
        ['a full day started one minute past the grace', at(9, 16), at(17, 16), 'LATE'],
        ['a long day started late', at(9, 30), at(18, 30), 'LATE'],
        ['a half day started on time', at(9, 0), at(14, 0), 'HALF_DAY'],
        ['a half day started late', at(9, 30), at(14, 30), 'HALF_DAY'],
        ['a ten minute day started late', at(9, 30), at(9, 40), 'ABSENT'],
      ];

      it.each(parity)(
        'imports %s with the same status the punch path produces',
        async (_label, punchIn, punchOut, expected) => {
          const punched = await workDay(newAttendanceService(punchHarness()), punchIn, punchOut);
          const imported = await importPunches(punchIn, punchOut);

          expect(imported.status).toBe(expected);
          expect(punched.status).toBe(expected);
        },
      );

      it('applies the attendance rule grace to an import exactly as to a punch', async () => {
        // A rule with no grace makes 09:05 late; the shift's own 15 minutes would not.
        const rule = { lateMarkAfterMins: 0, earlyLeavingGraceMins: 15 };
        const punched = await workDay(
          newAttendanceService(punchHarness({ rule })),
          at(9, 5),
          at(17, 5),
        );
        const imported = await importPunches(at(9, 5), at(17, 5), { rule });

        expect(punched.status).toBe('LATE');
        expect(imported.status).toBe('LATE');
      });

      it('leaves a status supplied in the file untouched', async () => {
        const prisma = punchHarness();
        await newAttendanceService(prisma).importAttendanceRows(
          'tenant-1',
          {
            rows: [
              {
                employeeCode: 'PH001',
                date: '2026-07-15',
                punchIn: at(9, 30).toISOString(),
                punchOut: at(18, 30).toISOString(),
                status: 'PRESENT' as never,
              },
            ],
          },
          'MANUAL',
        );
        expect(prisma.attendanceRecord.upsert.mock.calls[0][0].create.status).toBe('PRESENT');
      });

      it('still reports a punch-in with no punch-out as MISSING_PUNCH, however late', async () => {
        const imported = await importPunches(at(11, 0), null);
        expect(imported).toMatchObject({ status: 'MISSING_PUNCH', workingMinutes: undefined });
      });

      it('derives a different status per row for a file with no status column', async () => {
        // What a CSV upload sends once the browser stops defaulting every blank
        // status to PRESENT: no `status` key at all on any row.
        const prisma = punchHarness();
        await newAttendanceService(prisma).importAttendanceRows(
          'tenant-1',
          {
            rows: [
              { employeeCode: 'PH001', date: '2026-07-15', punchIn: at(9, 0).toISOString(), punchOut: at(17, 0).toISOString() },
              { employeeCode: 'PH001', date: '2026-07-16', punchIn: at(9, 30).toISOString(), punchOut: at(18, 30).toISOString() },
              { employeeCode: 'PH001', date: '2026-07-17', punchIn: at(9, 0).toISOString(), punchOut: at(14, 0).toISOString() },
              { employeeCode: 'PH001', date: '2026-07-18', punchIn: at(9, 0).toISOString(), punchOut: at(9, 10).toISOString() },
              { employeeCode: 'PH001', date: '2026-07-19', punchIn: at(9, 0).toISOString() },
            ] as never,
          },
          'MANUAL',
        );

        const statuses = prisma.attendanceRecord.upsert.mock.calls.map(
          ([args]: [{ create: { status: string } }]) => args.create.status,
        );
        expect(statuses).toEqual(['PRESENT', 'LATE', 'HALF_DAY', 'ABSENT', 'MISSING_PUNCH']);
      });

      it('completes a regularized day with its shift and overtime', async () => {
        const prisma = punchHarness();
        const service = newAttendanceService(prisma);

        await service.applyRegularization('tenant-1', 'emp-1', {
          date: new Date(Date.UTC(2026, 6, 15)),
          punchIn: at(9, 0),
          punchOut: at(19, 30),
          reason: 'Forgot to punch out',
        });

        const [{ create }] = prisma.attendanceRecord.upsert.mock.calls[0] as [{ create: any }];
        expect(create).toMatchObject({
          shiftId: 'shift-1',
          workingMinutes: 630,
          overtimeMinutes: 90,
          // Unchanged: a regularization asserts the day was worked.
          status: 'PRESENT',
        });
      });
    });

    it('has the monthly ledger count the ten minute day as an absence', async () => {
      const prisma = punchHarness();
      const service = newAttendanceService(prisma);
      await workDay(service, at(9, 0), at(9, 10));

      // Still 15 July, so the ledger window clamps to today.
      const ledger = await service.monthlyLedgerFor('tenant-1', 'emp-1', '2026-07');

      const day = ledger.days.find((d) => d.date.toISOString().slice(0, 10) === '2026-07-15');
      expect(day).toMatchObject({ status: 'ABSENT', source: 'RECORD', workingMinutes: 10 });
      // 01-15 July less four weekend days is 11 attendable days, none attended.
      expect(ledger.counts).toMatchObject({
        expectedWorkingDays: 11,
        present: 0,
        halfDay: 0,
        absent: 11,
        attendancePercentage: 0,
      });
    });
  });

  describe('shift-relative half day and overtime', () => {
    /** Shift times are wall-clock, so punches are built in the server's zone. */
    const punchAt = (day: number, hour: number, minute: number) =>
      new Date(2026, 6, day, hour, minute, 0, 0).toISOString();

    function importPrisma(shift: Record<string, unknown> | null) {
      return {
        employee: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ id: 'emp-1', employeeCode: 'PH001', locationId: null }]),
          findFirst: jest.fn().mockResolvedValue({ locationId: null }),
        },
        shiftAssignment: { findFirst: jest.fn().mockResolvedValue(null) },
        shift: { findFirst: jest.fn().mockResolvedValue(shift) },
        attendanceRecord: { upsert: jest.fn().mockResolvedValue({}) },
        attendanceCaptureSetting: { findFirst: jest.fn().mockResolvedValue(null) },
        attendanceRule: { findFirst: jest.fn().mockResolvedValue(null) },
      };
    }

    /**
     * `breakDurationMins` is spelled out on every fixture rather than inherited,
     * because it is what makes each expected threshold below add up:
     * `minWorking = span - break`, `halfDay = floor(minWorking / 2)`.
     *
     * `overtimeAfterMinutes`, `halfDayAfterMinutes` and `minWorkingMinutes` are
     * carried deliberately and must have no effect on either calculation now.
     */
    const dayShift = {
      id: 'shift-day',
      startTime: '09:00',
      endTime: '18:00',
      breakDurationMins: 60, // 540 span - 60 = 480 full day, 240 half day
      overtimeAfterMinutes: 480,
      halfDayAfterMinutes: 240,
      minWorkingMinutes: 480,
    };
    const nightShift = {
      ...dayShift,
      id: 'shift-night',
      startTime: '22:00',
      endTime: '06:00',
      breakDurationMins: 60, // 480 span - 60 = 420 full day, 210 half day
    };
    const splitShift = {
      ...dayShift,
      id: 'shift-split',
      startTime: '08:00',
      endTime: '20:00',
      breakDurationMins: 60, // 720 span - 60 = 660 full day, 330 half day
    };

    async function importOne(
      shift: Record<string, unknown> | null,
      row: { punchIn?: string; punchOut?: string; date?: string },
    ) {
      const prisma = importPrisma(shift);
      const service = newAttendanceService(prisma);
      await service.importAttendanceRows(
        'tenant-1',
        { rows: [{ employeeCode: 'PH001', date: row.date ?? '2026-07-06', ...row }] },
        'MANUAL',
      );
      return prisma.attendanceRecord.upsert.mock.calls[0][0].create;
    }

    it('bills nothing for clocking off at the shift end, break and threshold ignored', async () => {
      await expect(
        importOne(dayShift, { punchIn: punchAt(6, 9, 0), punchOut: punchAt(6, 18, 0) }),
      ).resolves.toMatchObject({ workingMinutes: 540, overtimeMinutes: 0, status: 'PRESENT' });
    });

    it('bills nothing for clocking off before the shift end', async () => {
      await expect(
        importOne(dayShift, { punchIn: punchAt(6, 9, 0), punchOut: punchAt(6, 17, 30) }),
      ).resolves.toMatchObject({ overtimeMinutes: 0 });
    });

    it('bills every minute past the shift end', async () => {
      // Previously 630 gross - 60 break - 480 threshold = 90; now 90 past 18:00.
      await expect(
        importOne(dayShift, { punchIn: punchAt(6, 9, 0), punchOut: punchAt(6, 19, 30) }),
      ).resolves.toMatchObject({ workingMinutes: 630, overtimeMinutes: 90 });
    });

    it('bills an overnight shift from the morning it ends', async () => {
      await expect(
        importOne(nightShift, { punchIn: punchAt(6, 22, 0), punchOut: punchAt(7, 7, 30) }),
      ).resolves.toMatchObject({ workingMinutes: 570, overtimeMinutes: 90 });
    });

    it('scales the half day mark to the shift length instead of a fixed 240', async () => {
      // 720 span - 60 break = 660 full day, so half of it is 330 — not the 240
      // every shift used to be measured against.
      await expect(
        importOne(splitShift, { punchIn: punchAt(6, 8, 0), punchOut: punchAt(6, 13, 0) }),
      ).resolves.toMatchObject({ workingMinutes: 300, status: 'ABSENT' });
      await expect(
        importOne(splitShift, { punchIn: punchAt(6, 8, 0), punchOut: punchAt(6, 14, 30) }),
      ).resolves.toMatchObject({ workingMinutes: 390, status: 'HALF_DAY' });
      await expect(
        importOne(splitShift, { punchIn: punchAt(6, 8, 0), punchOut: punchAt(6, 19, 0) }),
      ).resolves.toMatchObject({ workingMinutes: 660, status: 'PRESENT' });
    });

    it('scales the half day mark off an overnight shift true length', async () => {
      // 480 span - 60 break = 420 full day, so half of it is 210.
      await expect(
        importOne(nightShift, { punchIn: punchAt(6, 22, 0), punchOut: punchAt(7, 1, 0) }),
      ).resolves.toMatchObject({ workingMinutes: 180, status: 'ABSENT' });
      await expect(
        importOne(nightShift, { punchIn: punchAt(6, 22, 0), punchOut: punchAt(7, 3, 0) }),
      ).resolves.toMatchObject({ workingMinutes: 300, status: 'HALF_DAY' });
      await expect(
        importOne(nightShift, { punchIn: punchAt(6, 22, 0), punchOut: punchAt(7, 5, 0) }),
      ).resolves.toMatchObject({ workingMinutes: 420, status: 'PRESENT' });
    });

    it('keeps the break slack a working day has, so slight lateness is not a half day', async () => {
      // 540 span - 60 break = 480 full day: the historical mark. A 09:30 start
      // is past the 15 minute grace, so this is a full day qualified as LATE —
      // the point being that it is not docked to HALF_DAY.
      await expect(
        importOne(dayShift, { punchIn: punchAt(6, 9, 30), punchOut: punchAt(6, 18, 15) }),
      ).resolves.toMatchObject({ workingMinutes: 525, status: 'LATE' });
      await expect(
        importOne(dayShift, { punchIn: punchAt(6, 9, 0), punchOut: punchAt(6, 17, 0) }),
      ).resolves.toMatchObject({ workingMinutes: 480, status: 'PRESENT' });
      await expect(
        importOne(dayShift, { punchIn: punchAt(6, 9, 0), punchOut: punchAt(6, 16, 59) }),
      ).resolves.toMatchObject({ workingMinutes: 479, status: 'HALF_DAY' });
    });

    it('records a missing punch-out with no status guess and no overtime', async () => {
      await expect(importOne(dayShift, { punchIn: punchAt(6, 9, 0) })).resolves.toMatchObject({
        status: 'MISSING_PUNCH',
        workingMinutes: undefined,
        overtimeMinutes: undefined,
      });
    });

    it('falls back to the eight hour marks when no shift resolves', async () => {
      await expect(
        importOne(null, { punchIn: punchAt(6, 9, 0), punchOut: punchAt(6, 17, 0) }),
      ).resolves.toMatchObject({
        workingMinutes: 480,
        status: 'PRESENT',
        overtimeMinutes: undefined,
      });
    });
  });

  it('blocks imports when the capture mode is disabled', async () => {
    const prisma = {
      employee: {
        findMany: jest.fn().mockResolvedValue([{ id: 'emp-1', employeeCode: 'PH001', locationId: null }]),
        findFirst: jest.fn().mockResolvedValue({ locationId: null }),
      },
      attendanceCaptureSetting: {
        findFirst: jest.fn().mockResolvedValue({
          enabled: false,
          requiresGps: false,
          requiresGeofence: false,
        }),
      },
      attendanceRecord: { upsert: jest.fn() },
      shiftAssignment: { findFirst: jest.fn() },
      shift: { findFirst: jest.fn() },
    };
    const service = newAttendanceService(prisma);

    await expect(
      service.importBiometricPunches('tenant-1', {
        rows: [{ employeeCode: 'PH001', date: '2026-07-05' }],
      }),
    ).rejects.toThrow('BIOMETRIC attendance capture is disabled by HR');
    expect(prisma.attendanceRecord.upsert).not.toHaveBeenCalled();
  });

  it('edits unfinalized manual attendance records', async () => {
    const prisma = {
      attendanceRecord: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'record-1',
          tenantId: 'tenant-1',
          employeeId: 'emp-1',
          date: new Date('2026-07-05T00:00:00.000Z'),
          status: 'PRESENT',
          punchIn: new Date('2026-07-05T09:00:00.000Z'),
          punchOut: new Date('2026-07-05T18:00:00.000Z'),
          punchSource: 'MANUAL',
          remarks: 'MANUAL import',
          isFinalized: false,
          employee: { id: 'emp-1', locationId: null },
        }),
        update: jest.fn().mockResolvedValue({ id: 'record-1' }),
      },
      shiftAssignment: { findFirst: jest.fn().mockResolvedValue(null) },
      shift: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'shift-1',
          startTime: '09:00',
          endTime: '18:00',
          overtimeAfterMinutes: 480,
          halfDayAfterMinutes: 240,
          minWorkingMinutes: 480,
        }),
      },
    };
    const service = newAttendanceService(prisma);

    // Wall-clock punches: the shift end they are measured against is local.
    const punchIn = new Date(2026, 6, 5, 9, 30, 0, 0);
    const punchOut = new Date(2026, 6, 5, 18, 30, 0, 0);
    await service.updateRecord('tenant-1', 'record-1', {
      punchIn: punchIn.toISOString(),
      punchOut: punchOut.toISOString(),
    });

    expect(prisma.attendanceRecord.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'record-1' },
      data: expect.objectContaining({
        punchIn,
        punchOut,
        workingMinutes: 540,
        // 30 minutes past the 18:00 shift end.
        overtimeMinutes: 30,
        status: 'PRESENT',
      }),
    }));
  });

  it('blocks editing finalized attendance records', async () => {
    const prisma = {
      attendanceRecord: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'record-1',
          tenantId: 'tenant-1',
          isFinalized: true,
          employee: { id: 'emp-1', locationId: null },
        }),
        update: jest.fn(),
      },
    };
    const service = newAttendanceService(prisma);

    await expect(
      service.updateRecord('tenant-1', 'record-1', { status: 'ABSENT' }),
    ).rejects.toThrow('Finalized attendance cannot be edited');
    expect(prisma.attendanceRecord.update).not.toHaveBeenCalled();
  });

  describe('finalization reconciles approved leave with absence records', () => {
    const leaveDate = new Date(Date.UTC(2026, 6, 8));
    const approvedLeave = [
      { employeeId: 'emp-1', fromDate: leaveDate, toDate: leaveDate },
    ];

    // HALF_DAY is a partial absence: leaving it in place bills its 0.5 attendance
    // LOP day on top of the leave itself, so approved leave supersedes it too.
    it.each(['ABSENT', 'MISSING_PUNCH', 'HALF_DAY'])(
      'turns an existing %s record covered by approved leave into ON_LEAVE',
      async (status) => {
        const { service, reconcileCall } = buildFinalizeHarness({
          existing: [{ id: 'record-1', employeeId: 'emp-1', date: leaveDate, status }],
          approvedLeaves: approvedLeave,
        });

        await service.finalizeMonth('tenant-1', 'hr-1', { month: '2026-07' });

        expect(reconcileCall()).toEqual({
          where: { id: { in: ['record-1'] } },
          data: { status: 'ON_LEAVE' },
        });
      },
    );

    it('preserves the punch trail of a reconciled half day', async () => {
      const { service, prisma } = buildFinalizeHarness({
        existing: [
          {
            id: 'record-1',
            employeeId: 'emp-1',
            date: leaveDate,
            status: 'HALF_DAY',
            workingMinutes: 300,
            overtimeMinutes: 0,
          },
        ],
        approvedLeaves: approvedLeave,
      });

      await service.finalizeMonth('tenant-1', 'hr-1', { month: '2026-07' });

      const reconcile = prisma.attendanceRecord.updateMany.mock.calls
        .map(([args]: [{ data: Record<string, unknown> }]) => args)
        .find((args) => args.data.status === 'ON_LEAVE');
      expect(Object.keys(reconcile?.data ?? {})).toEqual(['status']);
    });

    it.each(['PRESENT', 'LATE'])(
      'leaves a worked %s record untouched',
      async (status) => {
        const { service, reconcileCall } = buildFinalizeHarness({
          existing: [{ id: 'record-1', employeeId: 'emp-1', date: leaveDate, status }],
          approvedLeaves: approvedLeave,
        });

        await service.finalizeMonth('tenant-1', 'hr-1', { month: '2026-07' });

        expect(reconcileCall()).toBeUndefined();
      },
    );

    it('only reconciles the days the approved leave actually covers', async () => {
      const { service, reconcileCall } = buildFinalizeHarness({
        existing: [
          { id: 'record-leave', employeeId: 'emp-1', date: leaveDate, status: 'ABSENT' },
          {
            id: 'record-real-absence',
            employeeId: 'emp-1',
            date: new Date(Date.UTC(2026, 6, 15)),
            status: 'ABSENT',
          },
        ],
        approvedLeaves: approvedLeave,
      });

      await service.finalizeMonth('tenant-1', 'hr-1', { month: '2026-07' });

      expect(reconcileCall()).toEqual({
        where: { id: { in: ['record-leave'] } },
        data: { status: 'ON_LEAVE' },
      });
    });

    it('reads only approved leave for the finalized tenant and employees', async () => {
      const { service, prisma, reconcileCall } = buildFinalizeHarness({
        existing: [{ id: 'record-1', employeeId: 'emp-1', date: leaveDate, status: 'ABSENT' }],
        approvedLeaves: [],
      });

      await service.finalizeMonth('tenant-1', 'hr-1', { month: '2026-07' });

      expect(prisma.leaveRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'tenant-1',
            status: 'APPROVED',
            employeeId: { in: ['emp-1'] },
          }),
        }),
      );
      expect(reconcileCall()).toBeUndefined();
    });

    // Consequence of reconciling HALF_DAY: shift allowance is granted for
    // PRESENT/LATE/HALF_DAY only, so a half day superseded by leave stops
    // earning it. Pinned here so the trade-off stays visible.
    it('stops granting shift allowance for a half day superseded by leave', async () => {
      const allowanceShift = {
        id: 'shift-1',
        overtimeAfterMinutes: 480,
        halfDayAfterMinutes: 240,
        minWorkingMinutes: 480,
        shiftAllowanceAmount: 300,
        compOffEligible: false,
      };
      const { service, prisma } = buildFinalizeHarness({
        existing: [
          { id: 'record-1', employeeId: 'emp-1', date: leaveDate, status: 'HALF_DAY', workingMinutes: 300, shift: allowanceShift },
        ],
        approvedLeaves: approvedLeave,
      });

      await service.finalizeMonth('tenant-1', 'hr-1', { month: '2026-07' });

      const allowanceInputs = prisma.payrollVariableInput.create.mock.calls.filter(
        ([args]: [{ data: { type: string } }]) => args.data.type === 'SHIFT_ALLOWANCE',
      );
      expect(allowanceInputs).toHaveLength(0);
    });

    it('still grants shift allowance for a worked day that leave does not cover', async () => {
      const allowanceShift = {
        id: 'shift-1',
        overtimeAfterMinutes: 480,
        halfDayAfterMinutes: 240,
        minWorkingMinutes: 480,
        shiftAllowanceAmount: 300,
        compOffEligible: false,
      };
      const { service, prisma } = buildFinalizeHarness({
        existing: [
          { id: 'record-1', employeeId: 'emp-1', date: new Date(Date.UTC(2026, 6, 15)), status: 'HALF_DAY', workingMinutes: 300, shift: allowanceShift },
        ],
        approvedLeaves: approvedLeave,
      });

      await service.finalizeMonth('tenant-1', 'hr-1', { month: '2026-07' });

      expect(prisma.payrollVariableInput.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'SHIFT_ALLOWANCE', amount: 300 }),
        }),
      );
    });

    it('ignores approved leave belonging to an employee outside the finalization', async () => {
      const { service, reconcileCall } = buildFinalizeHarness({
        existing: [{ id: 'record-1', employeeId: 'emp-1', date: leaveDate, status: 'ABSENT' }],
        approvedLeaves: [{ employeeId: 'emp-other', fromDate: leaveDate, toDate: leaveDate }],
      });

      await service.finalizeMonth('tenant-1', 'hr-1', { month: '2026-07' });

      expect(reconcileCall()).toBeUndefined();
    });
  });

  describe('finalization scopes payroll input cleanup to its own employees', () => {
    it('deletes only attendance-sourced inputs for the finalized employees', async () => {
      const { service, prisma } = buildFinalizeHarness({
        employees: [
          { id: 'emp-b1', employeeCode: 'PHB1', locationId: 'loc-b' },
          { id: 'emp-b2', employeeCode: 'PHB2', locationId: 'loc-b' },
        ],
      });

      await service.finalizeMonth('tenant-1', 'hr-1', { month: '2026-07', locationId: 'loc-b' });

      expect(prisma.payrollVariableInput.deleteMany).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-1',
          month: 7,
          year: 2026,
          source: 'ATTENDANCE',
          type: { in: ['OVERTIME', 'SHIFT_ALLOWANCE'] },
          employeeId: { in: ['emp-b1', 'emp-b2'] },
        },
      });
    });

    it('regenerates the finalized location overtime input after the scoped delete', async () => {
      const { service, prisma } = buildFinalizeHarness({
        employees: [{ id: 'emp-b1', employeeCode: 'PHB1', locationId: 'loc-b' }],
        existing: [
          {
            id: 'record-1',
            employeeId: 'emp-b1',
            date: new Date(Date.UTC(2026, 6, 8)),
            status: 'PRESENT',
            overtimeMinutes: 120,
            workingMinutes: 600,
            shift: {
              id: 'shift-1',
              overtimeAfterMinutes: 480,
              halfDayAfterMinutes: 240,
              minWorkingMinutes: 480,
              shiftAllowanceAmount: 0,
              compOffEligible: false,
            },
          },
        ],
      });

      await service.finalizeMonth('tenant-1', 'hr-1', { month: '2026-07', locationId: 'loc-b' });

      expect(prisma.payrollVariableInput.deleteMany).toHaveBeenCalledTimes(1);
      expect(prisma.payrollVariableInput.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            employeeId: 'emp-b1',
            type: 'OVERTIME',
            source: 'ATTENDANCE',
            month: 7,
            year: 2026,
          }),
        }),
      );
    });

    it('never issues a tenant-wide delete when no employees are in scope', async () => {
      const { service, prisma } = buildFinalizeHarness({ employees: [] });

      await service.finalizeMonth('tenant-1', 'hr-1', { month: '2026-07', locationId: 'loc-b' });

      expect(prisma.payrollVariableInput.deleteMany).not.toHaveBeenCalled();
    });
  });

  it('deletes unfinalized attendance records', async () => {
    const prisma = {
      attendanceRecord: {
        findFirst: jest.fn().mockResolvedValue({ id: 'record-1', isFinalized: false }),
        delete: jest.fn().mockResolvedValue({ id: 'record-1' }),
      },
    };
    const service = newAttendanceService(prisma);

    await expect(service.deleteRecord('tenant-1', 'record-1')).resolves.toEqual({ deleted: true });
    expect(prisma.attendanceRecord.delete).toHaveBeenCalledWith({ where: { id: 'record-1' } });
  });

  describe('monthlyLedgerFor', () => {
    const shift = {
      id: 'shift-1',
      weeklyOffDays: [0, 6],
      startTime: '09:00',
      endTime: '18:00',
      gracePeriodMins: 15,
      earlyLeavingGraceMins: 15,
    };

    function ledgerPrisma(options?: {
      records?: Array<Record<string, unknown>>;
      holidays?: string[];
      leaves?: Array<{ employeeId: string; fromDate: string; toDate: string }>;
      assignments?: Array<Record<string, unknown>>;
      fallbackShift?: Record<string, unknown> | null;
      rules?: Array<Record<string, unknown>>;
    }) {
      return {
        employee: { findFirst: jest.fn().mockResolvedValue({ locationId: 'loc-1' }) },
        attendanceRecord: { findMany: jest.fn().mockResolvedValue(options?.records ?? []) },
        holiday: {
          findMany: jest
            .fn()
            .mockResolvedValue((options?.holidays ?? []).map((date) => ({ date: new Date(`${date}T00:00:00.000Z`) }))),
        },
        leaveRequest: {
          findMany: jest.fn().mockResolvedValue(
            (options?.leaves ?? []).map((leave) => ({
              employeeId: leave.employeeId,
              fromDate: new Date(`${leave.fromDate}T00:00:00.000Z`),
              toDate: new Date(`${leave.toDate}T00:00:00.000Z`),
            })),
          ),
        },
        shiftAssignment: { findMany: jest.fn().mockResolvedValue(options?.assignments ?? []) },
        shift: {
          findFirst: jest
            .fn()
            .mockResolvedValue(options && 'fallbackShift' in options ? options.fallbackShift : shift),
        },
        attendanceRule: { findMany: jest.fn().mockResolvedValue(options?.rules ?? []) },
      };
    }

    // June 2026 is fully in the past, so nothing is clamped to today.
    const month = '2026-06';

    it('classifies a month with record over leave over holiday over weekly off', async () => {
      const prisma = ledgerPrisma({
        records: [
          {
            date: new Date('2026-06-01T00:00:00.000Z'),
            status: 'PRESENT',
            punchIn: null,
            punchOut: null,
            workingMinutes: 480,
            overtimeMinutes: 0,
            shiftId: 'shift-1',
          },
        ],
        holidays: ['2026-06-03'],
        leaves: [{ employeeId: 'emp-1', fromDate: '2026-06-02', toDate: '2026-06-02' }],
      });
      const service = newAttendanceService(prisma);

      const ledger = await service.monthlyLedgerFor('tenant-1', 'emp-1', month);

      const byDate = new Map(ledger.days.map((day) => [day.date.toISOString().slice(0, 10), day]));
      expect(byDate.get('2026-06-01')?.status).toBe('PRESENT');
      expect(byDate.get('2026-06-01')?.source).toBe('RECORD');
      expect(byDate.get('2026-06-02')?.status).toBe('ON_LEAVE');
      expect(byDate.get('2026-06-03')?.status).toBe('HOLIDAY');
      expect(byDate.get('2026-06-06')?.status).toBe('WEEKEND');
      expect(byDate.get('2026-06-04')?.status).toBe('ABSENT');
      expect(ledger.days).toHaveLength(30);
    });

    it('honours the shift assigned on each day and flips weekly offs mid-month', async () => {
      const prisma = ledgerPrisma({
        assignments: [
          {
            effectiveFrom: new Date('2026-06-15T00:00:00.000Z'),
            effectiveTo: null,
            shift: { ...shift, id: 'shift-late', weeklyOffDays: [0] },
          },
          {
            effectiveFrom: new Date('2026-06-01T00:00:00.000Z'),
            effectiveTo: new Date('2026-06-14T00:00:00.000Z'),
            shift: { ...shift, id: 'shift-early', weeklyOffDays: [0, 6] },
          },
        ],
      });
      const service = newAttendanceService(prisma);

      const ledger = await service.monthlyLedgerFor('tenant-1', 'emp-1', month);

      const byDate = new Map(ledger.days.map((day) => [day.date.toISOString().slice(0, 10), day]));
      // Saturdays: 06-13 is under the [0,6] shift, 06-20 under the [0] shift.
      expect(byDate.get('2026-06-13')?.status).toBe('WEEKEND');
      expect(byDate.get('2026-06-20')?.status).toBe('ABSENT');
      expect(byDate.get('2026-06-13')?.shiftId).toBe('shift-early');
      expect(byDate.get('2026-06-20')?.shiftId).toBe('shift-late');
      expect(prisma.shiftAssignment.findMany).toHaveBeenCalledTimes(1);
    });

    it('falls back to the active tenant shift, then to Sat/Sun without any shift', async () => {
      const assigned = await newAttendanceService(ledgerPrisma()).monthlyLedgerFor(
        'tenant-1',
        'emp-1',
        month,
      );
      expect(assigned.days.find((day) => day.date.toISOString().startsWith('2026-06-06'))?.shiftId).toBe(
        'shift-1',
      );

      const service = newAttendanceService(ledgerPrisma({ fallbackShift: null }));
      const ledger = await service.monthlyLedgerFor('tenant-1', 'emp-1', month);

      const byDate = new Map(ledger.days.map((day) => [day.date.toISOString().slice(0, 10), day]));
      expect(byDate.get('2026-06-06')?.status).toBe('WEEKEND');
      expect(byDate.get('2026-06-07')?.status).toBe('WEEKEND');
      expect(byDate.get('2026-06-08')?.status).toBe('ABSENT');
    });

    it('excludes days before joining and after relieving', async () => {
      const service = newAttendanceService(ledgerPrisma());

      const ledger = await service.monthlyLedgerFor('tenant-1', 'emp-1', month, {
        joiningDate: new Date('2026-06-10T00:00:00.000Z'),
        exitDate: new Date('2026-06-20T00:00:00.000Z'),
      });

      expect(ledger.windowStart.toISOString().slice(0, 10)).toBe('2026-06-10');
      expect(ledger.windowEnd.toISOString().slice(0, 10)).toBe('2026-06-20');
      expect(ledger.days).toHaveLength(11);
      expect(ledger.days.every((day) => day.date >= ledger.windowStart)).toBe(true);
    });

    it('stops the window at today instead of marking future days absent', async () => {
      const service = newAttendanceService(ledgerPrisma());
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      const ledger = await service.monthlyLedgerFor('tenant-1', 'emp-1', currentMonth);

      const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
      expect(ledger.days.every((day) => day.date <= today)).toBe(true);
      expect(ledger.days).toHaveLength(now.getDate());
    });

    it('counts LATE and half-weights HALF_DAY in the attendance percentage', async () => {
      const prisma = ledgerPrisma({
        records: [
          { date: new Date('2026-06-01T00:00:00.000Z'), status: 'PRESENT', workingMinutes: 480 },
          { date: new Date('2026-06-02T00:00:00.000Z'), status: 'LATE', workingMinutes: 470 },
          { date: new Date('2026-06-03T00:00:00.000Z'), status: 'HALF_DAY', workingMinutes: 250 },
        ],
        // Weekly offs plus holidays leave exactly 4 attendable days.
        holidays: [
          '2026-06-04', '2026-06-05', '2026-06-08', '2026-06-09', '2026-06-10', '2026-06-11',
          '2026-06-12', '2026-06-15', '2026-06-16', '2026-06-17', '2026-06-18', '2026-06-19',
          '2026-06-22', '2026-06-23', '2026-06-24', '2026-06-25', '2026-06-26', '2026-06-29',
        ],
      });
      const service = newAttendanceService(prisma);

      const ledger = await service.monthlyLedgerFor('tenant-1', 'emp-1', month);

      expect(ledger.counts.expectedWorkingDays).toBe(4);
      // 06-30 stays ABSENT: (1 + 1 + 0.5) / 4 = 62.5%
      expect(ledger.counts.attendancePercentage).toBe(62.5);
      expect(ledger.counts.absent).toBe(1);
    });

    it('returns a null percentage when the window has no attendable working days', async () => {
      const service = newAttendanceService(ledgerPrisma());

      const ledger = await service.monthlyLedgerFor('tenant-1', 'emp-1', month, {
        joiningDate: new Date('2026-06-06T00:00:00.000Z'),
        exitDate: new Date('2026-06-07T00:00:00.000Z'),
      });

      expect(ledger.counts.expectedWorkingDays).toBe(0);
      expect(ledger.counts.attendancePercentage).toBeNull();
    });

    it('counts only the in-month days of leave that started in the previous month', async () => {
      const prisma = ledgerPrisma({
        leaves: [{ employeeId: 'emp-1', fromDate: '2026-05-28', toDate: '2026-06-02' }],
      });
      const service = newAttendanceService(prisma);

      const ledger = await service.monthlyLedgerFor('tenant-1', 'emp-1', month);

      expect(ledger.counts.onLeave).toBe(2);
      expect(prisma.leaveRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 'tenant-1', status: 'APPROVED' }),
        }),
      );
    });

    it('derives late arrivals and early departures from the punches', async () => {
      // A midnight-to-midnight shift with no grace keeps the assertion true in
      // any server timezone: the punch is after the start and before the end.
      const prisma = ledgerPrisma({
        records: [
          {
            date: new Date('2026-06-01T00:00:00.000Z'),
            status: 'PRESENT',
            punchIn: new Date('2026-06-01T10:30:00.000Z'),
            punchOut: new Date('2026-06-01T12:00:00.000Z'),
            workingMinutes: 90,
          },
        ],
        fallbackShift: {
          ...shift,
          startTime: '00:00',
          endTime: '23:59',
          gracePeriodMins: 0,
          earlyLeavingGraceMins: 0,
        },
      });
      const service = newAttendanceService(prisma);

      const ledger = await service.monthlyLedgerFor('tenant-1', 'emp-1', month);

      expect(ledger.counts.lateArrivals).toBe(1);
      expect(ledger.counts.earlyDepartures).toBe(1);
      // One rule query for the whole month, not one per day.
      expect(prisma.attendanceRule.findMany).toHaveBeenCalledTimes(1);
    });

    it('applies the attendance rule effective on each day when it changes mid-month', async () => {
      // A midnight shift start makes the two graces unambiguous in any server
      // timezone: 0 minutes is always late, a full day is never late.
      const midnightShift = { ...shift, startTime: '00:00', weeklyOffDays: [] };
      const prisma = ledgerPrisma({
        fallbackShift: midnightShift,
        records: [
          {
            date: new Date('2026-06-05T00:00:00.000Z'),
            status: 'PRESENT',
            punchIn: new Date('2026-06-05T10:30:00.000Z'),
            punchOut: null,
          },
          {
            date: new Date('2026-06-20T00:00:00.000Z'),
            status: 'PRESENT',
            punchIn: new Date('2026-06-20T10:30:00.000Z'),
            punchOut: null,
          },
        ],
        // Ordered as the query returns them: non-default first, newest updated first.
        rules: [
          {
            id: 'rule-new',
            shiftId: 'shift-1',
            locationId: null,
            isDefault: false,
            effectiveFrom: new Date('2026-06-15T00:00:00.000Z'),
            effectiveTo: null,
            lateMarkAfterMins: 1439,
            earlyLeavingGraceMins: 0,
          },
          {
            id: 'rule-old',
            shiftId: 'shift-1',
            locationId: null,
            isDefault: false,
            effectiveFrom: new Date('2026-06-01T00:00:00.000Z'),
            effectiveTo: new Date('2026-06-14T00:00:00.000Z'),
            lateMarkAfterMins: 0,
            earlyLeavingGraceMins: 0,
          },
        ],
      });
      const service = newAttendanceService(prisma);

      const ledger = await service.monthlyLedgerFor('tenant-1', 'emp-1', month);

      const byDate = new Map(ledger.days.map((day) => [day.date.toISOString().slice(0, 10), day]));
      expect(byDate.get('2026-06-05')?.isLate).toBe(true);
      expect(byDate.get('2026-06-20')?.isLate).toBe(false);
      expect(ledger.counts.lateArrivals).toBe(1);
      expect(prisma.attendanceRule.findMany).toHaveBeenCalledTimes(1);
    });

    it('prefers a shift-scoped rule over the tenant default and ignores other shifts', async () => {
      const prisma = ledgerPrisma({
        fallbackShift: { ...shift, startTime: '00:00', weeklyOffDays: [] },
        records: [
          {
            date: new Date('2026-06-05T00:00:00.000Z'),
            status: 'PRESENT',
            punchIn: new Date('2026-06-05T10:30:00.000Z'),
            punchOut: null,
          },
        ],
        rules: [
          {
            id: 'rule-other-shift',
            shiftId: 'shift-other',
            locationId: null,
            isDefault: false,
            effectiveFrom: new Date('2026-06-01T00:00:00.000Z'),
            effectiveTo: null,
            lateMarkAfterMins: 0,
            earlyLeavingGraceMins: 0,
          },
          {
            id: 'rule-default',
            shiftId: null,
            locationId: null,
            isDefault: true,
            effectiveFrom: new Date('2026-06-01T00:00:00.000Z'),
            effectiveTo: null,
            lateMarkAfterMins: 1439,
            earlyLeavingGraceMins: 0,
          },
        ],
      });
      const service = newAttendanceService(prisma);

      const ledger = await service.monthlyLedgerFor('tenant-1', 'emp-1', month);

      // The other shift's rule must not apply; the default's full-day grace wins.
      expect(ledger.counts.lateArrivals).toBe(0);
    });

    // Punch times are built from local parts because the grace comparison uses
    // local wall-clock, which keeps these boundaries exact in any timezone.
    const localAt = (day: number, hour: number, minute: number) =>
      new Date(2026, 5, day, hour, minute, 0, 0);
    const gracedShift = {
      ...shift,
      startTime: '09:00',
      endTime: '18:00',
      gracePeriodMins: 15,
      earlyLeavingGraceMins: 15,
      weeklyOffDays: [],
    };

    it('treats 09:15 as on time and 09:16 as late under a 15 minute check-in grace', async () => {
      const prisma = ledgerPrisma({
        fallbackShift: gracedShift,
        records: [
          {
            date: new Date('2026-06-01T00:00:00.000Z'),
            status: 'PRESENT',
            punchIn: localAt(1, 9, 15),
            punchOut: null,
          },
          {
            date: new Date('2026-06-02T00:00:00.000Z'),
            status: 'PRESENT',
            punchIn: localAt(2, 9, 16),
            punchOut: null,
          },
        ],
      });
      const service = newAttendanceService(prisma);

      const ledger = await service.monthlyLedgerFor('tenant-1', 'emp-1', month);

      const byDate = new Map(ledger.days.map((day) => [day.date.toISOString().slice(0, 10), day]));
      expect(byDate.get('2026-06-01')?.isLate).toBe(false);
      expect(byDate.get('2026-06-02')?.isLate).toBe(true);
      expect(ledger.counts.lateArrivals).toBe(1);
    });

    it('applies the same 15 minute grace to check-out at 17:45, 17:44 and 18:00', async () => {
      const prisma = ledgerPrisma({
        fallbackShift: gracedShift,
        records: [
          { day: 1, hour: 17, minute: 45 },
          { day: 2, hour: 17, minute: 44 },
          { day: 3, hour: 18, minute: 0 },
        ].map(({ day, hour, minute }) => ({
          date: new Date(`2026-06-0${day}T00:00:00.000Z`),
          status: 'PRESENT',
          punchIn: localAt(day, 9, 0),
          punchOut: localAt(day, hour, minute),
        })),
      });
      const service = newAttendanceService(prisma);

      const ledger = await service.monthlyLedgerFor('tenant-1', 'emp-1', month);

      const byDate = new Map(ledger.days.map((day) => [day.date.toISOString().slice(0, 10), day]));
      expect(byDate.get('2026-06-01')?.isEarlyDeparture).toBe(false);
      expect(byDate.get('2026-06-02')?.isEarlyDeparture).toBe(true);
      expect(byDate.get('2026-06-03')?.isEarlyDeparture).toBe(false);
      expect(ledger.counts.earlyDepartures).toBe(1);
      expect(ledger.counts.lateArrivals).toBe(0);
    });

    it('counts early-departure minutes from the grace boundary at 17:44, 17:45, 17:59 and 18:00', async () => {
      const prisma = ledgerPrisma({
        fallbackShift: gracedShift,
        records: [
          { day: 1, hour: 17, minute: 44 },
          { day: 2, hour: 17, minute: 45 },
          { day: 3, hour: 17, minute: 59 },
          { day: 4, hour: 18, minute: 0 },
        ].map(({ day, hour, minute }) => ({
          date: new Date(`2026-06-0${day}T00:00:00.000Z`),
          status: 'PRESENT',
          punchIn: localAt(day, 9, 0),
          punchOut: localAt(day, hour, minute),
        })),
      });
      const service = newAttendanceService(prisma);

      const ledger = await service.monthlyLedgerFor('tenant-1', 'emp-1', month);

      const byDate = new Map(ledger.days.map((day) => [day.date.toISOString().slice(0, 10), day]));
      expect(byDate.get('2026-06-01')).toMatchObject({
        isEarlyDeparture: true,
        earlyDepartureMinutes: 1,
      });
      expect(byDate.get('2026-06-02')).toMatchObject({
        isEarlyDeparture: false,
        earlyDepartureMinutes: 0,
      });
      expect(byDate.get('2026-06-03')).toMatchObject({
        isEarlyDeparture: false,
        earlyDepartureMinutes: 0,
      });
      expect(byDate.get('2026-06-04')).toMatchObject({
        isEarlyDeparture: false,
        earlyDepartureMinutes: 0,
      });
      expect(ledger.counts.earlyDepartures).toBe(1);
      expect(ledger.counts.earlyDepartureMinutes).toBe(1);
    });

    it('reports the location each day resolves to, with the assignment overriding the default', async () => {
      const prisma = ledgerPrisma({
        assignments: [
          {
            id: 'a-roster',
            effectiveFrom: new Date('2026-06-10T00:00:00.000Z'),
            effectiveTo: new Date('2026-06-10T00:00:00.000Z'),
            createdAt: new Date('2026-06-01T00:00:00.000Z'),
            source: 'ROSTER_UPLOAD',
            locationId: 'loc-remote',
            shift,
          },
        ],
      });
      const service = newAttendanceService(prisma);

      const ledger = await service.monthlyLedgerFor('tenant-1', 'emp-1', month);

      const byDate = new Map(ledger.days.map((day) => [day.date.toISOString().slice(0, 10), day]));
      expect(byDate.get('2026-06-10')?.locationId).toBe('loc-remote');
      // Days the override does not cover stay on the employee's own location.
      expect(byDate.get('2026-06-11')?.locationId).toBe('loc-1');
    });

    it('does not flag a missing punch-out as an early departure', async () => {
      const prisma = ledgerPrisma({
        records: [
          {
            date: new Date('2026-06-01T00:00:00.000Z'),
            status: 'MISSING_PUNCH',
            punchIn: new Date('2026-06-01T09:00:00.000Z'),
            punchOut: null,
          },
        ],
      });
      const service = newAttendanceService(prisma);

      const ledger = await service.monthlyLedgerFor('tenant-1', 'emp-1', month);

      expect(ledger.counts.earlyDepartures).toBe(0);
      expect(ledger.counts.missingPunch).toBe(1);
    });
  });

  it('marks a late check-in using the attendance rule grace over the shift grace', async () => {
    const prisma = {
      employee: { findFirst: jest.fn().mockResolvedValue({ locationId: null, workMode: 'REMOTE', location: null }) },
      attendanceCaptureSetting: { findFirst: jest.fn().mockResolvedValue(null) },
      employeeDevice: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      attendanceRecord: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockImplementation(({ create }) => Promise.resolve(create)),
      },
      shiftAssignment: { findFirst: jest.fn().mockResolvedValue(null) },
      shift: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'shift-1', startTime: '00:00', gracePeriodMins: 0 }),
      },
      attendanceRule: { findFirst: jest.fn().mockResolvedValue({ lateMarkAfterMins: 0 }) },
    };
    const service = newAttendanceService(prisma);

    const record = await service.checkIn(
      { tenantId: 'tenant-1', employeeId: 'emp-1' } as any,
      { deviceId: 'device-1' } as any,
    );

    expect(record).toMatchObject({ status: 'LATE', shiftId: 'shift-1' });
  });

  it('creates the missing finalization days with the shared day classification', async () => {
    const created: Array<{ date: string; status: string }> = [];
    const prisma = {
      employee: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([{ id: 'emp-1', employeeCode: 'PH001', locationId: null }]),
      },
      attendanceRecord: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }) => {
          created.push({ date: data.date.toISOString().slice(0, 10), status: data.status });
          return Promise.resolve(data);
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      leaveRequest: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([
          {
            employeeId: 'emp-1',
            fromDate: new Date('2026-06-02T00:00:00.000Z'),
            toDate: new Date('2026-06-02T00:00:00.000Z'),
          },
        ]),
      },
      holiday: {
        findMany: jest.fn().mockResolvedValue([{ date: new Date('2026-06-03T00:00:00.000Z') }]),
      },
      shiftAssignment: { findFirst: jest.fn().mockResolvedValue(null) },
      shift: { findFirst: jest.fn().mockResolvedValue({ id: 'shift-1', weeklyOffDays: [0, 6] }) },
      attendanceFinalization: { create: jest.fn().mockResolvedValue({ id: 'fin-1' }) },
      payrollVariableInput: { deleteMany: jest.fn(), create: jest.fn() },
    };
    const service = newAttendanceService(prisma);

    await service.finalizeMonth('tenant-1', 'emp-hr', { month: '2026-06' });

    const byDate = new Map(created.map((row) => [row.date, row.status]));
    expect(byDate.get('2026-06-01')).toBe('ABSENT');
    expect(byDate.get('2026-06-02')).toBe('ON_LEAVE');
    expect(byDate.get('2026-06-03')).toBe('HOLIDAY');
    expect(byDate.get('2026-06-06')).toBe('WEEKEND');
    expect(created).toHaveLength(30);
  });

  describe('check-in resolves the assignment covering the punch day', () => {
    const BENGALURU = { id: 'loc-blr', name: 'Bengaluru Office', geoLat: 12.9716, geoLng: 77.5946, attendanceRadius: 200 };
    const DELHI = { id: 'loc-del', name: 'Delhi Office', geoLat: 28.6139, geoLng: 77.209, attendanceRadius: 200 };
    const NIGHT_SHIFT = { id: 'shift-night', startTime: '21:00', endTime: '06:00', gracePeriodMins: 20 };
    const DEFAULT_SHIFT = { id: 'shift-default', startTime: '09:00', endTime: '18:00', gracePeriodMins: 15 };

    /** The punch day in the same local-calendar-day-at-UTC-midnight form assignments are stored in. */
    const punchDay = new Date(Date.UTC(2026, 6, 30));

    /**
     * Unlike the older check-in doubles, `shiftAssignment.findFirst` here
     * evaluates the window filter the service actually sends. Returning a fixed
     * row regardless of `where` is what let a time-of-day anchor reach the
     * resolver unnoticed.
     */
    function checkInHarness(options: {
      assignments: Array<{
        id: string;
        locationId: string | null;
        effectiveFrom: Date;
        effectiveTo: Date | null;
        shift: Record<string, unknown>;
      }>;
      employeeLocationId: string | null;
    }) {
      const locationsById = new Map([
        [BENGALURU.id, BENGALURU],
        [DELHI.id, DELHI],
      ]);
      return {
        employee: {
          findFirst: jest
            .fn()
            .mockResolvedValue({ locationId: options.employeeLocationId, workMode: 'OFFICE' }),
        },
        location: {
          findFirst: jest.fn(({ where }: { where: { id: string } }) =>
            Promise.resolve(locationsById.get(where.id) ?? null),
          ),
        },
        shiftAssignment: {
          findFirst: jest.fn(({ where }: { where: Record<string, any> }) => {
            const at: Date = where.effectiveFrom.lte;
            const covering = options.assignments.filter(
              (assignment) =>
                assignment.effectiveFrom <= at &&
                (assignment.effectiveTo === null || assignment.effectiveTo >= at),
            );
            return Promise.resolve(covering[0] ?? null);
          }),
        },
        shift: { findFirst: jest.fn().mockResolvedValue(DEFAULT_SHIFT) },
        attendanceCaptureSetting: { findFirst: jest.fn().mockResolvedValue(null) },
        attendanceRule: { findFirst: jest.fn().mockResolvedValue(null) },
        employeeDevice: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({}),
        },
        attendanceRecord: {
          findUnique: jest.fn().mockResolvedValue(null),
          upsert: jest.fn().mockImplementation(({ create }) => Promise.resolve(create)),
        },
      };
    }

    /** A GPS punch standing exactly on the Delhi office. */
    const atDelhi = { deviceId: 'device-1', geoLat: DELHI.geoLat, geoLng: DELHI.geoLng } as never;
    const user = { tenantId: 'tenant-1', employeeId: 'emp-1' } as never;

    afterEach(() => jest.useRealTimers());

    /** Mid-afternoon on the punch day: past midnight, so a raw timestamp breaks. */
    function atMidAfternoon() {
      jest.useFakeTimers().setSystemTime(new Date(2026, 6, 30, 15, 42, 0));
    }

    it('keeps a one-day assignment location for the whole of that day', async () => {
      const prisma = checkInHarness({
        employeeLocationId: BENGALURU.id,
        assignments: [
          {
            id: 'a-roster',
            locationId: DELHI.id,
            effectiveFrom: punchDay,
            effectiveTo: punchDay,
            shift: NIGHT_SHIFT,
          },
        ],
      });
      const service = newAttendanceService(prisma);
      atMidAfternoon();

      const record = await service.checkIn(user, atDelhi);

      // Geofenced against the override, not the base location 1,700km away.
      expect(prisma.location.findFirst).toHaveBeenCalledWith({
        where: { id: DELHI.id, tenantId: 'tenant-1' },
      });
      expect(record).toMatchObject({ shiftId: NIGHT_SHIFT.id });
    });

    it('still resolves the one-day assignment last thing at night', async () => {
      const prisma = checkInHarness({
        employeeLocationId: BENGALURU.id,
        assignments: [
          {
            id: 'a-roster',
            locationId: DELHI.id,
            effectiveFrom: punchDay,
            effectiveTo: punchDay,
            shift: NIGHT_SHIFT,
          },
        ],
      });
      const service = newAttendanceService(prisma);
      jest.useFakeTimers().setSystemTime(new Date(2026, 6, 30, 23, 59, 0));

      await expect(service.checkIn(user, atDelhi)).resolves.toMatchObject({
        shiftId: NIGHT_SHIFT.id,
      });
    });

    it('keeps the assignment location and shift on the last day of a multi-day assignment', async () => {
      const prisma = checkInHarness({
        employeeLocationId: BENGALURU.id,
        assignments: [
          {
            id: 'a-month',
            locationId: DELHI.id,
            effectiveFrom: new Date(Date.UTC(2026, 6, 1)),
            effectiveTo: punchDay,
            shift: NIGHT_SHIFT,
          },
        ],
      });
      const service = newAttendanceService(prisma);
      atMidAfternoon();

      const record = await service.checkIn(user, atDelhi);

      expect(prisma.location.findFirst).toHaveBeenCalledWith({
        where: { id: DELHI.id, tenantId: 'tenant-1' },
      });
      expect(record).toMatchObject({ shiftId: NIGHT_SHIFT.id });
    });

    it('queries the resolver with the punch day, never the punch instant', async () => {
      const prisma = checkInHarness({
        employeeLocationId: BENGALURU.id,
        assignments: [
          {
            id: 'a-roster',
            locationId: DELHI.id,
            effectiveFrom: punchDay,
            effectiveTo: punchDay,
            shift: NIGHT_SHIFT,
          },
        ],
      });
      const service = newAttendanceService(prisma);
      atMidAfternoon();

      await service.checkIn(user, atDelhi);

      const [{ where }] = prisma.shiftAssignment.findFirst.mock.calls[0];
      expect(where.effectiveFrom.lte).toEqual(punchDay);
    });

    it('falls back to the base location once the assignment has expired', async () => {
      const prisma = checkInHarness({
        employeeLocationId: BENGALURU.id,
        assignments: [
          {
            id: 'a-yesterday',
            locationId: DELHI.id,
            effectiveFrom: new Date(Date.UTC(2026, 6, 29)),
            effectiveTo: new Date(Date.UTC(2026, 6, 29)),
            shift: NIGHT_SHIFT,
          },
        ],
      });
      const service = newAttendanceService(prisma);
      atMidAfternoon();

      // Standing at Delhi on a day the Delhi override no longer covers is a
      // geofence failure against the employee's own location, by design.
      await expect(service.checkIn(user, atDelhi)).rejects.toThrow(
        /away from Bengaluru Office/,
      );
    });
  });

  describe('assignShift', () => {
    function assignPrisma() {
      return {
        shift: { findFirst: jest.fn().mockResolvedValue({ id: 'shift-1' }) },
        location: { findFirst: jest.fn().mockResolvedValue({ id: 'loc-1' }) },
        employee: { findMany: jest.fn().mockResolvedValue([{ id: 'emp-1' }]) },
        shiftAssignment: {
          findFirst: jest.fn().mockResolvedValue(null),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          createMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        $transaction: jest.fn().mockResolvedValue([]),
      };
    }

    it('closes the previous assignment the day before the new one starts', async () => {
      const prisma = assignPrisma();
      const service = newAttendanceService(prisma);

      await service.assignShift('tenant-1', {
        employeeIds: ['emp-1'],
        shiftId: 'shift-1',
        effectiveFrom: '2026-07-15',
      });

      // Closing on 07-15 left both rows covering 07-15, so the boundary day
      // resolved by row ordering rather than by the assignment window.
      expect(prisma.shiftAssignment.updateMany).toHaveBeenCalledWith({
        where: { employeeId: { in: ['emp-1'] }, effectiveTo: null },
        data: { effectiveTo: new Date('2026-07-14T00:00:00.000Z') },
      });
    });

    it('keeps the assignment location as an override without touching the employee record', async () => {
      const prisma = assignPrisma();
      const service = newAttendanceService(prisma);

      await service.assignShift('tenant-1', {
        employeeIds: ['emp-1'],
        shiftId: 'shift-1',
        effectiveFrom: '2026-07-15',
        locationId: 'loc-1',
      });

      expect(prisma.shiftAssignment.createMany).toHaveBeenCalledWith({
        data: [
          {
            employeeId: 'emp-1',
            shiftId: 'shift-1',
            locationId: 'loc-1',
            effectiveFrom: new Date('2026-07-15T00:00:00.000Z'),
          },
        ],
      });
      expect((prisma as unknown as { employee: { update?: unknown } }).employee.update).toBeUndefined();
    });

    it('rejects an assignment shadowed by a later open-ended one', async () => {
      const prisma = assignPrisma();
      prisma.shiftAssignment.findFirst.mockResolvedValue({
        effectiveFrom: new Date('2026-08-01T00:00:00.000Z'),
        employee: { employeeCode: 'PH001' },
      });
      const service = newAttendanceService(prisma);

      await expect(
        service.assignShift('tenant-1', {
          employeeIds: ['emp-1'],
          shiftId: 'shift-1',
          effectiveFrom: '2026-07-15',
        }),
      ).rejects.toThrow('PH001 already has an open-ended assignment starting 2026-08-01');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects an unparseable effective date', async () => {
      const service = newAttendanceService(assignPrisma());
      await expect(
        service.assignShift('tenant-1', {
          employeeIds: ['emp-1'],
          shiftId: 'shift-1',
          effectiveFrom: '15/07/2026',
        }),
      ).rejects.toThrow('Invalid effectiveFrom');
    });
  });

  describe('importRoster', () => {
    function rosterPrisma(existing: Array<Record<string, unknown>> = []) {
      const created: Array<Record<string, unknown>> = [];
      const rows: Array<Record<string, unknown>> = [];
      const prisma = {
        employee: {
          findMany: jest.fn().mockResolvedValue([{ id: 'emp-1', employeeCode: 'PH001' }]),
        },
        shift: {
          findMany: jest.fn().mockResolvedValue([{ id: 'shift-1', name: 'Standard Shift' }]),
        },
        shiftAssignment: {
          findMany: jest.fn().mockResolvedValue(existing),
          create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
            created.push(data);
            return Promise.resolve({ ...data, id: `created-${created.length}`, shift: { name: 'Standard Shift' } });
          }),
          deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        rosterUpload: {
          create: jest.fn().mockResolvedValue({ id: 'roster-1' }),
          update: jest.fn(({ data }: { data: Record<string, unknown> }) =>
            Promise.resolve({ id: 'roster-1', ...data }),
          ),
        },
        rosterUploadRow: {
          create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
            rows.push(data);
            return Promise.resolve(data);
          }),
        },
      };
      return { prisma, created, rows };
    }

    const rosterRow = { employeeCode: 'PH001', date: '2026-07-15', shiftName: 'Standard Shift' };

    it('scopes a rostered day to that day only', async () => {
      const { prisma, created } = rosterPrisma();
      const service = newAttendanceService(prisma);

      await service.importRoster('tenant-1', 'emp-hr', { name: 'July', rows: [rosterRow] });

      // effectiveTo used to be the *next* day, so a single rostered day also
      // took over the following day's shift.
      expect(created[0]).toMatchObject({
        effectiveFrom: new Date('2026-07-15T00:00:00.000Z'),
        effectiveTo: new Date('2026-07-15T00:00:00.000Z'),
        source: 'ROSTER_UPLOAD',
      });
    });

    it('fails a row that conflicts with an existing same-day assignment', async () => {
      const { prisma, created } = rosterPrisma([
        {
          id: 'existing-1',
          employeeId: 'emp-1',
          effectiveFrom: new Date('2026-07-15T00:00:00.000Z'),
          effectiveTo: new Date('2026-07-15T00:00:00.000Z'),
          source: 'SHIFT_SWAP',
          shift: { name: 'Night Operations' },
        },
      ]);
      const service = newAttendanceService(prisma);

      const result = await service.importRoster('tenant-1', 'emp-hr', {
        name: 'July',
        rows: [rosterRow],
      });

      expect(created).toHaveLength(0);
      expect(result).toMatchObject({ status: 'FAILED', importedCount: 0, failedCount: 1 });
      expect((result.errors as Array<{ error: string }>)[0].error).toContain(
        'already has a Night Operations assignment on 2026-07-15',
      );
    });

    it('replaces the conflicting assignment when the upload asks for it', async () => {
      const { prisma, created } = rosterPrisma([
        {
          id: 'existing-1',
          employeeId: 'emp-1',
          effectiveFrom: new Date('2026-07-15T00:00:00.000Z'),
          effectiveTo: new Date('2026-07-15T00:00:00.000Z'),
          source: 'SHIFT_SWAP',
          shift: { name: 'Night Operations' },
        },
      ]);
      const service = newAttendanceService(prisma);

      const result = await service.importRoster('tenant-1', 'emp-hr', {
        name: 'July',
        rows: [rosterRow],
        replaceExisting: true,
      });

      expect(prisma.shiftAssignment.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['existing-1'] } },
      });
      expect(created).toHaveLength(1);
      expect(result).toMatchObject({ importedCount: 1, failedCount: 0, replacedCount: 1 });
    });

    it('leaves an open-ended base assignment in place as the standing shift', async () => {
      const { prisma, created } = rosterPrisma([
        {
          id: 'base-1',
          employeeId: 'emp-1',
          effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
          effectiveTo: null,
          source: 'MANUAL',
          shift: { name: 'Standard Shift' },
        },
      ]);
      const service = newAttendanceService(prisma);

      const result = await service.importRoster('tenant-1', 'emp-hr', {
        name: 'July',
        rows: [rosterRow],
      });

      expect(prisma.shiftAssignment.deleteMany).not.toHaveBeenCalled();
      expect(created).toHaveLength(1);
      expect(result).toMatchObject({ importedCount: 1, failedCount: 0 });
    });

    it('fails duplicate rows for the same employee and date within one file', async () => {
      const { prisma, created } = rosterPrisma();
      const service = newAttendanceService(prisma);

      const result = await service.importRoster('tenant-1', 'emp-hr', {
        name: 'July',
        rows: [rosterRow, rosterRow],
      });

      expect(created).toHaveLength(1);
      expect((result.errors as Array<{ row: number; error: string }>)[0]).toMatchObject({
        row: 2,
        error: 'Duplicate row for this employee and date in the same file',
      });
    });

    it('reports an unsupported date as a row error naming the supported formats', async () => {
      const { prisma, created } = rosterPrisma();
      const service = newAttendanceService(prisma);

      const result = await service.importRoster('tenant-1', 'emp-hr', {
        name: 'July',
        rows: [{ ...rosterRow, date: '15/07/2026' }, rosterRow],
      });

      expect(created).toHaveLength(1);
      expect((result.errors as Array<{ row: number; error: string }>)[0]).toMatchObject({
        row: 1,
        error: expect.stringContaining('Unsupported date "15/07/2026" — use YYYY-MM-DD'),
      });
    });

    it('accepts an ISO 8601 datetime as the rostered day', async () => {
      const { prisma, created } = rosterPrisma();
      const service = newAttendanceService(prisma);

      await service.importRoster('tenant-1', 'emp-hr', {
        name: 'July',
        rows: [{ ...rosterRow, date: '2026-07-15T00:00:00.000Z' }],
      });

      expect(created[0]).toMatchObject({ effectiveFrom: new Date('2026-07-15T00:00:00.000Z') });
    });
  });

  describe('shift assignment management', () => {
    it('lists assignments with status, effective location and overlaps', async () => {
      const assignments = [
        {
          id: 'a-base',
          employeeId: 'emp-1',
          effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
          effectiveTo: null,
          source: 'MANUAL',
          locationId: null,
          shift: { id: 'shift-1', name: 'Day' },
          location: null,
          employee: {
            id: 'emp-1',
            firstName: 'A',
            lastName: 'One',
            employeeCode: 'PH001',
            location: { id: 'loc-hq', name: 'HQ' },
          },
        },
        {
          id: 'a-roster',
          employeeId: 'emp-1',
          effectiveFrom: new Date('2036-07-10T00:00:00.000Z'),
          effectiveTo: new Date('2036-07-10T00:00:00.000Z'),
          source: 'ROSTER_UPLOAD',
          locationId: 'loc-remote',
          shift: { id: 'shift-2', name: 'Night' },
          location: { id: 'loc-remote', name: 'Remote' },
          employee: {
            id: 'emp-1',
            firstName: 'A',
            lastName: 'One',
            employeeCode: 'PH001',
            location: { id: 'loc-hq', name: 'HQ' },
          },
        },
      ];
      const prisma = { shiftAssignment: { findMany: jest.fn().mockResolvedValue(assignments) } };
      const service = newAttendanceService(prisma);

      const rows = await service.listShiftAssignments('tenant-1', { employeeId: 'emp-1' });

      expect(rows[0]).toMatchObject({
        status: 'ACTIVE',
        locationIsOverride: false,
        effectiveLocation: { id: 'loc-hq', name: 'HQ' },
        overlappingAssignmentIds: ['a-roster'],
      });
      expect(rows[1]).toMatchObject({
        status: 'SCHEDULED',
        locationIsOverride: true,
        effectiveLocation: { id: 'loc-remote', name: 'Remote' },
        overlappingAssignmentIds: ['a-base'],
      });
    });

    it('reports the assignment attendance actually uses on a date', async () => {
      const prisma = {
        employee: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'emp-1',
            firstName: 'Rohan',
            lastName: 'Kapoor',
            employeeCode: 'EMP-0008',
            locationId: 'loc-hq',
            location: { id: 'loc-hq', name: 'HQ' },
          }),
        },
        shiftAssignment: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'a-roster',
            source: 'ROSTER_UPLOAD',
            locationId: 'loc-remote',
            effectiveFrom: new Date('2026-07-10T00:00:00.000Z'),
            effectiveTo: new Date('2026-07-10T00:00:00.000Z'),
            shift: { id: 'shift-2', name: 'Night' },
          }),
        },
        location: { findFirst: jest.fn().mockResolvedValue({ id: 'loc-remote', name: 'Remote' }) },
        shift: { findFirst: jest.fn() },
      };
      const service = newAttendanceService(prisma);

      await expect(service.effectiveShiftFor('tenant-1', 'emp-1', '2026-07-10')).resolves.toMatchObject(
        {
          source: 'ROSTER_UPLOAD',
          shift: { id: 'shift-2' },
          effectiveLocation: { id: 'loc-remote' },
          defaultLocation: { id: 'loc-hq' },
          locationIsOverride: true,
          // Names the employee resolved, so the answer can never be shown as
          // applying to a whole roster table.
          employee: { firstName: 'Rohan', lastName: 'Kapoor', employeeCode: 'EMP-0008' },
        },
      );
    });

    it('clears the location override back to the employee location on an empty string', async () => {
      const prisma = {
        shiftAssignment: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'a-1',
            effectiveFrom: new Date('2026-07-01T00:00:00.000Z'),
            effectiveTo: null,
          }),
          update: jest.fn().mockResolvedValue({ id: 'a-1' }),
        },
      };
      const service = newAttendanceService(prisma);

      await service.updateShiftAssignment('tenant-1', 'a-1', { locationId: '' });

      expect(prisma.shiftAssignment.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ locationId: null }) }),
      );
    });

    it('rejects an end date before the start date', async () => {
      const prisma = {
        shiftAssignment: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'a-1',
            effectiveFrom: new Date('2026-07-10T00:00:00.000Z'),
            effectiveTo: null,
          }),
          update: jest.fn(),
        },
      };
      const service = newAttendanceService(prisma);

      await expect(
        service.updateShiftAssignment('tenant-1', 'a-1', { effectiveTo: '2026-07-01' }),
      ).rejects.toThrow('Effective to cannot be before effective from');
      expect(prisma.shiftAssignment.update).not.toHaveBeenCalled();
    });

    it('refuses to touch an assignment from another tenant', async () => {
      const prisma = {
        shiftAssignment: {
          findFirst: jest.fn().mockResolvedValue(null),
          delete: jest.fn(),
          update: jest.fn(),
        },
      };
      const service = newAttendanceService(prisma);

      await expect(service.deleteShiftAssignment('tenant-1', 'a-1')).rejects.toThrow(
        'Shift assignment not found',
      );
      expect(prisma.shiftAssignment.delete).not.toHaveBeenCalled();
      expect(prisma.shiftAssignment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'a-1', employee: { tenantId: 'tenant-1' } } }),
      );
    });

    it('reports the headcount actually on each shift, not the lifetime row count', async () => {
      const prisma = {
        shift: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ id: 'shift-1', name: 'Day', _count: { shiftAssignments: 42 } }]),
          findFirst: jest.fn().mockResolvedValue({ id: 'shift-1' }),
        },
        shiftAssignment: { findMany: jest.fn().mockResolvedValue([]) },
        employee: { findMany: jest.fn().mockResolvedValue([{ id: 'emp-1' }, { id: 'emp-2' }]) },
      };
      const service = newAttendanceService(prisma);

      const shifts = await service.listShifts('tenant-1');

      expect(shifts[0]).toMatchObject({
        _count: { shiftAssignments: 42 },
        activeAssignments: 2,
      });
    });
  });

  describe('attendance row imports', () => {
    function importPrisma() {
      return {
        employee: {
          findMany: jest.fn().mockResolvedValue([{ id: 'emp-1', employeeCode: 'PH001', locationId: 'loc-hq' }]),
          findFirst: jest.fn().mockResolvedValue({ locationId: 'loc-hq' }),
        },
        shiftAssignment: { findFirst: jest.fn().mockResolvedValue(null) },
        shift: { findFirst: jest.fn().mockResolvedValue({ id: 'shift-1', overtimeAfterMinutes: 480 }) },
        attendanceRecord: { upsert: jest.fn().mockResolvedValue({}) },
        attendanceCaptureSetting: { findFirst: jest.fn().mockResolvedValue(null) },
        attendanceRule: { findFirst: jest.fn().mockResolvedValue(null) },
      };
    }

    it('accepts YYYY-MM-DD and ISO 8601 dates on the same UTC day', async () => {
      const prisma = importPrisma();
      const service = newAttendanceService(prisma);

      await service.importAttendanceRows(
        'tenant-1',
        {
          rows: [
            { employeeCode: 'PH001', date: '2026-07-01' },
            { employeeCode: 'PH001', date: '2026-07-01T00:00:00.000Z' },
          ],
        },
        'MANUAL',
      );

      const dates = prisma.attendanceRecord.upsert.mock.calls.map(
        ([args]: [{ where: { employeeId_date: { date: Date } } }]) => args.where.employeeId_date.date.toISOString(),
      );
      expect(dates).toEqual(['2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z']);
    });

    it('reports an unsupported date per row instead of failing the whole file', async () => {
      const prisma = importPrisma();
      const service = newAttendanceService(prisma);

      const result = await service.importAttendanceRows(
        'tenant-1',
        {
          rows: [
            { employeeCode: 'PH001', date: '01/07/2026' },
            { employeeCode: 'PH001', date: '2026-07-01' },
          ],
        },
        'MANUAL',
      );

      expect(result).toMatchObject({ imported: 1, skipped: 1 });
      expect(result.errors[0]).toMatchObject({
        row: 1,
        employeeCode: 'PH001',
        error: expect.stringContaining('Unsupported date "01/07/2026" — use YYYY-MM-DD'),
      });
    });

    it('applies the capture rules of the location the assignment pins the day to', async () => {
      const prisma = importPrisma();
      prisma.shiftAssignment.findFirst.mockResolvedValue({
        id: 'a-1',
        source: 'ROSTER_UPLOAD',
        locationId: 'loc-remote',
        effectiveFrom: new Date('2026-07-01T00:00:00.000Z'),
        effectiveTo: new Date('2026-07-01T00:00:00.000Z'),
        shift: { id: 'shift-2' },
      });
      const service = newAttendanceService(prisma);

      await service.importAttendanceRows(
        'tenant-1',
        { rows: [{ employeeCode: 'PH001', date: '2026-07-01' }] },
        'MANUAL',
      );

      expect(prisma.attendanceCaptureSetting.findFirst).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', locationId: 'loc-remote', mode: 'MANUAL' },
      });
    });
  });
});
