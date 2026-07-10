import { AttendanceService } from './attendance.service';

describe('AttendanceService', () => {
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
