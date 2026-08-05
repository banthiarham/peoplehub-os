import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AttendanceCaptureMode,
  AttendanceStatus,
  CompOffStatus,
  Prisma,
  PunchDirection,
  ShiftSwapStatus,
} from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { AuthUser } from '../../common/types/auth-user';
import {
  parseAttendanceDate,
  parseAttendanceDateOrError,
  SUPPORTED_ATTENDANCE_DATE_FORMATS,
} from '../../common/utils/attendance-date';
import { toCsv } from '../../common/utils/csv';
import { ASSIGNMENT_PRECEDENCE, ShiftResolutionService } from './shift-resolution.service';
import { workedDayStatus } from './attendance-status';
import {
  nextPunchDirection,
  summarisePunchEvents,
  syncSystemPunchEvents,
  type PunchEventLike,
} from './punch-events';
import { earlyDeparture, isLateArrival, overtimeAfterShiftEnd } from './shift-timing';
import {
  AssignShiftDto,
  CheckInDto,
  CheckOutDto,
  CreateCompOffDto,
  CreateShiftSwapDto,
  CreateShiftDto,
  DecideCompOffDto,
  DecideShiftSwapDto,
  FinalizeAttendanceDto,
  ImportAttendanceRowsDto,
  ImportBiometricPunchesDto,
  ImportRosterDto,
  ListAttendanceDto,
  ListPunchEventsDto,
  ListShiftAssignmentsDto,
  QrPunchDto,
  RegularizeDto,
  UpdateAttendanceRecordDto,
  UpdateShiftAssignmentDto,
  UpdateShiftWeeklyOffsDto,
  UpsertCaptureSettingDto,
  UpsertAttendanceRuleDto,
  UpsertHolidayDto,
} from './dto/attendance.dto';

/**
 * Absence statuses that approved leave supersedes during month finalization.
 * HALF_DAY is included because it is a partial absence: leaving it in place
 * charges its 0.5 day of attendance LOP on top of whatever the leave itself
 * costs, so a half worked day plus half-day unpaid leave would be billed as a
 * full LOP day, and paid leave would not fully cover the unworked half.
 */
const LEAVE_RECONCILABLE_STATUSES: AttendanceStatus[] = [
  AttendanceStatus.ABSENT,
  AttendanceStatus.MISSING_PUNCH,
  AttendanceStatus.HALF_DAY,
];

/** How long a comp-off stays available before it lapses, in days. */
const COMP_OFF_VALIDITY_DAYS = 90;

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

/** One day earlier, in the UTC-anchored day space attendance dates use. */
function previousDay(d: Date): Date {
  return new Date(d.getTime() - 24 * 60 * 60 * 1000);
}

/**
 * Parses a client-supplied attendance day, rejecting formats that cannot be
 * mapped to a calendar day without guessing. Used where a single bad value
 * should fail the whole request; row-oriented imports use
 * `parseAttendanceDateOrError` so the caller gets per-row feedback instead.
 */
function requireAttendanceDate(value: string, field = 'date'): Date {
  const parsed = parseAttendanceDate(value);
  if (!parsed) {
    throw new BadRequestException(
      `Invalid ${field} — use ${SUPPORTED_ATTENDANCE_DATE_FORMATS}`,
    );
  }
  return parsed;
}

