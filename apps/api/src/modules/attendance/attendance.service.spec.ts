import { AttendanceService } from './attendance.service';

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
  const service = new AttendanceService(prisma as any);
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
    const service = new AttendanceService(prisma as any);

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
    const service = new AttendanceService(prisma as any);

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
    const service = new AttendanceService(prisma as any);

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
      },
      shiftAssignment: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      shift: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'shift-1',
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
    };
    const service = new AttendanceService(prisma as any);

    await expect(
      service.importBiometricPunches('tenant-1', {
        rows: [
          {
            employeeCode: 'PH001',
            date: '2026-07-05',
            punchIn: '2026-07-05T09:30:00.000Z',
            punchOut: '2026-07-05T18:15:00.000Z',
            deviceId: 'bio-1',
          },
          { employeeCode: 'MISSING', date: '2026-07-05' },
        ],
      }),
    ).resolves.toEqual({
      imported: 1,
      skipped: 1,
      unknownEmployeeCodes: ['MISSING'],
    });
    expect(prisma.attendanceRecord.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        employeeId: 'emp-1',
        shiftId: 'shift-1',
        punchSource: 'BIOMETRIC',
        workingMinutes: 525,
        overtimeMinutes: 45,
        isFinalized: true,
      }),
    }));
  });

  it('imports API attendance rows as finalized API source records', async () => {
    const prisma = {
      employee: {
        findMany: jest.fn().mockResolvedValue([{ id: 'emp-1', employeeCode: 'PH001', locationId: null }]),
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
    };
    const service = new AttendanceService(prisma as any);

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

  it('bills no overtime for a full 09:00-18:00 shift with a 60 minute break', async () => {
    const prisma = {
      employee: {
        findMany: jest.fn().mockResolvedValue([{ id: 'emp-1', employeeCode: 'PH001', locationId: null }]),
      },
      shiftAssignment: { findFirst: jest.fn().mockResolvedValue(null) },
      shift: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'shift-1',
          overtimeAfterMinutes: 480,
          breakDurationMins: 60,
          halfDayAfterMinutes: 240,
          minWorkingMinutes: 480,
        }),
      },
      attendanceRecord: { upsert: jest.fn().mockResolvedValue({}) },
      attendanceCaptureSetting: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new AttendanceService(prisma as any);

    await service.importAttendanceRows(
      'tenant-1',
      {
        rows: [
          {
            employeeCode: 'PH001',
            date: '2026-07-06',
            punchIn: '2026-07-06T09:00:00.000Z',
            punchOut: '2026-07-06T18:00:00.000Z',
          },
        ],
      },
      'MANUAL',
    );

    // 540 gross - 60 break = 480 worked, exactly the 480 overtime threshold.
    expect(prisma.attendanceRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ workingMinutes: 540, overtimeMinutes: 0 }),
      }),
    );
  });

  it('bills overtime only for time worked beyond the shift once the break is removed', async () => {
    const prisma = {
      employee: {
        findMany: jest.fn().mockResolvedValue([{ id: 'emp-1', employeeCode: 'PH001', locationId: null }]),
      },
      shiftAssignment: { findFirst: jest.fn().mockResolvedValue(null) },
      shift: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'shift-1',
          overtimeAfterMinutes: 480,
          breakDurationMins: 60,
          halfDayAfterMinutes: 240,
          minWorkingMinutes: 480,
        }),
      },
      attendanceRecord: { upsert: jest.fn().mockResolvedValue({}) },
      attendanceCaptureSetting: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new AttendanceService(prisma as any);

    await service.importAttendanceRows(
      'tenant-1',
      {
        rows: [
          {
            employeeCode: 'PH001',
            date: '2026-07-06',
            punchIn: '2026-07-06T09:00:00.000Z',
            punchOut: '2026-07-06T19:30:00.000Z',
          },
        ],
      },
      'MANUAL',
    );

    // 630 gross - 60 break = 570 worked, 90 past the 480 threshold.
    expect(prisma.attendanceRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ workingMinutes: 630, overtimeMinutes: 90 }),
      }),
    );
  });

  it('blocks imports when the capture mode is disabled', async () => {
    const prisma = {
      employee: {
        findMany: jest.fn().mockResolvedValue([{ id: 'emp-1', employeeCode: 'PH001', locationId: null }]),
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
    const service = new AttendanceService(prisma as any);

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
          overtimeAfterMinutes: 480,
          halfDayAfterMinutes: 240,
          minWorkingMinutes: 480,
        }),
      },
    };
    const service = new AttendanceService(prisma as any);

    await service.updateRecord('tenant-1', 'record-1', {
      punchIn: '2026-07-05T09:30:00.000Z',
      punchOut: '2026-07-05T18:30:00.000Z',
    });

    expect(prisma.attendanceRecord.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'record-1' },
      data: expect.objectContaining({
        punchIn: new Date('2026-07-05T09:30:00.000Z'),
        punchOut: new Date('2026-07-05T18:30:00.000Z'),
        workingMinutes: 540,
        overtimeMinutes: 60,
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
    const service = new AttendanceService(prisma as any);

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
    const service = new AttendanceService(prisma as any);

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
      const service = new AttendanceService(prisma as any);

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
      const service = new AttendanceService(prisma as any);

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
      const assigned = await new AttendanceService(ledgerPrisma() as any).monthlyLedgerFor(
        'tenant-1',
        'emp-1',
        month,
      );
      expect(assigned.days.find((day) => day.date.toISOString().startsWith('2026-06-06'))?.shiftId).toBe(
        'shift-1',
      );

      const service = new AttendanceService(ledgerPrisma({ fallbackShift: null }) as any);
      const ledger = await service.monthlyLedgerFor('tenant-1', 'emp-1', month);

      const byDate = new Map(ledger.days.map((day) => [day.date.toISOString().slice(0, 10), day]));
      expect(byDate.get('2026-06-06')?.status).toBe('WEEKEND');
      expect(byDate.get('2026-06-07')?.status).toBe('WEEKEND');
      expect(byDate.get('2026-06-08')?.status).toBe('ABSENT');
    });

    it('excludes days before joining and after relieving', async () => {
      const service = new AttendanceService(ledgerPrisma() as any);

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
      const service = new AttendanceService(ledgerPrisma() as any);
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
      const service = new AttendanceService(prisma as any);

      const ledger = await service.monthlyLedgerFor('tenant-1', 'emp-1', month);

      expect(ledger.counts.expectedWorkingDays).toBe(4);
      // 06-30 stays ABSENT: (1 + 1 + 0.5) / 4 = 62.5%
      expect(ledger.counts.attendancePercentage).toBe(62.5);
      expect(ledger.counts.absent).toBe(1);
    });

    it('returns a null percentage when the window has no attendable working days', async () => {
      const service = new AttendanceService(ledgerPrisma() as any);

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
      const service = new AttendanceService(prisma as any);

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
      const service = new AttendanceService(prisma as any);

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
      const service = new AttendanceService(prisma as any);

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
      const service = new AttendanceService(prisma as any);

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
      const service = new AttendanceService(prisma as any);

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
      const service = new AttendanceService(prisma as any);

      const ledger = await service.monthlyLedgerFor('tenant-1', 'emp-1', month);

      const byDate = new Map(ledger.days.map((day) => [day.date.toISOString().slice(0, 10), day]));
      expect(byDate.get('2026-06-01')?.isEarlyDeparture).toBe(false);
      expect(byDate.get('2026-06-02')?.isEarlyDeparture).toBe(true);
      expect(byDate.get('2026-06-03')?.isEarlyDeparture).toBe(false);
      expect(ledger.counts.earlyDepartures).toBe(1);
      expect(ledger.counts.lateArrivals).toBe(0);
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
      const service = new AttendanceService(prisma as any);

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
    const service = new AttendanceService(prisma as any);

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
    const service = new AttendanceService(prisma as any);

    await service.finalizeMonth('tenant-1', 'emp-hr', { month: '2026-06' });

    const byDate = new Map(created.map((row) => [row.date, row.status]));
    expect(byDate.get('2026-06-01')).toBe('ABSENT');
    expect(byDate.get('2026-06-02')).toBe('ON_LEAVE');
    expect(byDate.get('2026-06-03')).toBe('HOLIDAY');
    expect(byDate.get('2026-06-06')).toBe('WEEKEND');
    expect(created).toHaveLength(30);
  });
});
