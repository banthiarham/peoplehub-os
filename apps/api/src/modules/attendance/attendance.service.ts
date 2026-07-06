import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AttendanceCaptureMode, AttendanceStatus, Prisma, ShiftSwapStatus } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { AuthUser } from '../../common/types/auth-user';
import { toCsv } from '../../common/utils/csv';
import {
  AssignShiftDto,
  CheckInDto,
  CheckOutDto,
  CreateShiftSwapDto,
  CreateShiftDto,
  DecideShiftSwapDto,
  FinalizeAttendanceDto,
  ImportAttendanceRowsDto,
  ImportBiometricPunchesDto,
  ImportRosterDto,
  ListAttendanceDto,
  QrPunchDto,
  RegularizeDto,
  UpsertCaptureSettingDto,
  UpsertAttendanceRuleDto,
  UpsertHolidayDto,
} from './dto/attendance.dto';

/** Reject GPS fixes with a worse accuracy radius than this (meters). */
const MAX_FIX_ACCURACY_M = 150;
/** Reject GPS fixes captured longer ago than this (ms). */
const MAX_FIX_AGE_MS = 30_000;

const CAPTURE_MODE_DEFAULTS: Record<
  AttendanceCaptureMode,
  { enabled: boolean; requiresGps: boolean; requiresGeofence: boolean; notes: string }
> = {
  [AttendanceCaptureMode.WEB]: {
    enabled: true,
    requiresGps: false,
    requiresGeofence: false,
    notes: 'Browser punch without mandatory GPS. Office geofence still applies when location is configured.',
  },
  [AttendanceCaptureMode.MOBILE]: {
    enabled: true,
    requiresGps: false,
    requiresGeofence: false,
    notes: 'Mobile browser punch without mandatory GPS.',
  },
  [AttendanceCaptureMode.GPS]: {
    enabled: true,
    requiresGps: true,
    requiresGeofence: true,
    notes: 'GPS punch with fresh location and geofence validation where location coordinates exist.',
  },
  [AttendanceCaptureMode.QR]: {
    enabled: true,
    requiresGps: false,
    requiresGeofence: false,
    notes: 'Location QR punch. QR must match employee assigned location.',
  },
  [AttendanceCaptureMode.BIOMETRIC]: {
    enabled: true,
    requiresGps: false,
    requiresGeofence: false,
    notes: 'Device import from biometric machines.',
  },
  [AttendanceCaptureMode.MANUAL]: {
    enabled: true,
    requiresGps: false,
    requiresGeofence: false,
    notes: 'Manual HR/admin attendance import or correction.',
  },
  [AttendanceCaptureMode.API_IMPORT]: {
    enabled: true,
    requiresGps: false,
    requiresGeofence: false,
    notes: 'External attendance system API sync.',
  },
};

function dateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

function parseMonth(month?: string): { start: Date; end: Date } {
  const now = new Date();
  const [y, m] = month ? month.split('-').map(Number) : [now.getFullYear(), now.getMonth() + 1];
  return {
    start: new Date(Date.UTC(y, m - 1, 1)),
    end: new Date(Date.UTC(y, m, 1)),
  };
}

