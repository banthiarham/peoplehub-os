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
});