/** Truncates an already UTC-anchored value (@db.Date columns, joining/exit dates) to its UTC day. */
function utcDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
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
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shifts: ShiftResolutionService,
  ) {}

  private requireEmployee(user: AuthUser): string {
    if (!user.employeeId) {
      throw new ForbiddenException('No employee profile linked to this user');
    }
    return user.employeeId;
  }

  private async currentShiftAt(tenantId: string, employeeId: string, at: Date) {
    return this.shifts.shiftAt(tenantId, employeeId, at);
  }

  private async weeklyOffAt(tenantId: string, employeeId: string, at: Date) {
    const shift = await this.currentShiftAt(tenantId, employeeId, at);
    const dayOfWeek = at.getUTCDay();
    return {
      shift,
      isWeeklyOff: shift?.weeklyOffDays.includes(dayOfWeek) ?? (dayOfWeek === 0 || dayOfWeek === 6),
    };
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
    return this.shifts.employeeLocationId(tenantId, employeeId);
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
      await this.validateGeofence(tenantId, employeeId, dto, locationId ?? null);
    }
  }

  /**
   * A finalized day has already been costed into payroll, so a punch may not
   * rewrite it — the same guard `updateRecord` and `deleteRecord` already
   * apply to the record itself.
   */
  private async assertDayNotFinalized(employeeId: string, date: Date) {
    const record = await this.prisma.attendanceRecord.findUnique({
      where: { employeeId_date: { employeeId, date } },
      select: { isFinalized: true },
    });
    if (record?.isFinalized) {
      throw new BadRequestException(
        'Attendance for this day is finalized and can no longer be punched',
      );
    }
  }

  /**
   * Which location one individual punch happened at.
   *
   * This governs the geofence and capture mode for that punch alone. The day
   * still has exactly one *effective* location — the one the attendance rule,
   * status and overtime are resolved against — so working at a second location
   * cannot change how the day is measured.
   *
   * Precedence:
   * 1. An explicit `locationId`, rejected when it is not authorized. A QR scan
   *    is this case: the code names where the punch happened.
   * 2. The authorized location whose geofence the GPS fix falls inside.
   * 3. `fallback` — for a check-out, the location of the check-in it closes, so
   *    a punch-out with no payload lands where the employee actually is.
   * 4. The effective location.
   *
   * An employee with no extra authorized locations resolves to the effective
   * location without a single additional decision, which is precisely the
   * behaviour that existed before multi-location punching.
   */
  private async resolvePunchLocation(
    tenantId: string,
    employeeId: string,
    effectiveLocationId: string | null,
    dto: CheckInDto,
    fallbackLocationId?: string | null,
  ): Promise<string | null> {
    const fallback = fallbackLocationId ?? effectiveLocationId;
    const authorized = await this.shifts.authorizedLocationIds(
      tenantId,
      employeeId,
      effectiveLocationId,
    );

    if (dto.locationId) {
      if (!authorized.includes(dto.locationId)) {
        throw new ForbiddenException('You are not authorized to punch at this location');
      }
      return dto.locationId;
    }
    if (authorized.length <= 1 || dto.geoLat == null || dto.geoLng == null) {
      return fallback;
    }
    const matched = await this.nearestAuthorizedLocation(
      tenantId,
      authorized,
      dto.geoLat,
      dto.geoLng,
    );
    return matched ?? fallback;
  }

  /**
   * Where the employee is currently checked in, or null when they are not.
   *
   * A check-out with no location in its payload belongs here, not at the
   * employee's scheduled location: someone who checked in at a second site and
   * punches out from the portal — which sends only the device id — would
   * otherwise have the punch-out recorded at an office they were never in, and
   * the day's last location would be wrong in every report.
   */
  private openPunchLocationId(events: Array<{ direction: PunchDirection; locationId: string | null }>) {
    const last = events[events.length - 1];
    return last?.direction === PunchDirection.IN ? last.locationId : null;
  }

  /**
   * The nearest authorized location whose geofence the fix actually falls
   * inside. `null` when it falls inside none of them, which leaves the punch on
   * the effective location so `validateGeofence` rejects it with the message
   * naming where the employee was expected — rather than silently snapping the
   * punch to whichever office happens to be closest.
   */
  private async nearestAuthorizedLocation(
    tenantId: string,
    locationIds: string[],
    lat: number,
    lng: number,
  ): Promise<string | null> {
    const locations = await this.prisma.location.findMany({
      where: { id: { in: locationIds }, tenantId, isActive: true },
      select: { id: true, geoLat: true, geoLng: true, attendanceRadius: true },
    });
    let best: string | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const location of locations) {
      if (location.geoLat == null || location.geoLng == null || !location.attendanceRadius) continue;
      const distance = haversineMeters(lat, lng, location.geoLat, location.geoLng);
      if (distance <= location.attendanceRadius && distance < bestDistance) {
        best = location.id;
        bestDistance = distance;
      }
    }
    return best;
  }

  /**
   * Appends one punch and rebuilds the day's record from every punch on it.
   *
   * Both happen in one transaction, and the direction is re-checked inside it,
   * so two punches racing each other cannot leave the day with two consecutive
   * check-ins or a record that disagrees with its own events.
   */
  private async recordPunch(input: {
    tenantId: string;
    employeeId: string;
    date: Date;
    direction: PunchDirection;
    eventAt: Date;
    locationId: string | null;
    shift: { id: string; startTime: string; endTime: string } | null;
    effectiveLocationId: string | null;
    source: string;
    dto: CheckInDto;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.attendancePunchEvent.findMany({
        where: { employeeId: input.employeeId, attendanceDate: input.date },
        orderBy: { eventAt: 'asc' },
      });
      this.assertPunchDirection(existing, input.direction);
      await tx.attendancePunchEvent.create({
        data: {
          tenantId: input.tenantId,
          employeeId: input.employeeId,
          attendanceDate: input.date,
          eventAt: input.eventAt,
          direction: input.direction,
          locationId: input.locationId,
          shiftId: input.shift?.id,
          source: input.source,
          geoLat: input.dto.geoLat,
          geoLng: input.dto.geoLng,
          geoAccuracy: input.dto.geoAccuracy,
          deviceId: input.dto.deviceId,
        },
      });
      return this.rebuildDayRecord(tx, {
        tenantId: input.tenantId,
        employeeId: input.employeeId,
        date: input.date,
        shift: input.shift,
        effectiveLocationId: input.effectiveLocationId,
        // Live punches resolve their attendance rule against the current
        // instant, the way the punch path always has. Passing the day anchor
        // instead would pull in a rule on its own final day and change the
        // grace period a punch is judged by.
        ruleAt: new Date(),
      });
    });
  }

  /** Rejects a punch that repeats the direction of the day's last punch. */
  private assertPunchDirection(events: PunchEventLike[], direction: PunchDirection) {
    if (nextPunchDirection(events) === direction) return;
    throw new BadRequestException(
      direction === PunchDirection.IN
        ? 'You are already checked in — check out before checking in again'
        : 'Check in first',
    );
  }

  /**
   * Rebuilds `AttendanceRecord` from the day's punch events.
   *
   * For a day with one check-in and one check-out this produces byte-identical
   * values to the two-punch path it replaces: `punchIn`/`punchOut` are the
   * first and last punch, `workingMinutes` is still the gross span between
   * them, and status is still "guess lateness on the way in, classify by length
   * on the way out". Extra punches only ever move `punchOut` later and add
   * `netMinutes`; no existing reader sees a changed field.
   */
  private async rebuildDayRecord(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      employeeId: string;
      date: Date;
      shift: { id: string; startTime: string; endTime: string } | null;
      effectiveLocationId: string | null;
      ruleAt: Date;
    },
  ) {
    const events = await tx.attendancePunchEvent.findMany({
      where: { employeeId: input.employeeId, attendanceDate: input.date },
      orderBy: { eventAt: 'asc' },
    });
    const summary = summarisePunchEvents(events);
    const rule = await this.attendanceRule(input.tenantId, {
      shiftId: input.shift?.id,
      locationId: input.effectiveLocationId,
      date: input.ruleAt,
    });
    const arrivedLate = summary.firstIn
      ? isLateArrival(summary.firstIn, input.shift, rule)
      : false;
    // Until a check-out exists the only thing knowable is lateness — the same
    // provisional verdict the old check-in wrote. Once the day closes it is
    // classified by its length and then qualified by lateness, exactly as the
    // old check-out did.
    const status = summary.lastOut
      ? this.withLateArrival(
          this.classifyAttendanceStatus({
            workingMinutes: summary.grossMinutes,
            shift: input.shift,
            tenantId: input.tenantId,
            locationId: input.effectiveLocationId,
            date: input.date,
          }),
          arrivedLate,
        )
      : arrivedLate
        ? AttendanceStatus.LATE
        : AttendanceStatus.PRESENT;

    const derived = {
      // `undefined` when no shift resolves, so an existing shiftId is kept
      // rather than cleared — the behaviour the old punch-out relied on.
      shiftId: input.shift?.id,
      punchIn: summary.firstIn,
      punchOut: summary.lastOut,
      workingMinutes: summary.grossMinutes ?? null,
      netMinutes: summary.netMinutes ?? null,
      overtimeMinutes:
        this.overtimeMinutes(summary.firstIn, summary.lastOut, input.shift) ?? null,
      punchSource: summary.firstInSource,
      geoLat: summary.geoLat,
      geoLng: summary.geoLng,
      geoAccuracy: summary.geoAccuracy,
      status,
    };
    return tx.attendanceRecord.upsert({
      where: { employeeId_date: { employeeId: input.employeeId, date: input.date } },
      create: {
        tenantId: input.tenantId,
        employeeId: input.employeeId,
        date: input.date,
        ...derived,
      },
      update: derived,
    });
  }

  async checkIn(user: AuthUser, dto: CheckInDto, forcedSource?: string) {
    const employeeId = this.requireEmployee(user);
    const today = dateOnly(new Date());
    // The location and shift the *day* is evaluated against come from the one
    // resolver: the assignment covering today when it pins a location
    // (multi-location shift support), otherwise the employee's base location.
    // Resolved against `today`, the day anchor, not the current instant — an
    // assignment ending today stores `effectiveTo` at that day's midnight, so a
    // timestamp compares past it and silently drops the override mid-morning.
    const { shift, assignedLocationId } = await this.shifts.resolveAt(
      user.tenantId,
      employeeId,
      today,
    );
    const effectiveLocationId =
      assignedLocationId ?? (await this.employeeLocationId(user.tenantId, employeeId));
    // Where this punch is: the scheduled location for a single-location
    // employee, or whichever authorized location they are actually standing in.
    const punchLocationId = await this.resolvePunchLocation(
      user.tenantId,
      employeeId,
      effectiveLocationId,
      dto,
    );
    const captureMode =
      forcedSource === 'QR' ? AttendanceCaptureMode.QR : this.deriveInteractiveCaptureMode(dto);

    await this.assertCaptureModeAllowed(user.tenantId, captureMode, punchLocationId, dto, employeeId);
    await this.validateDevice(user.tenantId, employeeId, dto);
    await this.validateGeofence(user.tenantId, employeeId, dto, punchLocationId);
    await this.assertDayNotFinalized(employeeId, today);

    return this.recordPunch({
      tenantId: user.tenantId,
      employeeId,
      date: today,
      direction: PunchDirection.IN,
      eventAt: new Date(),
      locationId: punchLocationId,
      shift,
      effectiveLocationId,
      source: forcedSource ?? captureMode,
      dto,
    });
  }

  async qrCheckIn(user: AuthUser, dto: QrPunchDto) {
    const [, qrLocationId] = dto.qrCode.split(':');
    if (!qrLocationId || !dto.qrCode.startsWith('PHUB:')) {
      throw new BadRequestException('Invalid attendance QR code');
    }
    const employeeId = this.requireEmployee(user);
    // The QR code must name a location the employee may actually punch at:
    // wherever they are scheduled today, their base location, or any extra
    // authorized location. An employee with no extra locations still has to
    // match their single scheduled location, exactly as before.
    const today = dateOnly(new Date());
    const effectiveLocationId = await this.shifts.effectiveLocationId(
      user.tenantId,
      employeeId,
      today,
    );
    const authorized = await this.shifts.authorizedLocationIds(
      user.tenantId,
      employeeId,
      effectiveLocationId,
    );
    if (!authorized.includes(qrLocationId)) {
      throw new ForbiddenException('This QR code does not match a location you are assigned to');
    }
    // Scanning the code is the location claim, so the punch is pinned to it
    // rather than re-resolved from GPS.
    return this.checkIn(user, { ...dto, locationId: qrLocationId }, 'QR');
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
    locationId: string | null,
  ): Promise<void> {
    if (!locationId) return;
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
      select: { workMode: true },
    });
    const loc = await this.prisma.location.findFirst({ where: { id: locationId, tenantId } });
    if (employee?.workMode !== 'OFFICE' || !loc?.geoLat || !loc?.geoLng || !loc?.attendanceRadius) {
      return;
    }
    if (dto.geoLat == null || dto.geoLng == null) {
      // The browser never reports *why* a fix is missing to anywhere but the
      // client — without this, an incident like "check-in blocked" is
      // undiagnosable after the fact. geoErrorReason carries that context so
      // it's at least visible in the logs, even though the client-facing
      // message stays the same.
      this.logger.warn(
        `Check-in blocked at ${loc.name} for employee ${employeeId}: no GPS fix (browser reason: ${dto.geoErrorReason ?? 'not reported'})`,
      );
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

  /**
   * Punches out of the location the employee is currently checked in at.
   *
   * Check-out deliberately keeps the validation it has always had — the device
   * binding only. It records where the punch happened, but adding a capture
   * mode assertion or a geofence here would start rejecting punch-outs that
   * succeed today, stranding employees on the clock.
   */
  async checkOut(user: AuthUser, dto: CheckOutDto) {
    const employeeId = this.requireEmployee(user);
    await this.validateDevice(user.tenantId, employeeId, dto);
    const today = dateOnly(new Date());

    // Check-in can only ever guess at PRESENT/LATE, because how long the day
    // turns out to be is not known until the punch-out. The rebuild reclassifies
    // against the finished span, or a ten minute day stays PRESENT purely
    // because that is what the punch-in wrote.
    const { shift, assignedLocationId } = await this.shifts.resolveAt(
      user.tenantId,
      employeeId,
      today,
    );
    const effectiveLocationId =
      assignedLocationId ?? (await this.employeeLocationId(user.tenantId, employeeId));
    // A punch-out closes a specific check-in, so when the payload names no
    // location it belongs where that check-in was — not at whichever location
    // the employee happens to be scheduled at.
    const openEvents = await this.prisma.attendancePunchEvent.findMany({
      where: { employeeId, attendanceDate: today },
      orderBy: { eventAt: 'asc' },
      select: { direction: true, locationId: true },
    });
    const punchLocationId = await this.resolvePunchLocation(
      user.tenantId,
      employeeId,
      effectiveLocationId,
      dto,
      this.openPunchLocationId(openEvents),
    );
    await this.assertDayNotFinalized(employeeId, today);

    return this.recordPunch({
      tenantId: user.tenantId,
      employeeId,
      date: today,
      direction: PunchDirection.OUT,
      eventAt: new Date(),
      locationId: punchLocationId,
      shift,
      effectiveLocationId,
      source: this.deriveInteractiveCaptureMode(dto),
      dto,
    });
  }

  async today(tenantId: string) {
    return this.forDate(tenantId, dateOnly(new Date()));
  }

  async forDate(tenantId: string, requestedDate: Date) {
    const date = dateOnly(requestedDate);
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
      this.prisma.attendanceRecord.findMany({ where: { tenantId, date } }),
      this.prisma.leaveRequest.findMany({
        where: { tenantId, status: 'APPROVED', fromDate: { lte: date }, toDate: { gte: date } },
        select: { employeeId: true },
      }),
    ]);
    const recordMap = new Map(records.map((r) => [r.employeeId, r]));
    const leaveSet = new Set(onLeave.map((l) => l.employeeId));

    const rows = await Promise.all(
      employees.map(async (e) => {
        const rec = recordMap.get(e.id);
        let status: AttendanceStatus;
        if (rec) status = rec.status;
        else if (leaveSet.has(e.id)) status = 'ON_LEAVE';
        else {
          const { isWeeklyOff } = await this.weeklyOffAt(tenantId, e.id, date);
          status = isWeeklyOff ? 'WEEKEND' : 'ABSENT';
        }
        return {
          employee: e,
          status,
          punchIn: rec?.punchIn ?? null,
          punchOut: rec?.punchOut ?? null,
          workingMinutes: rec?.workingMinutes ?? null,
          punchSource: rec?.punchSource ?? null,
          id: rec?.id ?? null,
          date: rec?.date ?? date,
        };
      }),
    );
    return {
      date,
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

  /**
   * Punch history, one row per employee-day. The only read path backed by
   * `AttendancePunchEvent` — every other module still reads the daily
   * `AttendanceRecord` rollup.
   *
   * Defaults to the days this view exists for: more than one check-in/check-out
   * pair, or punches at more than one location. A plain one-in/one-out day says
   * nothing the attendance record view does not already show, so listing it
   * here just buries the days that need attention. `scope=ALL` lifts the filter.
   */
  async listPunchEvents(tenantId: string, q: ListPunchEventsDto) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 25;
    const scope = q.scope ?? 'MULTI';
    const where = this.punchEventWhere(tenantId, q);

    const days = await this.punchDaySummaries(where, scope);
    const total = days.length;
    const pageDays = days.slice((page - 1) * pageSize, page * pageSize);

    return {
      data: pageDays.length ? await this.expandPunchDays(pageDays) : [],
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
        scope,
      },
    };
  }

  /**
   * The (employee, day) pairs matching a filter, newest day first.
   *
   * Grouping by location as well as by day gets the punch count and the number
   * of distinct locations in one aggregate query, so deciding which days
   * qualify never loads the events themselves. Only the page's days are then
   * expanded.
   */
  private async punchDaySummaries(
    where: Prisma.AttendancePunchEventWhereInput,
    scope: 'MULTI' | 'ALL',
  ) {
    const groups = await this.prisma.attendancePunchEvent.groupBy({
      by: ['employeeId', 'attendanceDate', 'locationId'],
      where,
      _count: { _all: true },
    });

    const byDay = new Map<
      string,
      { employeeId: string; attendanceDate: Date; punchCount: number; locationIds: Set<string> }
    >();
    for (const group of groups) {
      const key = `${group.employeeId}|${group.attendanceDate.toISOString().slice(0, 10)}`;
      const day = byDay.get(key) ?? {
        employeeId: group.employeeId,
        attendanceDate: group.attendanceDate,
        punchCount: 0,
        locationIds: new Set<string>(),
      };
      day.punchCount += group._count._all;
      if (group.locationId) day.locationIds.add(group.locationId);
      byDay.set(key, day);
    }

    const days = [...byDay.values()].filter(
      (day) =>
        scope === 'ALL' ||
        // More than one pair, or the same day worked at more than one place.
        day.punchCount > 2 ||
        day.locationIds.size > 1,
    );
    days.sort(
      (a, b) =>
        b.attendanceDate.getTime() - a.attendanceDate.getTime() ||
        a.employeeId.localeCompare(b.employeeId),
    );
    return days;
  }

  /** Loads and folds the punches for an already-selected page of days. */
  private async expandPunchDays(
    days: Array<{ employeeId: string; attendanceDate: Date }>,
  ) {
    const events = await this.prisma.attendancePunchEvent.findMany({
      where: {
        OR: days.map((day) => ({
          employeeId: day.employeeId,
          attendanceDate: day.attendanceDate,
        })),
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
        location: { select: { id: true, name: true, city: true } },
        shift: { select: { id: true, name: true } },
      },
      orderBy: { eventAt: 'asc' },
    });

    const byKey = new Map<string, typeof events>();
    for (const event of events) {
      const key = `${event.employeeId}|${event.attendanceDate.toISOString().slice(0, 10)}`;
      const bucket = byKey.get(key) ?? [];
      bucket.push(event);
      byKey.set(key, bucket);
    }

    // Driven by `days`, not by the query result, so page order is the order the
    // summaries were ranked in.
    return days.map((day) => {
      const key = `${day.employeeId}|${day.attendanceDate.toISOString().slice(0, 10)}`;
      const dayEvents = byKey.get(key) ?? [];
      const summary = summarisePunchEvents(dayEvents);
      return {
        employeeId: day.employeeId,
        employee: dayEvents[0]?.employee ?? null,
        date: day.attendanceDate,
        events: dayEvents,
        segments: summary.segments,
        punchCount: summary.punchCount,
        firstIn: summary.firstIn,
        lastOut: summary.lastOut,
        isOpen: summary.isOpen,
        grossMinutes: summary.grossMinutes ?? null,
        netMinutes: summary.netMinutes ?? null,
        locations: this.distinctLocations(dayEvents),
      };
    });
  }

  /** Locations worked that day, in the order they were first punched at. */
  private distinctLocations(
    events: Array<{ location: { id: string; name: string } | null }>,
  ): Array<{ id: string; name: string }> {
    const seen = new Map<string, { id: string; name: string }>();
    for (const event of events) {
      if (event.location && !seen.has(event.location.id)) {
        seen.set(event.location.id, { id: event.location.id, name: event.location.name });
      }
    }
    return [...seen.values()];
  }

  private punchEventWhere(
    tenantId: string,
    q: ListPunchEventsDto,
  ): Prisma.AttendancePunchEventWhereInput {
    const from = q.from ? requireAttendanceDate(q.from, 'from') : undefined;
    const to = q.to ? requireAttendanceDate(q.to, 'to') : undefined;
    return {
      tenantId,
      ...(q.employeeId && { employeeId: q.employeeId }),
      ...(q.locationId && { locationId: q.locationId }),
      ...((from || to) && {
        attendanceDate: { ...(from && { gte: from }), ...(to && { lte: to }) },
      }),
    };
  }

  /**
   * The same history as a CSV, one row per punch, honouring the same scope as
   * the screen — exporting every ordinary day when the view is filtered to the
   * multi-punch ones would not be the same report.
   */
  async exportPunchEventsCsv(tenantId: string, q: ListPunchEventsDto): Promise<string> {
    const scope = q.scope ?? 'MULTI';
    const where = this.punchEventWhere(tenantId, q);
    const events = await this.prisma.attendancePunchEvent.findMany({
      where,
      include: {
        employee: { select: { firstName: true, lastName: true, employeeCode: true } },
        location: { select: { name: true } },
      },
      orderBy: [{ attendanceDate: 'asc' }, { employeeId: 'asc' }, { eventAt: 'asc' }],
      take: 20000,
    });
    // Filtered against the qualifying days rather than re-queried per day: the
    // rows are already loaded, and an `OR` of every qualifying day would be a
    // far larger query than the scan it replaces.
    const included =
      scope === 'ALL'
        ? events
        : await this.punchDaySummaries(where, scope).then((days) => {
            const keys = new Set(
              days.map(
                (day) => `${day.employeeId}|${day.attendanceDate.toISOString().slice(0, 10)}`,
              ),
            );
            return events.filter((event) =>
              keys.has(
                `${event.employeeId}|${event.attendanceDate.toISOString().slice(0, 10)}`,
              ),
            );
          });

    return toCsv(
      included.map((event) => ({
        date: event.attendanceDate.toISOString().slice(0, 10),
        employeeCode: event.employee.employeeCode,
        name: `${event.employee.firstName} ${event.employee.lastName}`,
        direction: event.direction,
        time: event.eventAt.toISOString(),
        location: event.location?.name ?? '',
        source: event.source,
        gpsAccuracyM: event.geoAccuracy,
        systemGenerated: event.isSystemGenerated,
      })),
    );
  }

  /**
   * One employee's punches for one day, paired into segments with the totals
   * the day rolls up to. Backs the portal timeline and the per-day drilldown.
   */
  async punchDay(tenantId: string, employeeId: string, date: Date) {
    const day = dateOnly(date);
    const events = await this.prisma.attendancePunchEvent.findMany({
      where: { tenantId, employeeId, attendanceDate: day },
      include: { location: { select: { id: true, name: true, city: true } } },
      orderBy: { eventAt: 'asc' },
    });
    const summary = summarisePunchEvents(events);
    return {
      date: day,
      employeeId,
      events,
      segments: summary.segments,
      firstIn: summary.firstIn,
      lastOut: summary.lastOut,
      isOpen: summary.isOpen,
      punchCount: summary.punchCount,
      grossMinutes: summary.grossMinutes ?? null,
      netMinutes: summary.netMinutes ?? null,
      // Distinct locations worked, in the order they were first punched at.
      locations: events.reduce<Array<{ id: string; name: string }>>((acc, event) => {
        if (event.location && !acc.some((item) => item.id === event.location!.id)) {
          acc.push({ id: event.location.id, name: event.location.name });
        }
        return acc;
      }, []),
    };
  }

  /** The signed-in employee's own punches for a day, defaulting to today. */
  async myPunchDay(user: AuthUser, date?: string) {
    const employeeId = this.requireEmployee(user);
    return this.punchDay(
      user.tenantId,
      employeeId,
      date ? requireAttendanceDate(date) : dateOnly(new Date()),
    );
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
    const errors: Array<{ row: number; employeeCode: string; date: string; error: string }> = [];

    // Rows in one upload overwhelmingly share a shift, location and date, so
    // the rule that governs their grace period is looked up once per distinct
    // combination rather than once per row.
    const ruleCache = new Map<string, Awaited<ReturnType<typeof this.attendanceRule>>>();
    const ruleFor = async (shiftId: string | undefined, locationId: string | null, at: Date) => {
      const key = `${shiftId ?? ''}|${locationId ?? ''}|${at.toISOString()}`;
      if (!ruleCache.has(key)) {
        ruleCache.set(key, await this.attendanceRule(tenantId, { shiftId, locationId, date: at }));
      }
      return ruleCache.get(key) ?? null;
    };

    for (const [index, row] of dto.rows.entries()) {
      const employee = employeeByCode.get(row.employeeCode);
      if (!employee) {
        unknownEmployeeCodes.add(row.employeeCode);
        errors.push({
          row: index + 1,
          employeeCode: row.employeeCode,
          date: String(row.date ?? ''),
          error: 'Employee code not found',
        });
        continue;
      }
      // Row-level rather than request-level so one malformed date does not
      // reject an otherwise clean file, and the message names the formats.
      const parsedDate = parseAttendanceDateOrError(row.date);
      if ('error' in parsedDate) {
        errors.push({
          row: index + 1,
          employeeCode: row.employeeCode,
          date: String(row.date ?? ''),
          error: parsedDate.error,
        });
        continue;
      }
      const date = parsedDate.date;
      // One resolve per row covers both the shift and the location: capture
      // rules follow wherever the employee actually works that date, which a
      // date-effective assignment may override away from their base location.
      const { shift, assignedLocationId } = await this.shifts.resolveAt(tenantId, employee.id, date);
      const locationId = assignedLocationId ?? employee.locationId;
      await this.assertCaptureModeAllowed(
        tenantId,
        this.importSourceToCaptureMode(source),
        locationId,
      );
      const punchIn = row.punchIn ? new Date(row.punchIn) : undefined;
      const punchOut = row.punchOut ? new Date(row.punchOut) : undefined;
      const workingMinutes =
        punchIn && punchOut
          ? Math.max(0, Math.round((punchOut.getTime() - punchIn.getTime()) / 60000))
          : undefined;
      // An explicit status in the file still wins outright. Otherwise the row
      // is classified exactly as the punch path classifies the same two
      // punches: length first, then lateness against the shift and the rule
      // that governs it, via the same `isLateArrival`.
      const status =
        row.status ??
        this.withLateArrival(
          this.classifyAttendanceStatus({ workingMinutes, shift, tenantId, locationId, date }),
          punchIn ? isLateArrival(punchIn, shift, await ruleFor(shift?.id, locationId, date)) : false,
        );
      const derived = {
        shiftId: shift?.id,
        punchIn,
        punchOut,
        workingMinutes,
        // A file carries one pair per row, so its net time is its gross span.
        netMinutes: workingMinutes,
        overtimeMinutes: this.overtimeMinutes(punchIn, punchOut, shift),
        punchSource: source,
        status,
        remarks: row.deviceId ? `${source} import: ${row.deviceId}` : `${source} import`,
        isFinalized: source === 'BIOMETRIC' || source === 'API',
      };
      await this.prisma.attendanceRecord.upsert({
        where: { employeeId_date: { employeeId: employee.id, date } },
        create: { tenantId, employeeId: employee.id, date, ...derived },
        update: derived,
      });
      // Mirrored so an imported day reads the same in punch history as it does
      // in the record. Re-uploading the same file replaces these rows rather
      // than stacking a second copy of every punch.
      await syncSystemPunchEvents(this.prisma, {
        tenantId,
        employeeId: employee.id,
        date,
        punchIn,
        punchOut,
        locationId,
        shiftId: shift?.id ?? null,
        source: this.importSourceToCaptureMode(source),
        deviceId: row.deviceId ?? null,
        remarks: `${source} import`,
      });
      imported++;
    }

    return {
      imported,
      skipped: dto.rows.length - imported,
      unknownEmployeeCodes: [...unknownEmployeeCodes],
      errors,
    };
  }

  async updateRecord(tenantId: string, id: string, dto: UpdateAttendanceRecordDto) {
    const record = await this.prisma.attendanceRecord.findFirst({
      where: { id, tenantId },
      include: { employee: { select: { id: true, locationId: true } } },
    });
    if (!record) throw new NotFoundException('Attendance record not found');
    if (record.isFinalized) {
      throw new BadRequestException('Finalized attendance cannot be edited');
    }

    const date = dto.date ? requireAttendanceDate(dto.date) : record.date;
    const dateChanged = date.getTime() !== record.date.getTime();
    if (dateChanged) {
      // `(employeeId, date)` is unique, so moving a record onto a day the
      // employee already has one for is a plain conflict rather than a 500 from
      // a raw constraint violation.
      const clash = await this.prisma.attendanceRecord.findUnique({
        where: { employeeId_date: { employeeId: record.employeeId, date } },
        select: { id: true },
      });
      if (clash && clash.id !== record.id) {
        throw new BadRequestException(
          `This employee already has an attendance record on ${date.toISOString().slice(0, 10)}`,
        );
      }
    }
    if (dto.locationId) {
      const location = await this.prisma.location.findFirst({
        where: { id: dto.locationId, tenantId },
        select: { id: true },
      });
      if (!location) throw new NotFoundException('Location not found');
    }
    const punchIn = dto.punchIn !== undefined ? new Date(dto.punchIn) : record.punchIn;
    const punchOut = dto.punchOut !== undefined ? new Date(dto.punchOut) : record.punchOut;
    const workingMinutes =
      punchIn && punchOut
        ? Math.max(0, Math.round((punchOut.getTime() - punchIn.getTime()) / 60000))
        : undefined;
    const shift = await this.currentShiftAt(tenantId, record.employeeId, date);
    const punchLocations = await this.correctedPunchLocations(tenantId, record, dto, date);
    const shouldReclassify = !dto.status && (dto.date !== undefined || dto.punchIn !== undefined || dto.punchOut !== undefined);
    const status = dto.status ?? (shouldReclassify
      ? this.classifyAttendanceStatus({
          workingMinutes,
          shift,
          tenantId,
          locationId: record.employee.locationId,
          date,
        })
      : record.status);

    // The record and the events it derives are written together: a correction
    // that updated one and failed on the other would leave punch history
    // describing a day the record no longer claims.
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.attendanceRecord.update({
        where: { id },
        data: {
          date,
          shiftId: shift?.id,
          punchIn,
          punchOut,
          workingMinutes,
          netMinutes: workingMinutes,
          overtimeMinutes: this.overtimeMinutes(punchIn, punchOut, shift),
          status,
          punchSource: record.punchSource ?? 'MANUAL',
          remarks: record.remarks ?? 'Manual attendance correction',
        },
      });
      // Moving a record to another day leaves its old day's derived events
      // behind otherwise, describing punches the record no longer claims.
      if (dateChanged) {
        await syncSystemPunchEvents(tx, {
          tenantId,
          employeeId: record.employeeId,
          date: record.date,
          source: AttendanceCaptureMode.MANUAL,
        });
      }
      await syncSystemPunchEvents(tx, {
        tenantId,
        employeeId: record.employeeId,
        date,
        punchIn,
        punchOut,
        locationId: punchLocations.inLocationId,
        outLocationId: punchLocations.outLocationId,
        shiftId: shift?.id ?? null,
        source: AttendanceCaptureMode.MANUAL,
        remarks: 'Manual attendance correction',
      });
      return updated;
    });
  }

  /**
   * Where a corrected day's derived punches belong.
   *
   * An explicit `locationId` wins. Otherwise the day keeps the locations its
   * punches already record — reaching for the employee's base location would
   * quietly relocate a day worked at a second site back to their home office
   * every time HR nudged a punch time. Only a day with no punches at all falls
   * through to the location the employee is scheduled at.
   */
  private async correctedPunchLocations(
    tenantId: string,
    record: { employeeId: string; date: Date; employee: { locationId: string | null } },
    dto: UpdateAttendanceRecordDto,
    date: Date,
  ): Promise<{ inLocationId: string | null; outLocationId: string | null }> {
    if (dto.locationId) {
      return { inLocationId: dto.locationId, outLocationId: dto.locationId };
    }
    const existing = await this.prisma.attendancePunchEvent.findMany({
      where: { employeeId: record.employeeId, attendanceDate: record.date },
      orderBy: { eventAt: 'asc' },
      select: { direction: true, locationId: true },
    });
    const firstIn = existing.find((event) => event.direction === PunchDirection.IN);
    const lastOut = [...existing].reverse().find((event) => event.direction === PunchDirection.OUT);
    if (firstIn || lastOut) {
      const fallback = firstIn?.locationId ?? lastOut?.locationId ?? null;
      return {
        inLocationId: firstIn?.locationId ?? fallback,
        outLocationId: lastOut?.locationId ?? fallback,
      };
    }
    const scheduled =
      (await this.shifts.effectiveLocationId(tenantId, record.employeeId, date)) ??
      record.employee.locationId;
    return { inLocationId: scheduled, outLocationId: scheduled };
  }

  async deleteRecord(tenantId: string, id: string) {
    const record = await this.prisma.attendanceRecord.findFirst({
      where: { id, tenantId },
      select: { id: true, isFinalized: true, employeeId: true, date: true },
    });
    if (!record) throw new NotFoundException('Attendance record not found');
    if (record.isFinalized) {
      throw new BadRequestException('Finalized attendance cannot be deleted');
    }
    // Both in one transaction: a delete that dropped the record but failed to
    // drop its derived events would leave punch history showing punches for a
    // day that no longer exists.
    await this.prisma.$transaction(async (tx) => {
      await tx.attendanceRecord.delete({ where: { id } });
      // The derived events go with the record they were derived from. Punches
      // the employee actually made survive, so deleting a record never destroys
      // punch evidence — it only removes what the record itself produced.
      await syncSystemPunchEvents(tx, {
        tenantId,
        employeeId: record.employeeId,
        date: record.date,
        source: AttendanceCaptureMode.MANUAL,
      });
    });
    return { deleted: true };
  }

  /**
   * Folds a late arrival into a finished day's classification.
   *
   * Lateness only ever qualifies a day that was otherwise worked in full: a
   * short or half day is already described by its own status, and saying LATE
   * instead would hide the shortfall. Shared by the punch-out path and the row
   * import so a day cannot be classified differently by how it arrived.
   */
  private withLateArrival(status: AttendanceStatus, arrivedLate: boolean): AttendanceStatus {
    return status === AttendanceStatus.PRESENT && arrivedLate ? AttendanceStatus.LATE : status;
  }

  /**
   * A day with both punches, scored as a share of its shift. See
   * `attendance-status.ts` for the thresholds and why the break is not read.
   */
  private classifyAttendanceStatus(input: {
    workingMinutes?: number;
    shift?: { startTime?: string | null; endTime?: string | null } | null;
    tenantId?: string;
    locationId?: string | null;
    date?: Date;
  }): AttendanceStatus {
    if (input.workingMinutes == null) return 'MISSING_PUNCH';
    return workedDayStatus({ workingMinutes: input.workingMinutes, shift: input.shift });
  }

  /** Minutes clocked after the resolved shift ended. See `overtimeAfterShiftEnd`. */
  private overtimeMinutes(
    punchIn?: Date | null,
    punchOut?: Date | null,
    shift?: { startTime?: string | null; endTime?: string | null } | null,
  ): number | undefined {
    return overtimeAfterShiftEnd({ punchIn, punchOut, shift });
  }

  private async holidayDateSet(tenantId: string, start: Date, endInclusive: Date) {
    const holidays = await this.prisma.holiday.findMany({
      where: { holidayCalendar: { tenantId }, date: { gte: start, lte: endInclusive } },
      select: { date: true },
    });
    return new Set(holidays.map((holiday) => holiday.date.toISOString().slice(0, 10)));
  }

  /** Approved leave expanded to `${employeeId}:YYYY-MM-DD` keys, clipped to the window. */
  private async approvedLeaveDaySet(
    tenantId: string,
    employeeIds: string[],
    start: Date,
    endInclusive: Date,
  ) {
    const approvedLeaves = await this.prisma.leaveRequest.findMany({
      where: {
        tenantId,
        employeeId: { in: employeeIds },
        status: 'APPROVED',
        fromDate: { lte: endInclusive },
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
    return leaveDaySet;
  }

  private classifyExpectedDay(input: {
    onLeave: boolean;
    isHoliday: boolean;
    isWeeklyOff: boolean;
  }): AttendanceStatus {
    if (input.onLeave) return 'ON_LEAVE';
    if (input.isHoliday) return 'HOLIDAY';
    if (input.isWeeklyOff) return 'WEEKEND';
    return 'ABSENT';
  }

  /** The shift/location shape branches `attendanceRule` matches on, in the same order. */
  private ruleMatches(
    rule: { shiftId: string | null; locationId: string | null; isDefault: boolean },
    shiftId: string | null | undefined,
    locationId: string | null,
  ): boolean {
    if (rule.isDefault) return true;
    if (shiftId && rule.shiftId === shiftId) {
      return rule.locationId === null || (!!locationId && rule.locationId === locationId);
    }
    return !!locationId && rule.shiftId === null && rule.locationId === locationId;
  }

  /**
   * Resolves the attendance rule for every day in a range from a single query,
   * using the same precedence as `attendanceRule` (non-default before default,
   * then most recently updated) so a rule that changes mid-month is honoured
   * per date rather than pinned for the whole range.
   */
  private async attendanceRulesForRange(
    tenantId: string,
    locationId: string | null,
    start: Date,
    end: Date,
  ) {
    const rules = await this.prisma.attendanceRule.findMany({
      where: {
        tenantId,
        isActive: true,
        effectiveFrom: { lte: end },
        AND: [{ OR: [{ effectiveTo: null }, { effectiveTo: { gte: start } }] }],
        OR: [{ locationId }, { locationId: null }, { isDefault: true }],
      },
      orderBy: [{ isDefault: 'asc' }, { updatedAt: 'desc' }],
    });
    return (shiftId: string | null | undefined, at: Date) =>
      rules.find(
        (rule) =>
          rule.effectiveFrom <= at &&
          (rule.effectiveTo === null || rule.effectiveTo >= at) &&
          this.ruleMatches(rule, shiftId, locationId),
      ) ?? null;
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

  /**
   * Read-only monthly day ledger for one employee. Stored records win per day;
   * unrecorded days are derived with the same precedence as month finalization.
   * Days outside the employee's joining/relieving window, and days after today,
   * are omitted entirely rather than counted as absent.
   */
  async monthlyLedgerFor(
    tenantId: string,
    employeeId: string,
    month: string,
    bounds: { joiningDate?: Date | null; exitDate?: Date | null } = {},
  ) {
    const { start, endInclusive } = monthParts(month);
    const joining = bounds.joiningDate ? utcDateOnly(bounds.joiningDate) : null;
    const exit = bounds.exitDate ? utcDateOnly(bounds.exitDate) : null;
    const today = dateOnly(new Date());
    const windowStart = joining && joining > start ? joining : start;
    let windowEnd = endInclusive;
    if (exit && exit < windowEnd) windowEnd = exit;
    const clampedToToday = today < windowEnd;
    if (clampedToToday) windowEnd = today;

    const days: Array<{
      date: Date;
      status: AttendanceStatus;
      source: 'RECORD' | 'DERIVED';
      punchIn: Date | null;
      punchOut: Date | null;
      workingMinutes: number | null;
      overtimeMinutes: number | null;
      isLate: boolean;
      isEarlyDeparture: boolean;
      earlyDepartureMinutes: number;
      shiftId: string | null;
      locationId: string | null;
    }> = [];

    if (windowStart <= windowEnd) {
      const baseLocationId = await this.employeeLocationId(tenantId, employeeId);
      const [records, holidaySet, leaveDaySet, resolveAt, ruleAt] = await Promise.all([
        this.prisma.attendanceRecord.findMany({
          where: { tenantId, employeeId, date: { gte: windowStart, lte: windowEnd } },
          orderBy: { date: 'asc' },
        }),
        this.holidayDateSet(tenantId, windowStart, windowEnd),
        this.approvedLeaveDaySet(tenantId, [employeeId], windowStart, windowEnd),
        this.shifts.resolverForRange(tenantId, employeeId, windowStart, windowEnd),
        this.attendanceRulesForRange(tenantId, baseLocationId, windowStart, windowEnd),
      ]);
      const recordByDate = new Map(
        records.map((record) => [record.date.toISOString().slice(0, 10), record]),
      );

      for (let d = new Date(windowStart); d <= windowEnd; d.setUTCDate(d.getUTCDate() + 1)) {
        const date = new Date(d);
        const key = date.toISOString().slice(0, 10);
        const record = recordByDate.get(key);
        const { shift, assignedLocationId } = resolveAt(date);
        const dayOfWeek = date.getUTCDay();
        const isWeeklyOff =
          shift?.weeklyOffDays.includes(dayOfWeek) ?? (dayOfWeek === 0 || dayOfWeek === 6);
        const status =
          record?.status ??
          this.classifyExpectedDay({
            onLeave: leaveDaySet.has(`${employeeId}:${key}`),
            isHoliday: holidaySet.has(key),
            isWeeklyOff,
          });
        const rule = record?.punchIn || record?.punchOut ? ruleAt(shift?.id, date) : null;
        const early = earlyDeparture({
          punchOut: record?.punchOut,
          punchIn: record?.punchIn,
          shift,
          rule,
        });
        days.push({
          date,
          status,
          source: record ? 'RECORD' : 'DERIVED',
          punchIn: record?.punchIn ?? null,
          punchOut: record?.punchOut ?? null,
          workingMinutes: record?.workingMinutes ?? null,
          overtimeMinutes: record?.overtimeMinutes ?? null,
          shiftId: record?.shiftId ?? shift?.id ?? null,
          locationId: assignedLocationId ?? baseLocationId,
          isLate:
            status === 'LATE' ||
            (record?.punchIn ? isLateArrival(record.punchIn, shift, rule) : false),
          isEarlyDeparture: status === 'EARLY_LEAVING' || early.isEarlyDeparture,
          earlyDepartureMinutes: early.earlyByMinutes,
        });
      }
    }

    const count = (status: AttendanceStatus) => days.filter((day) => day.status === status).length;
    const present = count('PRESENT');
    const late = count('LATE');
    const halfDay = count('HALF_DAY');
    const onLeave = count('ON_LEAVE');
    const holiday = count('HOLIDAY');
    const weeklyOff = count('WEEKEND');
    const expectedWorkingDays = days.length - holiday - weeklyOff;
    // Approved leave is neither rewarded nor penalised in the percentage.
    const attendableDays = expectedWorkingDays - onLeave;
    const worked = days.filter((day) => day.workingMinutes != null);
    const totalWorkingMinutes = worked.reduce((sum, day) => sum + (day.workingMinutes ?? 0), 0);

    return {
      month,
      windowStart,
      windowEnd,
      clampedToToday,
      days,
      counts: {
        expectedWorkingDays,
        present,
        late,
        halfDay,
        absent: count('ABSENT'),
        onLeave,
        holiday,
        weeklyOff,
        missingPunch: count('MISSING_PUNCH'),
        attendancePercentage:
          attendableDays > 0
            ? Math.round(((present + late + halfDay * 0.5) / attendableDays) * 1000) / 10
            : null,
        avgWorkHours: worked.length
          ? Math.round((totalWorkingMinutes / worked.length / 60) * 10) / 10
          : 0,
        lateArrivals: days.filter((day) => day.isLate).length,
        earlyDepartures: days.filter((day) => day.isEarlyDeparture).length,
        earlyDepartureMinutes: days.reduce((sum, day) => sum + day.earlyDepartureMinutes, 0),
        totalWorkingMinutes,
        overtimeMinutes: days.reduce((sum, day) => sum + (day.overtimeMinutes ?? 0), 0),
      },
    };
  }

  async regularize(user: AuthUser, dto: RegularizeDto) {
    const employeeId = dto.employeeId ?? this.requireEmployee(user);
    const date = requireAttendanceDate(dto.date);
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
    // Same derived values as every other write path, so a regularized day is
    // not a hole in the overtime totals the summary and finalization read.
    // The PRESENT status is deliberate and unchanged: a regularization is an
    // approved assertion that the day was worked, not a derivation.
    const { shift } = await this.shifts.resolveAt(tenantId, employeeId, input.date);
    const overtimeMinutes = this.overtimeMinutes(input.punchIn, input.punchOut, shift);
    const derived = {
      shiftId: shift?.id,
      punchIn: input.punchIn,
      punchOut: input.punchOut,
      workingMinutes,
      netMinutes: workingMinutes,
      overtimeMinutes,
      status: AttendanceStatus.PRESENT,
      punchSource: 'MANUAL',
      remarks: `Regularization: ${input.reason}`,
    };
    const record = await this.prisma.attendanceRecord.upsert({
      where: { employeeId_date: { employeeId, date: input.date } },
      create: { tenantId, employeeId, date: input.date, ...derived },
      update: derived,
    });
    await syncSystemPunchEvents(this.prisma, {
      tenantId,
      employeeId,
      date: input.date,
      punchIn: input.punchIn,
      punchOut: input.punchOut,
      locationId: await this.employeeLocationId(tenantId, employeeId),
      shiftId: shift?.id ?? null,
      source: AttendanceCaptureMode.MANUAL,
      remarks: `Regularization: ${input.reason}`,
    });
    return record;
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
    const shifts = await this.prisma.shift.findMany({
      where: { tenantId },
      include: { _count: { select: { shiftAssignments: true } } },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
    // `_count.shiftAssignments` is every assignment row ever written, including
    // expired ones and one-day roster overrides, so it reads far higher than
    // the headcount actually on the shift. `activeAssignments` is resolved
    // through the same precedence the punch path uses.
    const counts = await this.shifts.activeShiftCounts(tenantId, dateOnly(new Date()));
    return shifts.map((shift) => ({ ...shift, activeAssignments: counts.get(shift.id) ?? 0 }));
  }

  /**
   * The assignment ledger behind Attendance → Rosters: current and historical
   * assignments for the searched employees and window, each flagged with the
   * assignments it overlaps so ambiguity is visible rather than hidden.
   */
  async listShiftAssignments(tenantId: string, q: ListShiftAssignmentsDto) {
    const from = q.from ? requireAttendanceDate(q.from, 'from') : undefined;
    const to = q.to ? requireAttendanceDate(q.to, 'to') : undefined;
    const assignments = await this.prisma.shiftAssignment.findMany({
      where: {
        employee: {
          tenantId,
          ...(q.employeeId && { id: q.employeeId }),
          ...(q.search && {
            OR: [
              { firstName: { contains: q.search, mode: 'insensitive' } },
              { lastName: { contains: q.search, mode: 'insensitive' } },
              { employeeCode: { contains: q.search, mode: 'insensitive' } },
            ],
          }),
        },
        ...(to && { effectiveFrom: { lte: to } }),
        ...(from && { OR: [{ effectiveTo: null }, { effectiveTo: { gte: from } }] }),
      },
      include: {
        shift: { select: { id: true, name: true, startTime: true, endTime: true, isDefault: true } },
        location: { select: { id: true, name: true } },
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeCode: true,
            location: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ employeeId: 'asc' }, ...ASSIGNMENT_PRECEDENCE],
      take: Math.min(q.limit ?? 200, 500),
    });

    const byEmployee = new Map<string, typeof assignments>();
    for (const assignment of assignments) {
      const bucket = byEmployee.get(assignment.employeeId) ?? [];
      bucket.push(assignment);
      byEmployee.set(assignment.employeeId, bucket);
    }
    const today = dateOnly(new Date());

    return assignments.map((assignment) => {
      const siblings = byEmployee.get(assignment.employeeId) ?? [];
      const overlaps = siblings.filter(
        (other) =>
          other.id !== assignment.id &&
          other.effectiveFrom <= (assignment.effectiveTo ?? new Date(8640000000000000)) &&
          (other.effectiveTo === null || other.effectiveTo >= assignment.effectiveFrom),
      );
      const isActive =
        assignment.effectiveFrom <= today &&
        (assignment.effectiveTo === null || assignment.effectiveTo >= today);
      return {
        ...assignment,
        // The location this assignment actually puts the employee at: its own
        // override, or the employee's base location when it sets none.
        effectiveLocation: assignment.location ?? assignment.employee.location ?? null,
        locationIsOverride: Boolean(assignment.locationId),
        status: isActive
          ? 'ACTIVE'
          : assignment.effectiveFrom > today
            ? 'SCHEDULED'
            : ('EXPIRED' as const),
        overlappingAssignmentIds: overlaps.map((other) => other.id),
      };
    });
  }

  /** The assignment that governs attendance for one employee on one date. */
  async effectiveShiftFor(tenantId: string, employeeId: string, date: string) {
    const at = requireAttendanceDate(date);
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeCode: true,
        locationId: true,
        location: { select: { id: true, name: true } },
      },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    const resolved = await this.shifts.resolveAt(tenantId, employeeId, at);
    const overrideLocation = resolved.assignedLocationId
      ? await this.prisma.location.findFirst({
          where: { id: resolved.assignedLocationId, tenantId },
          select: { id: true, name: true },
        })
      : null;
    return {
      date: at,
      employeeId,
      // Named so a caller can never present this resolution as if it applied to
      // anyone but the employee actually asked about.
      employee: {
        id: employee.id,
        firstName: employee.firstName,
        lastName: employee.lastName,
        employeeCode: employee.employeeCode,
      },
      shift: resolved.shift,
      assignment: resolved.assignment,
      source: resolved.assignment ? resolved.assignment.source : 'TENANT_DEFAULT',
      effectiveLocation: overrideLocation ?? employee.location ?? null,
      defaultLocation: employee.location ?? null,
      locationIsOverride: Boolean(resolved.assignedLocationId),
    };
  }

  async updateShiftAssignment(tenantId: string, id: string, dto: UpdateShiftAssignmentDto) {
    const assignment = await this.prisma.shiftAssignment.findFirst({
      where: { id, employee: { tenantId } },
    });
    if (!assignment) throw new NotFoundException('Shift assignment not found');
    if (dto.shiftId) {
      const shift = await this.prisma.shift.findFirst({ where: { id: dto.shiftId, tenantId } });
      if (!shift) throw new NotFoundException('Shift not found');
    }
    if (dto.locationId) {
      const location = await this.prisma.location.findFirst({
        where: { id: dto.locationId, tenantId },
      });
      if (!location) throw new NotFoundException('Location not found');
    }
    const effectiveFrom = dto.effectiveFrom
      ? requireAttendanceDate(dto.effectiveFrom, 'effectiveFrom')
      : assignment.effectiveFrom;
    const effectiveTo =
      dto.effectiveTo === undefined
        ? assignment.effectiveTo
        : dto.effectiveTo === null || dto.effectiveTo === ''
          ? null
          : requireAttendanceDate(dto.effectiveTo, 'effectiveTo');
    if (effectiveTo && effectiveTo < effectiveFrom) {
      throw new BadRequestException('Effective to cannot be before effective from');
    }
    return this.prisma.shiftAssignment.update({
      where: { id },
      data: {
        ...(dto.shiftId && { shiftId: dto.shiftId }),
        // `locationId: null` clears the override back to the employee's base
        // location; omitting it leaves the override untouched.
        ...(dto.locationId !== undefined && { locationId: dto.locationId || null }),
        effectiveFrom,
        effectiveTo,
      },
      include: { shift: { select: { id: true, name: true } }, location: { select: { id: true, name: true } } },
    });
  }

  async deleteShiftAssignment(tenantId: string, id: string) {
    const assignment = await this.prisma.shiftAssignment.findFirst({
      where: { id, employee: { tenantId } },
      select: { id: true },
    });
    if (!assignment) throw new NotFoundException('Shift assignment not found');
    await this.prisma.shiftAssignment.delete({ where: { id } });
    return { deleted: true };
  }

  async createShift(tenantId: string, dto: CreateShiftDto) {
    // A tenant's very first shift becomes the default automatically, so
    // employees without an explicit assignment always resolve to something
    // deterministic instead of an undefined fallback.
    const hasAnyShift = await this.prisma.shift.findFirst({ where: { tenantId }, select: { id: true } });
    return this.prisma.shift.create({ data: { ...dto, tenantId, isDefault: !hasAnyShift } });
  }

  async setDefaultShift(tenantId: string, id: string) {
    const shift = await this.prisma.shift.findFirst({ where: { id, tenantId } });
    if (!shift) throw new NotFoundException('Shift not found');
    if (!shift.isActive) {
      throw new BadRequestException('An inactive shift cannot be set as the default');
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.shift.updateMany({ where: { tenantId, isDefault: true }, data: { isDefault: false } });
      return tx.shift.update({ where: { id }, data: { isDefault: true } });
    });
  }

  async updateShiftWeeklyOffs(tenantId: string, id: string, dto: UpdateShiftWeeklyOffsDto) {
    const shift = await this.prisma.shift.findFirst({ where: { id, tenantId } });
    if (!shift) throw new NotFoundException('Shift not found');
    return this.prisma.shift.update({
      where: { id },
      data: { weeklyOffDays: dto.weeklyOffDays },
    });
  }

  async assignShift(tenantId: string, dto: AssignShiftDto) {
    const shift = await this.prisma.shift.findFirst({ where: { id: dto.shiftId, tenantId } });
    if (!shift) throw new NotFoundException('Shift not found');

    if (dto.locationId) {
      const location = await this.prisma.location.findFirst({ where: { id: dto.locationId, tenantId } });
      if (!location) throw new NotFoundException('Location not found');
    }

    const employeeIds = [...new Set(dto.employeeIds)];
    const validEmployees = await this.prisma.employee.findMany({
      where: { id: { in: employeeIds }, tenantId },
      select: { id: true },
    });
    if (validEmployees.length !== employeeIds.length) {
      throw new BadRequestException('One or more employees do not belong to this workspace');
    }

    const effectiveFrom = dto.effectiveFrom
      ? requireAttendanceDate(dto.effectiveFrom, 'effectiveFrom')
      : dateOnly(new Date());

    // A later-starting open-ended assignment would shadow this one from its own
    // start date onwards. That is not something this workflow can replace
    // safely, so it is reported instead of being silently left ambiguous.
    const shadowing = await this.prisma.shiftAssignment.findFirst({
      where: {
        employeeId: { in: employeeIds },
        effectiveTo: null,
        effectiveFrom: { gt: effectiveFrom },
      },
      include: { employee: { select: { employeeCode: true } } },
    });
    if (shadowing) {
      throw new BadRequestException(
        `${shadowing.employee.employeeCode} already has an open-ended assignment starting ${shadowing.effectiveFrom
          .toISOString()
          .slice(0, 10)} — delete or end-date it before assigning from ${effectiveFrom
          .toISOString()
          .slice(0, 10)}`,
      );
    }

    await this.prisma.$transaction([
      // Close out any still-open assignment the day before the new one starts.
      // `effectiveTo` is the inclusive last day, so closing it *on*
      // `effectiveFrom` left both rows covering that day and made the boundary
      // day depend on row ordering.
      this.prisma.shiftAssignment.updateMany({
        where: { employeeId: { in: employeeIds }, effectiveTo: null },
        data: { effectiveTo: previousDay(effectiveFrom) },
      }),
      this.prisma.shiftAssignment.createMany({
        data: employeeIds.map((employeeId) => ({
          employeeId,
          shiftId: dto.shiftId,
          locationId: dto.locationId ?? null,
          effectiveFrom,
        })),
      }),
    ]);
    return { assigned: employeeIds.length };
  }

  async importRoster(tenantId: string, uploadedById: string | undefined, dto: ImportRosterDto) {
    if (!dto.rows.length) throw new BadRequestException('Roster import requires at least one row');
    const parsedDates = dto.rows.map((row) => parseAttendanceDate(row.date));
    const validDates = parsedDates.filter((date): date is Date => date !== null);
    if (!validDates.length) {
      throw new BadRequestException(
        `Roster import has no usable dates — use ${SUPPORTED_ATTENDANCE_DATE_FORMATS}`,
      );
    }
    const periodStart = new Date(Math.min(...validDates.map((date) => date.getTime())));
    const periodEnd = new Date(Math.max(...validDates.map((date) => date.getTime())));
    const employees = await this.prisma.employee.findMany({
      where: { tenantId, employeeCode: { in: [...new Set(dto.rows.map((row) => row.employeeCode))] } },
      select: { id: true, employeeCode: true },
    });
    const employeeByCode = new Map(employees.map((employee) => [employee.employeeCode, employee]));
    const shifts = await this.prisma.shift.findMany({ where: { tenantId, isActive: true } });
    const shiftById = new Map(shifts.map((shift) => [shift.id, shift]));
    const shiftByName = new Map(shifts.map((shift) => [shift.name.toLowerCase(), shift]));

    // Every assignment already covering any day in the uploaded window, so a
    // conflicting row is reported (or explicitly replaced) instead of silently
    // adding a second assignment for the same employee and day.
    const existingAssignments = await this.prisma.shiftAssignment.findMany({
      where: {
        employee: { tenantId },
        employeeId: { in: employees.map((employee) => employee.id) },
        effectiveFrom: { lte: periodEnd },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: periodStart } }],
      },
      select: {
        id: true,
        employeeId: true,
        effectiveFrom: true,
        effectiveTo: true,
        source: true,
        shift: { select: { name: true } },
      },
    });

    const roster = await this.prisma.rosterUpload.create({
      data: { tenantId, name: dto.name, periodStart, periodEnd, uploadedById },
    });
    let imported = 0;
    let failed = 0;
    let replaced = 0;
    const errors: Array<{ row: number; employeeCode: string; date: string; error: string }> = [];
    const seenRowKeys = new Set<string>();

    for (const [index, row] of dto.rows.entries()) {
      const employee = employeeByCode.get(row.employeeCode);
      const shift = row.shiftId
        ? shiftById.get(row.shiftId)
        : row.shiftName
          ? shiftByName.get(row.shiftName.toLowerCase())
          : undefined;
      const rowDate = parsedDates[index];
      const rowKey = `${row.employeeCode}:${rowDate?.toISOString().slice(0, 10)}`;

      let error: string | undefined;
      if (!rowDate) {
        error = `Unsupported date "${String(row.date ?? '').trim()}" — use ${SUPPORTED_ATTENDANCE_DATE_FORMATS}`;
      } else if (!employee) {
        error = 'Employee code not found';
      } else if (!shift) {
        error = 'Shift not found';
      } else if (seenRowKeys.has(rowKey)) {
        error = 'Duplicate row for this employee and date in the same file';
      }

      // An assignment already covering this day is ambiguous unless the upload
      // explicitly asked to replace it.
      const conflicts =
        !error && employee && rowDate
          ? existingAssignments.filter(
              (existing) =>
                existing.employeeId === employee.id &&
                existing.effectiveFrom <= rowDate &&
                (existing.effectiveTo === null || existing.effectiveTo >= rowDate) &&
                // Open-ended base assignments are the employee's standing shift;
                // a single-day roster override on top of one is the intended
                // model, so only same-day assignments are true conflicts.
                existing.effectiveTo !== null &&
                existing.effectiveFrom.getTime() === rowDate.getTime(),
            )
          : [];
      if (conflicts.length && !dto.replaceExisting) {
        error = `${row.employeeCode} already has a ${conflicts[0].shift.name} assignment on ${rowDate!
          .toISOString()
          .slice(0, 10)} (source ${conflicts[0].source}) — re-upload with "replace existing" to overwrite it`;
      }

      await this.prisma.rosterUploadRow.create({
        data: {
          rosterUploadId: roster.id,
          employeeId: employee?.id,
          employeeCode: row.employeeCode,
          shiftId: shift?.id,
          shiftName: row.shiftName ?? shift?.name,
          // `date` is non-null in the schema; unparseable rows keep the period
          // start so the failure is still recorded and reviewable.
          date: rowDate ?? periodStart,
          status: error ? 'FAILED' : 'IMPORTED',
          error,
        },
      });
      if (error || !employee || !shift || !rowDate) {
        failed++;
        errors.push({
          row: index + 1,
          employeeCode: row.employeeCode,
          date: String(row.date ?? ''),
          error: error ?? 'Unknown roster error',
        });
        continue;
      }

      seenRowKeys.add(rowKey);
      if (conflicts.length) {
        await this.prisma.shiftAssignment.deleteMany({
          where: { id: { in: conflicts.map((conflict) => conflict.id) } },
        });
        replaced += conflicts.length;
      }
      const created = await this.prisma.shiftAssignment.create({
        data: {
          employeeId: employee.id,
          shiftId: shift.id,
          // Inclusive last day: a one-day roster row covers exactly its own
          // day. It previously ran to the next day and leaked onto a date the
          // roster never mentioned.
          effectiveFrom: rowDate,
          effectiveTo: rowDate,
          locationId: row.locationId ?? null,
          source: 'ROSTER_UPLOAD',
          rosterUploadId: roster.id,
        },
        select: {
          id: true,
          employeeId: true,
          effectiveFrom: true,
          effectiveTo: true,
          source: true,
          shift: { select: { name: true } },
        },
      });
      existingAssignments.push(created);
      imported++;
    }
    const upload = await this.prisma.rosterUpload.update({
      where: { id: roster.id },
      data: {
        status: failed > 0 ? 'FAILED' : 'IMPORTED',
        importedCount: imported,
        failedCount: failed,
        errors,
      },
      include: { rows: { take: 25, orderBy: { createdAt: 'desc' } } },
    });
    return { ...upload, replacedCount: replaced };
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
      select: { id: true, employeeId: true, date: true, status: true },
    });
    const existingKeys = new Set(existing.map((record) => `${record.employeeId}:${record.date.toISOString().slice(0, 10)}`));
    const holidaySet = await this.holidayDateSet(tenantId, start, endInclusive);
    const leaveDaySet = await this.approvedLeaveDaySet(
      tenantId,
      employees.map((employee) => employee.id),
      start,
      endInclusive,
    );

    // A day already recorded as an absence but since covered by approved leave
    // would otherwise be charged twice: once against the leave balance and again
    // as payroll LOP. Worked statuses are left untouched.
    const reconciledToLeave = existing
      .filter(
        (record) =>
          LEAVE_RECONCILABLE_STATUSES.includes(record.status) &&
          leaveDaySet.has(`${record.employeeId}:${record.date.toISOString().slice(0, 10)}`),
      )
      .map((record) => record.id);
    if (reconciledToLeave.length) {
      await this.prisma.attendanceRecord.updateMany({
        where: { id: { in: reconciledToLeave } },
        data: { status: 'ON_LEAVE' },
      });
    }

    for (let d = new Date(start); d < endExclusive; d.setUTCDate(d.getUTCDate() + 1)) {
      for (const employee of employees) {
        const key = `${employee.id}:${d.toISOString().slice(0, 10)}`;
        if (existingKeys.has(key)) continue;
        const { shift, isWeeklyOff } = await this.weeklyOffAt(tenantId, employee.id, d);
        const status = this.classifyExpectedDay({
          onLeave: leaveDaySet.has(key),
          isHoliday: holidaySet.has(d.toISOString().slice(0, 10)),
          isWeeklyOff,
        });
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

    // Scoped to the finalized employees only: a location-scoped finalization
    // recreates inputs for its own employees, so a tenant-wide delete would drop
    // another location's attendance inputs without regenerating them.
    const finalizedEmployeeIds = employees.map((employee) => employee.id);
    if (finalizedEmployeeIds.length) {
      await this.prisma.payrollVariableInput.deleteMany({
        where: {
          tenantId,
          month: monthNumber,
          year,
          source: 'ATTENDANCE',
          type: { in: ['OVERTIME', 'SHIFT_ALLOWANCE'] },
          employeeId: { in: finalizedEmployeeIds },
        },
      });
    }
    const byEmployee = new Map<string, { overtimeMinutes: number; allowance: number }>();
    for (const record of records) {
      const current = byEmployee.get(record.employeeId) ?? { overtimeMinutes: 0, allowance: 0 };
      current.overtimeMinutes += record.overtimeMinutes ?? this.overtimeMinutes(record.punchIn, record.punchOut, record.shift) ?? 0;
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
            expiresAt: new Date(record.date.getTime() + COMP_OFF_VALIDITY_DAYS * 24 * 60 * 60 * 1000),
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

  /**
   * Manually credits a comp-off. HR needs this because the automatic grant only
   * fires at month finalization, and only for days the system itself classified
   * as weekly-off or holiday work — an ad-hoc credit (an on-call Sunday, a day
   * worked before the tenant's holiday calendar was loaded) has no other route.
   *
   * The earned day is linked to its attendance record when one exists, so the
   * grant and the day it was earned on stay traceable to each other, and a
   * second credit for the same day is rejected rather than silently doubled.
   */
  async createCompOff(tenantId: string, dto: CreateCompOffDto) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, tenantId },
      select: { id: true },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    const earnedDate = requireAttendanceDate(dto.earnedDate);
    const duplicate = await this.prisma.compOffGrant.findFirst({
      where: {
        tenantId,
        employeeId: employee.id,
        earnedDate,
        status: { in: [CompOffStatus.AVAILABLE, CompOffStatus.USED] },
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new BadRequestException('This employee already has a comp-off credited for that date');
    }

    const record = await this.prisma.attendanceRecord.findUnique({
      where: { employeeId_date: { employeeId: employee.id, date: earnedDate } },
      select: { id: true },
    });

    return this.prisma.compOffGrant.create({
      data: {
        tenantId,
        employeeId: employee.id,
        sourceAttendanceRecordId: record?.id,
        earnedDate,
        days: dto.days ?? 1,
        expiresAt: dto.expiresAt
          ? requireAttendanceDate(dto.expiresAt, 'expiresAt')
          : new Date(earnedDate.getTime() + COMP_OFF_VALIDITY_DAYS * 24 * 60 * 60 * 1000),
        notes: dto.notes ?? 'Manually credited',
      },
      include: { employee: { select: { firstName: true, lastName: true, employeeCode: true } } },
    });
  }

  /** Marks a grant used, cancelled or expired. Only an available grant can move. */
  async decideCompOff(tenantId: string, id: string, dto: DecideCompOffDto) {
    const grant = await this.prisma.compOffGrant.findFirst({ where: { id, tenantId } });
    if (!grant) throw new NotFoundException('Comp-off not found');
    if (grant.status !== CompOffStatus.AVAILABLE) {
      throw new BadRequestException(`This comp-off is already ${grant.status.toLowerCase()}`);
    }
    return this.prisma.compOffGrant.update({
      where: { id },
      data: { status: dto.status, ...(dto.notes && { notes: dto.notes }) },
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
    if (dto.counterpartEmployeeId === employeeId) {
      throw new BadRequestException('You cannot request a shift swap with yourself');
    }
    const [requestedShift, targetShift, counterpart] = await Promise.all([
      this.prisma.shift.findFirst({ where: { id: dto.requestedShiftId, tenantId: user.tenantId } }),
      this.prisma.shift.findFirst({ where: { id: dto.targetShiftId, tenantId: user.tenantId } }),
      dto.counterpartEmployeeId
        ? this.prisma.employee.findFirst({ where: { id: dto.counterpartEmployeeId, tenantId: user.tenantId } })
        : null,
    ]);
    if (!requestedShift || !targetShift) throw new NotFoundException('Shift not found');
    if (dto.counterpartEmployeeId && !counterpart) {
      throw new NotFoundException('Counterpart employee not found in this workspace');
    }
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
      // `effectiveTo` is the inclusive last day, so a one-day swap starts and
      // ends on the swapped date. Running to the next day leaked the swapped
      // shift onto a date nobody swapped.
      await this.prisma.shiftAssignment.create({
        data: {
          employeeId: request.requesterEmployeeId,
          shiftId: request.targetShiftId,
          effectiveFrom: request.targetDate,
          effectiveTo: request.targetDate,
          source: 'SHIFT_SWAP',
        },
      });
      if (request.counterpartEmployeeId) {
        await this.prisma.shiftAssignment.create({
          data: {
            employeeId: request.counterpartEmployeeId,
            shiftId: request.requestedShiftId,
            effectiveFrom: request.requestedDate,
            effectiveTo: request.requestedDate,
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