function monthParts(month: string): { year: number; monthNumber: number; start: Date; endExclusive: Date; endInclusive: Date } {
  const [year, monthNumber] = month.split('-').map(Number);
  const start = new Date(Date.UTC(year, monthNumber - 1, 1));
  const endExclusive = new Date(Date.UTC(year, monthNumber, 1));
  const endInclusive = new Date(endExclusive.getTime() - 24 * 60 * 60 * 1000);
  return { year, monthNumber, start, endExclusive, endInclusive };
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  private requireEmployee(user: AuthUser): string {
    if (!user.employeeId) {
      throw new ForbiddenException('No employee profile linked to this user');
    }
    return user.employeeId;
  }

  private async currentShiftAt(tenantId: string, employeeId: string, at: Date) {
    const assignment = await this.prisma.shiftAssignment.findFirst({
      where: {
        employeeId,
        effectiveFrom: { lte: at },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: at } }],
      },
      include: { shift: true },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (assignment) return assignment.shift;
    return this.prisma.shift.findFirst({ where: { tenantId, isActive: true } });
  }

  private async currentShift(tenantId: string, employeeId: string) {
    return this.currentShiftAt(tenantId, employeeId, new Date());
  }

  private async attendanceRule(
    tenantId: string,
    input: { shiftId?: string | null; locationId?: string | null; date?: Date },
  ) {
    const date = input.date ?? new Date();
    const activeWindow = {
      effectiveFrom: { lte: date },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }],
    };
    return this.prisma.attendanceRule.findFirst({
      where: {
        tenantId,
        isActive: true,
        ...activeWindow,
        OR: [
          ...(input.shiftId && input.locationId ? [{ shiftId: input.shiftId, locationId: input.locationId }] : []),
          ...(input.shiftId ? [{ shiftId: input.shiftId, locationId: null }] : []),
          ...(input.locationId ? [{ shiftId: null, locationId: input.locationId }] : []),
          { isDefault: true },
        ],
      },
      orderBy: [{ isDefault: 'asc' }, { updatedAt: 'desc' }],
    });
  }

  private async employeeLocationId(tenantId: string, employeeId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
      select: { locationId: true },
    });
    return employee?.locationId ?? null;
  }

  private deriveInteractiveCaptureMode(dto: CheckInDto): AttendanceCaptureMode {
    if (dto.geoLat != null || dto.geoLng != null) return AttendanceCaptureMode.GPS;
    const descriptor = `${dto.platform ?? ''} ${dto.deviceName ?? ''}`.toLowerCase();
    if (/android|ios|iphone|ipad|mobile/.test(descriptor)) return AttendanceCaptureMode.MOBILE;
    return AttendanceCaptureMode.WEB;
  }

  private importSourceToCaptureMode(source: 'BIOMETRIC' | 'MANUAL' | 'API'): AttendanceCaptureMode {
    if (source === 'API') return AttendanceCaptureMode.API_IMPORT;
    return source === 'BIOMETRIC' ? AttendanceCaptureMode.BIOMETRIC : AttendanceCaptureMode.MANUAL;
  }

  private fallbackCaptureSetting(mode: AttendanceCaptureMode, tenantId: string, locationId?: string | null) {
    return {
      id: `default:${tenantId}:${locationId ?? 'tenant'}:${mode}`,
      tenantId,
      locationId: locationId ?? null,
      mode,
      ...CAPTURE_MODE_DEFAULTS[mode],
      createdAt: null,
      updatedAt: null,
      inherited: true,
    };
  }

  async listCaptureSettings(tenantId: string, locationId?: string) {
    const modes = Object.values(AttendanceCaptureMode);
    const tenantRows = await this.prisma.attendanceCaptureSetting.findMany({
      where: { tenantId, locationId: null },
      orderBy: { mode: 'asc' },
    });
    const locationRows = locationId
      ? await this.prisma.attendanceCaptureSetting.findMany({
          where: { tenantId, locationId },
          orderBy: { mode: 'asc' },
        })
      : [];
    const tenantByMode = new Map(tenantRows.map((row) => [row.mode, row]));
    const locationByMode = new Map(locationRows.map((row) => [row.mode, row]));

    return modes.map((mode) => {
      const tenantDefault = tenantByMode.get(mode) ?? this.fallbackCaptureSetting(mode, tenantId, null);
      const locationOverride = locationId ? locationByMode.get(mode) : null;
      const effective = locationOverride ?? tenantDefault;
      return {
        ...effective,
        locationId: locationOverride?.locationId ?? (locationId ? locationId : null),
        inherited: Boolean(locationId && !locationOverride),
        tenantDefault,
        locationOverride,
      };
    });
  }

  async upsertCaptureSetting(tenantId: string, dto: UpsertCaptureSettingDto) {
    if (dto.locationId) {
      const location = await this.prisma.location.findFirst({ where: { id: dto.locationId, tenantId } });
      if (!location) throw new NotFoundException('Location not found');
    }
    const existing = await this.prisma.attendanceCaptureSetting.findFirst({
      where: { tenantId, locationId: dto.locationId ?? null, mode: dto.mode },
    });
    const data = {
      enabled: dto.enabled,
      requiresGps: dto.requiresGps ?? CAPTURE_MODE_DEFAULTS[dto.mode].requiresGps,
      requiresGeofence: dto.requiresGeofence ?? CAPTURE_MODE_DEFAULTS[dto.mode].requiresGeofence,
      notes: dto.notes,
    };
    if (existing) {
      return this.prisma.attendanceCaptureSetting.update({ where: { id: existing.id }, data });
    }
    return this.prisma.attendanceCaptureSetting.create({
      data: { tenantId, locationId: dto.locationId ?? null, mode: dto.mode, ...data },
    });
  }

  private async captureSettingFor(
    tenantId: string,
    mode: AttendanceCaptureMode,
    locationId?: string | null,
  ) {
    if (locationId) {
      const scoped = await this.prisma.attendanceCaptureSetting.findFirst({
        where: { tenantId, locationId, mode },
      });
      if (scoped) return scoped;
    }
    const tenantDefault = await this.prisma.attendanceCaptureSetting.findFirst({
      where: { tenantId, locationId: null, mode },
    });
    return tenantDefault ?? this.fallbackCaptureSetting(mode, tenantId, locationId);
  }

  private validateGpsFix(dto: CheckInDto): void {
    if (dto.geoLat == null || dto.geoLng == null) {
      throw new BadRequestException('GPS location is required for this attendance capture mode');
    }
    if (dto.fixAt != null) {
      const ageMs = Date.now() - dto.fixAt;
      if (ageMs > MAX_FIX_AGE_MS) {
        throw new BadRequestException(
          `Your location fix is ${Math.round(ageMs / 1000)}s old — waiting for a fresh GPS fix, try again`,
        );
      }
    }
    if (dto.geoAccuracy != null && dto.geoAccuracy > MAX_FIX_ACCURACY_M) {
      throw new BadRequestException(
        `GPS accuracy is ±${Math.round(dto.geoAccuracy)}m — needs to be within ±${MAX_FIX_ACCURACY_M}m`,
      );
    }
  }

  private async assertCaptureModeAllowed(
    tenantId: string,
    mode: AttendanceCaptureMode,
    locationId?: string | null,
    dto?: CheckInDto,
    employeeId?: string,
  ) {
    const setting = await this.captureSettingFor(tenantId, mode, locationId);
    if (!setting.enabled) {
      throw new ForbiddenException(`${mode.replace('_', ' ')} attendance capture is disabled by HR`);
    }
    if (setting.requiresGps || mode === AttendanceCaptureMode.GPS) {
      if (!dto) throw new BadRequestException('GPS location is required for this attendance capture mode');
      this.validateGpsFix(dto);
    }
    if (setting.requiresGeofence && dto && employeeId) {
      await this.validateGeofence(tenantId, employeeId, dto);
    }
  }

  async checkIn(user: AuthUser, dto: CheckInDto, forcedSource?: string) {
    const employeeId = this.requireEmployee(user);
    const today = dateOnly(new Date());
    const locationId = await this.employeeLocationId(user.tenantId, employeeId);
    const captureMode =
      forcedSource === 'QR' ? AttendanceCaptureMode.QR : this.deriveInteractiveCaptureMode(dto);

    await this.assertCaptureModeAllowed(user.tenantId, captureMode, locationId, dto, employeeId);
    await this.validateDevice(user.tenantId, employeeId, dto);
    await this.validateGeofence(user.tenantId, employeeId, dto);
    const existing = await this.prisma.attendanceRecord.findUnique({
      where: { employeeId_date: { employeeId, date: today } },
    });
    if (existing?.punchIn) throw new BadRequestException('Already checked in today');

    const shift = await this.currentShift(user.tenantId, employeeId);
    const rule = await this.attendanceRule(user.tenantId, { shiftId: shift?.id, locationId });
    const now = new Date();
    let status: 'PRESENT' | 'LATE' = 'PRESENT';
    if (shift) {
      const [h, m] = shift.startTime.split(':').map(Number);
      const shiftStart = new Date(now);
      shiftStart.setHours(h, m + (rule?.lateMarkAfterMins ?? shift.gracePeriodMins ?? 15), 0, 0);
      if (now > shiftStart) status = 'LATE';
    }
    const punch = {
      shiftId: shift?.id,
      punchIn: now,
      status,
      punchSource: forcedSource ?? captureMode,
      geoLat: dto.geoLat,
      geoLng: dto.geoLng,
      geoAccuracy: dto.geoAccuracy,
    };
    return this.prisma.attendanceRecord.upsert({
      where: { employeeId_date: { employeeId, date: today } },
      create: { tenantId: user.tenantId, employeeId, date: today, ...punch },
      update: punch,
    });
  }

  async qrCheckIn(user: AuthUser, dto: QrPunchDto) {
    const [, locationId] = dto.qrCode.split(':');
    if (!locationId || !dto.qrCode.startsWith('PHUB:')) {
      throw new BadRequestException('Invalid attendance QR code');
    }
    const employeeId = this.requireEmployee(user);
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId: user.tenantId },
      select: { locationId: true },
    });
    if (employee?.locationId !== locationId) {
      throw new ForbiddenException('This QR code does not match your assigned work location');
    }
    return this.checkIn(user, dto, 'QR');
  }

  /**
   * One punch device per employee, one employee per device. The first punch
   * binds the device; after that, punches from any other device are rejected
   * until HR resets the binding. A device already bound to a colleague can
   * never be used, which blocks credential sharing / buddy punching.
   */
  private async validateDevice(
    tenantId: string,
    employeeId: string,
    dto: { deviceId: string; deviceName?: string; platform?: string },
  ): Promise<void> {
    const bound = await this.prisma.employeeDevice.findUnique({ where: { employeeId } });
    if (bound) {
      if (bound.deviceId !== dto.deviceId) {
        throw new ForbiddenException(
          'This is not your registered punch device. If you changed phones, ask HR to reset your device binding.',
        );
      }
      await this.prisma.employeeDevice.update({
        where: { employeeId },
        data: { lastSeenAt: new Date() },
      });
      return;
    }
    const takenByOther = await this.prisma.employeeDevice.findUnique({
      where: { tenantId_deviceId: { tenantId: tenantId, deviceId: dto.deviceId } },
    });
    if (takenByOther) {
      throw new ForbiddenException(
        'This device is already registered to another employee — punches must come from your own device.',
      );
    }
    await this.prisma.employeeDevice.create({
      data: {
        tenantId,
        employeeId,
        deviceId: dto.deviceId,
        deviceName: dto.deviceName,
        platform: dto.platform,
      },
    });
  }

  async myDevice(user: AuthUser) {
    const employeeId = this.requireEmployee(user);
    return this.prisma.employeeDevice.findUnique({
      where: { employeeId },
      select: {
        deviceId: true,
        deviceName: true,
        platform: true,
        registeredAt: true,
        lastSeenAt: true,
      },
    });
  }

  async deviceOf(tenantId: string, employeeId: string) {
    return this.prisma.employeeDevice.findFirst({
      where: { employeeId, tenantId },
      select: { deviceName: true, platform: true, registeredAt: true, lastSeenAt: true },
    });
  }

  async resetDevice(tenantId: string, employeeId: string) {
    const bound = await this.prisma.employeeDevice.findUnique({ where: { employeeId } });
    if (!bound || bound.tenantId !== tenantId) {
      throw new NotFoundException('No device registered for this employee');
    }
    await this.prisma.employeeDevice.delete({ where: { employeeId } });
    return { reset: true };
  }

  /**
   * Enforces the office geofence for OFFICE-mode employees whose location has
   * coordinates and an attendanceRadius configured. For them a fresh,
   * accurate GPS fix is mandatory — no fix, a stale fix, or a low-accuracy
   * fix all reject the punch so a cached or spoofed-blurry location can
   * never sneak past the fence.
   */
  private async validateGeofence(
    tenantId: string,
    employeeId: string,
    dto: CheckInDto,
  ): Promise<void> {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
      select: { workMode: true, location: true },
    });
    const loc = employee?.location;
    if (employee?.workMode !== 'OFFICE' || !loc?.geoLat || !loc?.geoLng || !loc?.attendanceRadius) {
      return;
    }
    if (dto.geoLat == null || dto.geoLng == null) {
      throw new BadRequestException(
        `Location is required to check in at ${loc.name} — allow location access and try again`,
      );
    }
    if (dto.fixAt != null) {
      const ageMs = Date.now() - dto.fixAt;
      if (ageMs > MAX_FIX_AGE_MS) {
        throw new BadRequestException(
          `Your location fix is ${Math.round(ageMs / 1000)}s old — waiting for a fresh GPS fix, try again`,
        );
      }
    }
    if (dto.geoAccuracy != null && dto.geoAccuracy > MAX_FIX_ACCURACY_M) {
      throw new BadRequestException(
        `GPS accuracy is ±${Math.round(dto.geoAccuracy)}m — needs to be within ±${MAX_FIX_ACCURACY_M}m. Step outside or near a window and try again.`,
      );
    }
    const distance = haversineMeters(dto.geoLat, dto.geoLng, loc.geoLat, loc.geoLng);
    if (distance > loc.attendanceRadius) {
      const away =
        distance >= 1000 ? `${(distance / 1000).toFixed(1)}km` : `${Math.round(distance)}m`;
      throw new BadRequestException(
        `You are ${away} away from ${loc.name} — check-in is allowed within ${loc.attendanceRadius}m`,
      );
    }
  }

  async checkOut(user: AuthUser, dto: CheckOutDto) {
    const employeeId = this.requireEmployee(user);
    await this.validateDevice(user.tenantId, employeeId, dto);
    const today = dateOnly(new Date());
    const record = await this.prisma.attendanceRecord.findUnique({
      where: { employeeId_date: { employeeId, date: today } },
    });
    if (!record?.punchIn) throw new BadRequestException('Check in first');
    const now = new Date();
    const workingMinutes = Math.round((now.getTime() - record.punchIn.getTime()) / 60000);
    return this.prisma.attendanceRecord.update({
      where: { id: record.id },
      data: { punchOut: now, workingMinutes },
    });
  }

  async today(tenantId: string) {
    const today = dateOnly(new Date());
    const [employees, records, onLeave] = await Promise.all([
      this.prisma.employee.findMany({
        where: { tenantId, status: { notIn: ['EXITED', 'INACTIVE', 'CANDIDATE', 'PREBOARDING'] } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeCode: true,
          department: { select: { name: true } },
        },
      }),
      this.prisma.attendanceRecord.findMany({ where: { tenantId, date: today } }),
      this.prisma.leaveRequest.findMany({
        where: { tenantId, status: 'APPROVED', fromDate: { lte: today }, toDate: { gte: today } },
        select: { employeeId: true },
      }),
    ]);
    const recordMap = new Map(records.map((r) => [r.employeeId, r]));
    const leaveSet = new Set(onLeave.map((l) => l.employeeId));

    const rows = employees.map((e) => {
      const rec = recordMap.get(e.id);
      const status = rec?.status ?? (leaveSet.has(e.id) ? 'ON_LEAVE' : 'ABSENT');
      return {
        employee: e,
        status,
        punchIn: rec?.punchIn ?? null,
        punchOut: rec?.punchOut ?? null,
        workingMinutes: rec?.workingMinutes ?? null,
        punchSource: rec?.punchSource ?? null,
      };
    });
    return {
      date: today,
      summary: {
        present: rows.filter((r) => r.status === 'PRESENT').length,
        late: rows.filter((r) => r.status === 'LATE').length,
        absent: rows.filter((r) => r.status === 'ABSENT').length,
        onLeave: rows.filter((r) => r.status === 'ON_LEAVE').length,
        total: rows.length,
      },
      rows,
    };
  }

  async list(tenantId: string, q: ListAttendanceDto) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const where: Prisma.AttendanceRecordWhereInput = {
      tenantId,
      ...(q.employeeId && { employeeId: q.employeeId }),
      ...(q.status && { status: q.status }),
      ...((q.from || q.to) && {
        date: {
          ...(q.from && { gte: new Date(q.from) }),
          ...(q.to && { lte: new Date(q.to) }),
        },
      }),
    };
    const [data, total] = await Promise.all([
      this.prisma.attendanceRecord.findMany({
        where,
        include: {
          employee: {
            select: { id: true, firstName: true, lastName: true, employeeCode: true },
          },
        },
        orderBy: { date: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.attendanceRecord.count({ where }),
    ]);
    return { data, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }

  async exportMonthCsv(tenantId: string, month?: string): Promise<{ csv: string; month: string }> {
    const { start, end } = parseMonth(month);
    const records = await this.prisma.attendanceRecord.findMany({
      where: { tenantId, date: { gte: start, lt: end } },
      include: {
        employee: {
          select: {
            employeeCode: true,
            firstName: true,
            lastName: true,
            department: { select: { name: true } },
          },
        },
      },
      orderBy: [{ date: 'asc' }, { employeeId: 'asc' }],
    });
    const csv = toCsv(
      records.map((r) => ({
        date: r.date.toISOString().slice(0, 10),
        employeeCode: r.employee.employeeCode,
        name: `${r.employee.firstName} ${r.employee.lastName}`,
        department: r.employee.department?.name ?? '',
        status: r.status,
        punchIn: r.punchIn,
        punchOut: r.punchOut,
        workingMinutes: r.workingMinutes,
        source: r.punchSource ?? '',
        gpsAccuracyM: r.geoAccuracy,
      })),
    );
    return { csv, month: start.toISOString().slice(0, 7) };
  }

  async importBiometricPunches(tenantId: string, dto: ImportBiometricPunchesDto) {
    return this.importAttendanceRows(tenantId, dto, 'BIOMETRIC');
  }

  async importAttendanceRows(
    tenantId: string,
    dto: ImportAttendanceRowsDto | ImportBiometricPunchesDto,
    source: 'BIOMETRIC' | 'MANUAL' | 'API',
  ) {
    const employeeCodes = [...new Set(dto.rows.map((row) => row.employeeCode))];
    const employees = await this.prisma.employee.findMany({
      where: { tenantId, employeeCode: { in: employeeCodes } },
      select: { id: true, employeeCode: true, locationId: true },
    });
    const employeeByCode = new Map(employees.map((employee) => [employee.employeeCode, employee]));
    let imported = 0;
    const unknownEmployeeCodes = new Set<string>();

    for (const row of dto.rows) {
      const employee = employeeByCode.get(row.employeeCode);
      if (!employee) {
        unknownEmployeeCodes.add(row.employeeCode);
        continue;
      }
      const date = dateOnly(new Date(row.date));
      await this.assertCaptureModeAllowed(
        tenantId,
        this.importSourceToCaptureMode(source),
        employee.locationId,
      );
      const punchIn = row.punchIn ? new Date(row.punchIn) : undefined;
      const punchOut = row.punchOut ? new Date(row.punchOut) : undefined;
      const workingMinutes =
        punchIn && punchOut
          ? Math.max(0, Math.round((punchOut.getTime() - punchIn.getTime()) / 60000))
          : undefined;
      const shift = await this.currentShiftAt(tenantId, employee.id, date);
      const status = row.status ?? this.classifyAttendanceStatus({
        workingMinutes,
        shift,
        tenantId,
        locationId: employee.locationId,
        date,
      });
      await this.prisma.attendanceRecord.upsert({
        where: { employeeId_date: { employeeId: employee.id, date } },
        create: {
          tenantId,
          employeeId: employee.id,
          shiftId: shift?.id,
          date,
          punchIn,
          punchOut,
          workingMinutes,
          overtimeMinutes: this.overtimeMinutes(workingMinutes, shift),
          punchSource: source,
          status,
          remarks: row.deviceId ? `${source} import: ${row.deviceId}` : `${source} import`,
          isFinalized: source === 'BIOMETRIC' || source === 'API',
        },
        update: {
          shiftId: shift?.id,
          punchIn,
          punchOut,
          workingMinutes,
          overtimeMinutes: this.overtimeMinutes(workingMinutes, shift),
          punchSource: source,
          status,
          remarks: row.deviceId ? `${source} import: ${row.deviceId}` : `${source} import`,
          isFinalized: source === 'BIOMETRIC' || source === 'API',
        },
      });
      imported++;
    }

    return {
      imported,
      skipped: dto.rows.length - imported,
      unknownEmployeeCodes: [...unknownEmployeeCodes],
    };
  }

  private classifyAttendanceStatus(input: {
    workingMinutes?: number;
    shift?: { halfDayAfterMinutes: number; minWorkingMinutes: number } | null;
    tenantId?: string;
    locationId?: string | null;
    date?: Date;
  }): AttendanceStatus {
    if (input.workingMinutes == null) return 'MISSING_PUNCH';
    const halfDayAfter = input.shift?.halfDayAfterMinutes ?? 240;
    const minWorking = input.shift?.minWorkingMinutes ?? 480;
    if (input.workingMinutes < halfDayAfter) return 'ABSENT';
    if (input.workingMinutes < minWorking) return 'HALF_DAY';
    return 'PRESENT';
  }

  private overtimeMinutes(
    workingMinutes?: number,
    shift?: { overtimeAfterMinutes: number } | null,
  ): number | undefined {
    if (workingMinutes == null || !shift) return undefined;
    return Math.max(0, workingMinutes - shift.overtimeAfterMinutes);
  }

  async me(user: AuthUser, month?: string) {
    const employeeId = this.requireEmployee(user);
    const { start, end } = parseMonth(month);
    const records = await this.prisma.attendanceRecord.findMany({
      where: { employeeId, date: { gte: start, lt: end } },
      orderBy: { date: 'desc' },
    });
    const count = (s: string) => records.filter((r) => r.status === s).length;
    const worked = records.filter((r) => r.workingMinutes != null);
    return {
      records,
      summary: {
        present: count('PRESENT'),
        late: count('LATE'),
        absent: count('ABSENT'),
        onLeave: count('ON_LEAVE'),
        avgWorkHours: worked.length
          ? Math.round(
              (worked.reduce((s, r) => s + (r.workingMinutes ?? 0), 0) / worked.length / 60) * 10,
            ) / 10
          : 0,
      },
    };
  }

  async regularize(user: AuthUser, dto: RegularizeDto) {
    const employeeId = dto.employeeId ?? this.requireEmployee(user);
    const date = dateOnly(new Date(dto.date));
    const punchIn = dto.punchIn ? new Date(dto.punchIn) : undefined;
    const punchOut = dto.punchOut ? new Date(dto.punchOut) : undefined;
    const canApplyDirectly =
      user.isSuperAdmin || user.roles.some((role) => ['HR Admin', 'Manager'].includes(role));

    if (!canApplyDirectly) {
      const employee = await this.prisma.employee.findFirst({
        where: { id: employeeId, tenantId: user.tenantId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          managerId: true,
        },
      });
      if (!employee) throw new NotFoundException('Employee not found');
      const fallbackApprover = await this.prisma.employee.findFirst({
        where: {
          tenantId: user.tenantId,
          user: { userRoles: { some: { role: { name: { in: ['HR Admin', 'Super Admin'] } } } } },
        },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      const request = await this.prisma.approvalRequest.create({
        data: {
          tenantId: user.tenantId,
          requesterId: employeeId,
          approverId: employee.managerId ?? fallbackApprover?.id,
          module: 'attendance',
          objectType: 'AttendanceRegularization',
          objectId: `${employeeId}:${date.toISOString().slice(0, 10)}`,
          requestData: {
            title: 'Attendance regularization',
            employeeName: `${employee.firstName} ${employee.lastName}`,
            date: date.toISOString().slice(0, 10),
            punchIn: punchIn?.toISOString() ?? null,
            punchOut: punchOut?.toISOString() ?? null,
            reason: dto.reason,
          },
        },
      });
      return { approvalRequired: true, request };
    }

    const applied = await this.applyRegularization(user.tenantId, employeeId, {
      date,
      punchIn,
      punchOut,
      reason: dto.reason,
    });
    return { approvalRequired: false, record: applied };
  }

  async applyRegularization(
    tenantId: string,
    employeeId: string,
    input: { date: Date; punchIn?: Date; punchOut?: Date; reason: string },
  ) {
    const workingMinutes =
      input.punchIn && input.punchOut
        ? Math.max(0, Math.round((input.punchOut.getTime() - input.punchIn.getTime()) / 60000))
        : undefined;
    return this.prisma.attendanceRecord.upsert({
      where: { employeeId_date: { employeeId, date: input.date } },
      create: {
        tenantId,
        employeeId,
        date: input.date,
        status: 'PRESENT',
        punchIn: input.punchIn,
        punchOut: input.punchOut,
        workingMinutes,
        punchSource: 'MANUAL',
        remarks: `Regularization: ${input.reason}`,
      },
      update: {
        punchIn: input.punchIn,
        punchOut: input.punchOut,
        workingMinutes,
        status: 'PRESENT',
        punchSource: 'MANUAL',
        remarks: `Regularization: ${input.reason}`,
      },
    });
  }

  async stats(tenantId: string, month?: string) {
    const { start, end } = parseMonth(month);
    const records = await this.prisma.attendanceRecord.findMany({
      where: { tenantId, date: { gte: start, lt: end } },
      select: { date: true, status: true, workingMinutes: true },
    });
    const byDay = new Map<string, { present: number; late: number; absent: number }>();
    for (const r of records) {
      const key = r.date.toISOString().slice(0, 10);
      const day = byDay.get(key) ?? { present: 0, late: 0, absent: 0 };
      if (r.status === 'PRESENT') day.present++;
      else if (r.status === 'LATE') day.late++;
      else if (r.status === 'ABSENT') day.absent++;
      byDay.set(key, day);
    }
    const attended = records.filter((r) => ['PRESENT', 'LATE'].includes(r.status)).length;
    const total = records.length || 1;
    const worked = records.filter((r) => r.workingMinutes != null);
    return {
      attendanceRate: Math.round((attended / total) * 1000) / 10,
      avgWorkHours: worked.length
        ? Math.round(
            (worked.reduce((s, r) => s + (r.workingMinutes ?? 0), 0) / worked.length / 60) * 10,
          ) / 10
        : 0,
      lateArrivals: records.filter((r) => r.status === 'LATE').length,
      trend: [...byDay.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({ date, ...v })),
    };
  }

  async listRules(tenantId: string) {
    return this.prisma.attendanceRule.findMany({
      where: { tenantId },
      include: {
        shift: { select: { id: true, name: true, type: true } },
        location: { select: { id: true, name: true, city: true } },
      },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async createRule(tenantId: string, dto: UpsertAttendanceRuleDto) {
    return this.prisma.attendanceRule.create({
      data: {
        ...dto,
        tenantId,
        effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : undefined,
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : undefined,
      },
    });
  }

  async updateRule(tenantId: string, id: string, dto: UpsertAttendanceRuleDto) {
    const rule = await this.prisma.attendanceRule.findFirst({ where: { id, tenantId } });
    if (!rule) throw new NotFoundException('Attendance rule not found');
    return this.prisma.attendanceRule.update({
      where: { id },
      data: {
        ...dto,
        effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : undefined,
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
      },
    });
  }

  async listShifts(tenantId: string) {
    return this.prisma.shift.findMany({
      where: { tenantId },
      include: { _count: { select: { shiftAssignments: true } } },
    });
  }

  async createShift(tenantId: string, dto: CreateShiftDto) {
    return this.prisma.shift.create({ data: { ...dto, tenantId } });
  }

  async assignShift(tenantId: string, dto: AssignShiftDto) {
    const shift = await this.prisma.shift.findFirst({ where: { id: dto.shiftId, tenantId } });
    if (!shift) throw new NotFoundException('Shift not found');
    const effectiveFrom = dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date();
    await this.prisma.shiftAssignment.createMany({
      data: dto.employeeIds.map((employeeId) => ({
        employeeId,
        shiftId: dto.shiftId,
        effectiveFrom,
      })),
    });
    return { assigned: dto.employeeIds.length };
  }

  async importRoster(tenantId: string, uploadedById: string | undefined, dto: ImportRosterDto) {
    if (!dto.rows.length) throw new BadRequestException('Roster import requires at least one row');
    const dates = dto.rows.map((row) => dateOnly(new Date(row.date)));
    const periodStart = new Date(Math.min(...dates.map((date) => date.getTime())));
    const periodEnd = new Date(Math.max(...dates.map((date) => date.getTime())));
    const employees = await this.prisma.employee.findMany({
      where: { tenantId, employeeCode: { in: [...new Set(dto.rows.map((row) => row.employeeCode))] } },
      select: { id: true, employeeCode: true },
    });
    const employeeByCode = new Map(employees.map((employee) => [employee.employeeCode, employee]));
    const shifts = await this.prisma.shift.findMany({ where: { tenantId, isActive: true } });
    const shiftById = new Map(shifts.map((shift) => [shift.id, shift]));
    const shiftByName = new Map(shifts.map((shift) => [shift.name.toLowerCase(), shift]));

    const roster = await this.prisma.rosterUpload.create({
      data: { tenantId, name: dto.name, periodStart, periodEnd, uploadedById },
    });
    let imported = 0;
    let failed = 0;
    const errors: Array<{ employeeCode: string; date: string; error: string }> = [];

    for (const row of dto.rows) {
      const employee = employeeByCode.get(row.employeeCode);
      const shift = row.shiftId
        ? shiftById.get(row.shiftId)
        : row.shiftName
          ? shiftByName.get(row.shiftName.toLowerCase())
          : undefined;
      const rowDate = dateOnly(new Date(row.date));
      const error = !employee ? 'Employee code not found' : !shift ? 'Shift not found' : undefined;
      await this.prisma.rosterUploadRow.create({
        data: {
          rosterUploadId: roster.id,
          employeeId: employee?.id,
          employeeCode: row.employeeCode,
          shiftId: shift?.id,
          shiftName: row.shiftName ?? shift?.name,
          date: rowDate,
          status: error ? 'FAILED' : 'IMPORTED',
          error,
        },
      });
      if (error || !employee || !shift) {
        failed++;
        errors.push({ employeeCode: row.employeeCode, date: row.date, error: error ?? 'Unknown roster error' });
        continue;
      }
      const nextDay = new Date(rowDate);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      await this.prisma.shiftAssignment.create({
        data: {
          employeeId: employee.id,
          shiftId: shift.id,
          effectiveFrom: rowDate,
          effectiveTo: nextDay,
          source: 'ROSTER_UPLOAD',
          rosterUploadId: roster.id,
        },
      });
      imported++;
    }
    return this.prisma.rosterUpload.update({
      where: { id: roster.id },
      data: {
        status: failed > 0 ? 'FAILED' : 'IMPORTED',
        importedCount: imported,
        failedCount: failed,
        errors,
      },
      include: { rows: { take: 25, orderBy: { createdAt: 'desc' } } },
    });
  }

  async listRosters(tenantId: string) {
    return this.prisma.rosterUpload.findMany({
      where: { tenantId },
      include: { rows: { take: 10, orderBy: { date: 'asc' } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  async finalizationPreview(tenantId: string, dto: FinalizeAttendanceDto) {
    const { start, endExclusive, year, monthNumber } = monthParts(dto.month);
    const whereEmployee: Prisma.EmployeeWhereInput = {
      tenantId,
      status: { notIn: ['EXITED', 'INACTIVE', 'CANDIDATE', 'PREBOARDING'] },
      ...(dto.locationId && { locationId: dto.locationId }),
    };
    const [employees, records, pendingLeave] = await Promise.all([
      this.prisma.employee.count({ where: whereEmployee }),
      this.prisma.attendanceRecord.findMany({
        where: {
          tenantId,
          date: { gte: start, lt: endExclusive },
          ...(dto.locationId && { employee: { locationId: dto.locationId } }),
        },
        select: { status: true, isFinalized: true, overtimeMinutes: true },
      }),
      this.prisma.leaveRequest.count({
        where: {
          tenantId,
          status: 'PENDING',
          fromDate: { lt: endExclusive },
          toDate: { gte: start },
          ...(dto.locationId && { employee: { locationId: dto.locationId } }),
        },
      }),
    ]);
    const count = (status: AttendanceStatus) => records.filter((record) => record.status === status).length;
    const overtimeMinutes = records.reduce((sum, record) => sum + (record.overtimeMinutes ?? 0), 0);
    return {
      month: dto.month,
      year,
      monthNumber,
      employees,
      records: records.length,
      unfinalizedRecords: records.filter((record) => !record.isFinalized).length,
      missingRecordsEstimate: Math.max(0, employees * 22 - records.length),
      pendingLeave,
      exceptions: {
        absent: count('ABSENT'),
        halfDay: count('HALF_DAY'),
        missingPunch: count('MISSING_PUNCH'),
        late: count('LATE'),
      },
      overtimeHours: Math.round((overtimeMinutes / 60) * 10) / 10,
    };
  }

  async finalizeMonth(tenantId: string, finalizedById: string | undefined, dto: FinalizeAttendanceDto) {
    const { start, endExclusive, endInclusive, year, monthNumber } = monthParts(dto.month);
    const preview = await this.finalizationPreview(tenantId, dto);
    const finalization = await this.prisma.attendanceFinalization.create({
      data: {
        tenantId,
        month: monthNumber,
        year,
        locationId: dto.locationId,
        finalizedById,
        notes: dto.notes,
        summary: preview as unknown as Prisma.InputJsonValue,
      },
    });

    const employees = await this.prisma.employee.findMany({
      where: {
        tenantId,
        status: { notIn: ['EXITED', 'INACTIVE', 'CANDIDATE', 'PREBOARDING'] },
        ...(dto.locationId && { locationId: dto.locationId }),
      },
      select: { id: true, employeeCode: true, locationId: true },
    });
    const existing = await this.prisma.attendanceRecord.findMany({
      where: {
        tenantId,
        date: { gte: start, lt: endExclusive },
        employeeId: { in: employees.map((employee) => employee.id) },
      },
      select: { employeeId: true, date: true },
    });
    const existingKeys = new Set(existing.map((record) => `${record.employeeId}:${record.date.toISOString().slice(0, 10)}`));
    const holidays = await this.prisma.holiday.findMany({
      where: { holidayCalendar: { tenantId }, date: { gte: start, lte: endInclusive } },
      select: { date: true },
    });
    const holidaySet = new Set(holidays.map((holiday) => holiday.date.toISOString().slice(0, 10)));
    const approvedLeaves = await this.prisma.leaveRequest.findMany({
      where: {
        tenantId,
        employeeId: { in: employees.map((employee) => employee.id) },
        status: 'APPROVED',
        fromDate: { lt: endExclusive },
        toDate: { gte: start },
      },
      select: { employeeId: true, fromDate: true, toDate: true },
    });
    const leaveDaySet = new Set<string>();
    for (const leave of approvedLeaves) {
      const leaveStart = leave.fromDate < start ? start : leave.fromDate;
      const leaveEnd = leave.toDate > endInclusive ? endInclusive : leave.toDate;
      for (let d = new Date(leaveStart); d <= leaveEnd; d.setUTCDate(d.getUTCDate() + 1)) {
        leaveDaySet.add(`${leave.employeeId}:${d.toISOString().slice(0, 10)}`);
      }
    }

    for (let d = new Date(start); d < endExclusive; d.setUTCDate(d.getUTCDate() + 1)) {
      const dow = d.getUTCDay();
      for (const employee of employees) {
        const key = `${employee.id}:${d.toISOString().slice(0, 10)}`;
        if (existingKeys.has(key)) continue;
        const shift = await this.currentShiftAt(tenantId, employee.id, d);
        const isWeeklyOff = shift?.weeklyOffDays.includes(dow) ?? (dow === 0 || dow === 6);
        const status: AttendanceStatus = leaveDaySet.has(key)
          ? 'ON_LEAVE'
          : holidaySet.has(d.toISOString().slice(0, 10))
          ? 'HOLIDAY'
          : isWeeklyOff
            ? 'WEEKEND'
            : 'ABSENT';
        await this.prisma.attendanceRecord.create({
          data: {
            tenantId,
            employeeId: employee.id,
            shiftId: shift?.id,
            finalizationId: finalization.id,
            date: new Date(d),
            status,
            punchSource: 'SYSTEM',
            remarks: `Created during ${dto.month} attendance finalization`,
            isFinalized: true,
          },
        });
      }
    }

    const records = await this.prisma.attendanceRecord.findMany({
      where: {
        tenantId,
        date: { gte: start, lt: endExclusive },
        employeeId: { in: employees.map((employee) => employee.id) },
      },
      include: { shift: true },
    });
    await this.prisma.attendanceRecord.updateMany({
      where: { id: { in: records.map((record) => record.id) } },
      data: { isFinalized: true, finalizationId: finalization.id },
    });

    await this.prisma.payrollVariableInput.deleteMany({
      where: {
        tenantId,
        month: monthNumber,
        year,
        source: 'ATTENDANCE',
        type: { in: ['OVERTIME', 'SHIFT_ALLOWANCE'] },
      },
    });
    const byEmployee = new Map<string, { overtimeMinutes: number; allowance: number }>();
    for (const record of records) {
      const current = byEmployee.get(record.employeeId) ?? { overtimeMinutes: 0, allowance: 0 };
      current.overtimeMinutes += record.overtimeMinutes ?? this.overtimeMinutes(record.workingMinutes ?? undefined, record.shift) ?? 0;
      if (record.shift?.shiftAllowanceAmount && ['PRESENT', 'LATE', 'HALF_DAY'].includes(record.status)) {
        current.allowance += record.shift.shiftAllowanceAmount;
      }
      if (
        record.shift?.compOffEligible &&
        ['WEEKEND', 'HOLIDAY'].includes(record.status) &&
        (record.workingMinutes ?? 0) >= Math.min(record.shift.halfDayAfterMinutes, record.shift.minWorkingMinutes)
      ) {
        await this.prisma.compOffGrant.upsert({
          where: { id: `${record.id}` },
          create: {
            tenantId,
            employeeId: record.employeeId,
            sourceAttendanceRecordId: record.id,
            earnedDate: record.date,
            days: 1,
            expiresAt: new Date(record.date.getTime() + 90 * 24 * 60 * 60 * 1000),
            notes: 'Generated from finalized weekend/holiday work',
          },
          update: {},
        }).catch(async () => {
          const existingGrant = await this.prisma.compOffGrant.findFirst({ where: { sourceAttendanceRecordId: record.id } });
          return existingGrant;
        });
      }
      byEmployee.set(record.employeeId, current);
    }
    for (const [employeeId, totals] of byEmployee.entries()) {
      if (totals.overtimeMinutes > 0) {
        await this.prisma.payrollVariableInput.create({
          data: {
            tenantId,
            employeeId,
            month: monthNumber,
            year,
            type: 'OVERTIME',
            label: `Attendance overtime (${Math.round((totals.overtimeMinutes / 60) * 10) / 10}h)`,
            amount: Math.round((totals.overtimeMinutes / 60) * 250 * 100) / 100,
            taxable: true,
            status: 'APPROVED',
            source: 'ATTENDANCE',
            metadata: { finalizationId: finalization.id, overtimeMinutes: totals.overtimeMinutes },
          },
        });
      }
      if (totals.allowance > 0) {
        await this.prisma.payrollVariableInput.create({
          data: {
            tenantId,
            employeeId,
            month: monthNumber,
            year,
            type: 'SHIFT_ALLOWANCE',
            label: 'Shift allowance from finalized roster',
            amount: Math.round(totals.allowance * 100) / 100,
            taxable: true,
            status: 'APPROVED',
            source: 'ATTENDANCE',
            metadata: { finalizationId: finalization.id },
          },
        });
      }
    }
    return this.finalizationPreview(tenantId, dto);
  }

  async listCompOffs(user: AuthUser) {
    const where: Prisma.CompOffGrantWhereInput = {
      tenantId: user.tenantId,
      ...(!user.roles.some((role) => ['Super Admin', 'HR Admin', 'Manager'].includes(role)) && {
        employeeId: this.requireEmployee(user),
      }),
    };
    return this.prisma.compOffGrant.findMany({
      where,
      include: { employee: { select: { firstName: true, lastName: true, employeeCode: true } } },
      orderBy: { earnedDate: 'desc' },
      take: 100,
    });
  }

  async listShiftSwaps(user: AuthUser) {
    const employeeId = user.employeeId;
    const elevated = user.roles.some((role) => ['Super Admin', 'HR Admin', 'Manager'].includes(role));
    return this.prisma.shiftSwapRequest.findMany({
      where: {
        tenantId: user.tenantId,
        ...(!elevated && employeeId && { requesterEmployeeId: employeeId }),
      },
      include: {
        requester: { select: { firstName: true, lastName: true, employeeCode: true } },
        counterpart: { select: { firstName: true, lastName: true, employeeCode: true } },
        requestedShift: { select: { name: true, type: true } },
        targetShift: { select: { name: true, type: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async createShiftSwap(user: AuthUser, dto: CreateShiftSwapDto) {
    const employeeId = this.requireEmployee(user);
    const [requestedShift, targetShift] = await Promise.all([
      this.prisma.shift.findFirst({ where: { id: dto.requestedShiftId, tenantId: user.tenantId } }),
      this.prisma.shift.findFirst({ where: { id: dto.targetShiftId, tenantId: user.tenantId } }),
    ]);
    if (!requestedShift || !targetShift) throw new NotFoundException('Shift not found');
    return this.prisma.shiftSwapRequest.create({
      data: {
        tenantId: user.tenantId,
        requesterEmployeeId: employeeId,
        counterpartEmployeeId: dto.counterpartEmployeeId,
        requestedShiftId: dto.requestedShiftId,
        targetShiftId: dto.targetShiftId,
        requestedDate: dateOnly(new Date(dto.requestedDate)),
        targetDate: dateOnly(new Date(dto.targetDate)),
        reason: dto.reason,
      },
    });
  }

  async decideShiftSwap(
    tenantId: string,
    approverId: string | undefined,
    id: string,
    dto: DecideShiftSwapDto,
  ) {
    const request = await this.prisma.shiftSwapRequest.findFirst({ where: { id, tenantId } });
    if (!request) throw new NotFoundException('Shift swap request not found');
    if (request.status !== 'REQUESTED') throw new BadRequestException('Shift swap already decided');
    const updated = await this.prisma.shiftSwapRequest.update({
      where: { id },
      data: {
        status: dto.status,
        approverId,
        decidedAt: new Date(),
        decisionNote: dto.note,
      },
    });
    if (dto.status === ShiftSwapStatus.APPROVED) {
      const nextDay = new Date(request.targetDate);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      await this.prisma.shiftAssignment.create({
        data: {
          employeeId: request.requesterEmployeeId,
          shiftId: request.targetShiftId,
          effectiveFrom: request.targetDate,
          effectiveTo: nextDay,
          source: 'SHIFT_SWAP',
        },
      });
      if (request.counterpartEmployeeId) {
        const requesterNextDay = new Date(request.requestedDate);
        requesterNextDay.setUTCDate(requesterNextDay.getUTCDate() + 1);
        await this.prisma.shiftAssignment.create({
          data: {
            employeeId: request.counterpartEmployeeId,
            shiftId: request.requestedShiftId,
            effectiveFrom: request.requestedDate,
            effectiveTo: requesterNextDay,
            source: 'SHIFT_SWAP',
          },
        });
      }
    }
    return updated;
  }

  async holidays(tenantId: string, year?: number) {
    const y = year ?? new Date().getFullYear();
    return this.prisma.holiday.findMany({
      where: {
        holidayCalendar: { tenantId, year: y },
      },
      orderBy: { date: 'asc' },
    });
  }

  async createHoliday(tenantId: string, dto: UpsertHolidayDto, calendarId?: string) {
    const year = new Date(dto.date).getUTCFullYear();
    const calendar = calendarId
      ? await this.prisma.holidayCalendar.findFirst({ where: { id: calendarId, tenantId } })
      : await this.prisma.holidayCalendar.upsert({
          where: { id: `default-${tenantId}-${year}` },
          create: { id: `default-${tenantId}-${year}`, tenantId, year, name: `India ${year} Holidays`, isDefault: true },
          update: {},
        }).catch(() => this.prisma.holidayCalendar.findFirst({ where: { tenantId, year, isDefault: true } }));
    if (!calendar) throw new NotFoundException('Holiday calendar not found');
    return this.prisma.holiday.create({
      data: {
        holidayCalendarId: calendar.id,
        name: dto.name,
        date: dateOnly(new Date(dto.date)),
        isOptional: dto.isOptional ?? false,
      },
    });
  }
}
