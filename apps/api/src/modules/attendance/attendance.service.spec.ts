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
});
