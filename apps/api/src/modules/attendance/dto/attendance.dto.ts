import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  ArrayUnique,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  AttendanceCaptureMode,
  AttendanceStatus,
  CompOffStatus,
  ShiftSwapStatus,
  ShiftType,
} from '@prisma/client';
import { SUPPORTED_ATTENDANCE_DATE_FORMATS } from '../../../common/utils/attendance-date';

export class CheckInDto {
  @ApiProperty({ description: 'Stable device identifier registered to this employee' })
  @IsString()
  @IsNotEmpty()
  deviceId!: string;

  @ApiPropertyOptional({ description: 'Human-readable device name, e.g. "Chrome on Android"' })
  @IsOptional()
  @IsString()
  deviceName?: string;

  @ApiPropertyOptional({ description: 'Device platform, e.g. "Android"' })
  @IsOptional()
  @IsString()
  platform?: string;

  @ApiPropertyOptional({ description: 'Device latitude at punch time' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  geoLat?: number;

  @ApiPropertyOptional({ description: 'Device longitude at punch time' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  geoLng?: number;

  @ApiPropertyOptional({ description: 'GPS accuracy radius in meters' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  geoAccuracy?: number;

  @ApiPropertyOptional({
    description: 'Epoch ms timestamp of the GPS fix (stale fixes are rejected)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  fixAt?: number;

  @ApiPropertyOptional({
    description:
      'Which authorized location this punch is at. Omit to use the location the employee is scheduled at, or the one their GPS fix falls inside.',
  })
  @IsOptional()
  @IsString()
  locationId?: string;

  @ApiPropertyOptional({
    description:
      'Browser-reported reason no GPS fix was available, sent instead of geoLat/geoLng so a geofence rejection is traceable server-side',
    enum: ['denied', 'unavailable'],
  })
  @IsOptional()
  @IsIn(['denied', 'unavailable'])
  geoErrorReason?: 'denied' | 'unavailable';
}

export class QrPunchDto extends CheckInDto {
  @ApiProperty({ description: 'QR payload generated for the location, e.g. PHUB:<locationId>' })
  @IsString()
  @IsNotEmpty()
  qrCode!: string;
}

/**
 * Extends the check-in payload so a punch-out records where it happened.
 * Every added field is optional, and check-out deliberately keeps its existing
 * validation: no capture-mode assertion and no geofence, exactly as before.
 */
export class CheckOutDto extends CheckInDto {}

export class ListAttendanceDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ enum: AttendanceStatus })
  @IsOptional()
  @IsEnum(AttendanceStatus)
  status?: AttendanceStatus;
}

/**
 * Filters for the punch history report.
 *
 * Paginated by day rather than by punch: the report groups a day's punches
 * together, and an event-level page boundary would cut a day in half.
 */
export class ListPunchEventsDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 25, description: 'Days per page, not punches per page' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number = 25;

  @ApiPropertyOptional({
    enum: ['MULTI', 'ALL'],
    default: 'MULTI',
    description:
      'MULTI (default) returns only days worth reviewing here — more than one check-in/check-out pair, or punches at more than one location. A plain one-in/one-out day is already shown by the attendance record view. ALL returns every day with punches.',
  })
  @IsOptional()
  @IsIn(['MULTI', 'ALL'])
  scope?: 'MULTI' | 'ALL' = 'MULTI';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional({ description: 'Only punches recorded at this location' })
  @IsOptional()
  @IsString()
  locationId?: string;

  @ApiPropertyOptional({ example: '2026-07-01', description: 'Attendance day, inclusive' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-07-31', description: 'Attendance day, inclusive' })
  @IsOptional()
  @IsString()
  to?: string;
}

export class MonthQueryDto {
  @ApiPropertyOptional({ example: '2026-07', description: 'YYYY-MM (defaults to current month)' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/)
  month?: string;
}

export class DateQueryDto {
  @ApiPropertyOptional({ example: '2026-07-14', description: 'YYYY-MM-DD (defaults to today)' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;
}

export class RegularizeDto {
  @ApiPropertyOptional({ description: 'Defaults to own employee id' })
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiProperty()
  @IsDateString()
  date!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  punchIn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  punchOut?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class CreateShiftDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ enum: ShiftType })
  @IsOptional()
  @IsEnum(ShiftType)
  type?: ShiftType;

  @ApiProperty({ example: '09:00' })
  @Matches(/^\d{2}:\d{2}$/)
  startTime!: string;

  @ApiProperty({ example: '18:00' })
  @Matches(/^\d{2}:\d{2}$/)
  endTime!: string;

  @ApiPropertyOptional({ default: 15 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  gracePeriodMins?: number;

  @ApiPropertyOptional({ default: 15 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  earlyLeavingGraceMins?: number;

  @ApiPropertyOptional({ default: 60 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  breakDurationMins?: number;

  @ApiPropertyOptional({ default: 480 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  minWorkingMinutes?: number;

  @ApiPropertyOptional({ default: 240 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  halfDayAfterMinutes?: number;

  @ApiPropertyOptional({ default: 480 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  overtimeAfterMinutes?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  shiftAllowanceAmount?: number;

  @ApiPropertyOptional({ type: [Number], default: [0, 6] })
  @IsOptional()
  @IsArray()
  weeklyOffDays?: number[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  remoteAllowed?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  weekendWorkAllowed?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  holidayWorkAllowed?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  compOffEligible?: boolean;
}

export class UpdateShiftWeeklyOffsDto {
  @ApiProperty({
    type: [Number],
    example: [0, 6],
    description: 'Weekdays where 0=Sunday and 6=Saturday',
  })
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  weeklyOffDays!: number[];
}

export class AssignShiftDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  employeeIds!: string[];

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  shiftId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @ApiPropertyOptional({
    description: 'Location this assignment applies at, for employees who work different shifts at different locations. Omit to use the employee\'s own location.',
  })
  @IsOptional()
  @IsString()
  locationId?: string;
}

export class BiometricPunchRowDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  employeeCode!: string;

  /**
   * Validated per row by the service rather than by `@IsDateString()` so one
   * malformed cell returns an actionable row error instead of rejecting the
   * whole upload.
   */
  @ApiProperty({ example: '2026-07-01', description: SUPPORTED_ATTENDANCE_DATE_FORMATS })
  @IsString()
  @IsNotEmpty()
  date!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  punchIn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  punchOut?: string;

  @ApiPropertyOptional({ enum: AttendanceStatus })
  @IsOptional()
  @IsEnum(AttendanceStatus)
  status?: AttendanceStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deviceId?: string;
}

export class ImportBiometricPunchesDto {
  @ApiProperty({ type: [BiometricPunchRowDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BiometricPunchRowDto)
  rows!: BiometricPunchRowDto[];
}

export class ImportAttendanceRowsDto extends ImportBiometricPunchesDto {
  @ApiPropertyOptional({ enum: ['MANUAL', 'API'] })
  @IsOptional()
  @IsString()
  source?: 'MANUAL' | 'API';
}

export class UpdateAttendanceRecordDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  punchIn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  punchOut?: string;

  @ApiPropertyOptional({
    description:
      "Corrects the location the day's derived punches are recorded at. Omit to keep whatever the day's punches already say.",
  })
  @IsOptional()
  @IsString()
  locationId?: string;

  @ApiPropertyOptional({ enum: AttendanceStatus })
  @IsOptional()
  @IsEnum(AttendanceStatus)
  status?: AttendanceStatus;
}

export class UpsertAttendanceRuleDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shiftId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  locationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @ApiPropertyOptional({ default: 15 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  gracePeriodMins?: number;

  @ApiPropertyOptional({ default: 15 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  lateMarkAfterMins?: number;

  @ApiPropertyOptional({ default: 15 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  earlyLeavingGraceMins?: number;

  @ApiPropertyOptional({ default: 240 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  halfDayAfterMinutes?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  absentAfterMinutes?: number;

  @ApiPropertyOptional({ default: 60 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  breakDurationMins?: number;

  @ApiPropertyOptional({ default: 480 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  minWorkingMinutes?: number;

  @ApiPropertyOptional({ default: 480 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  overtimeAfterMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  remoteAttendanceAllowed?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  shiftToleranceMins?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  weekendWorkAllowed?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  holidayWorkAllowed?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  compOffEligible?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ListCaptureSettingsDto {
  @ApiPropertyOptional({ description: 'Optional location override scope' })
  @IsOptional()
  @IsString()
  locationId?: string;
}

export class UpsertCaptureSettingDto {
  @ApiProperty({ enum: AttendanceCaptureMode })
  @IsEnum(AttendanceCaptureMode)
  mode!: AttendanceCaptureMode;

  @ApiPropertyOptional({ description: 'Optional location override scope. Omit for tenant default.' })
  @IsOptional()
  @IsString()
  locationId?: string;

  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requiresGps?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requiresGeofence?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class RosterRowDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  employeeCode!: string;

  /** Validated per row by the service so failures are reported row by row. */
  @ApiProperty({ example: '2026-07-01', description: SUPPORTED_ATTENDANCE_DATE_FORMATS })
  @IsString()
  @IsNotEmpty()
  date!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shiftId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shiftName?: string;

  @ApiPropertyOptional({
    description:
      "Work location for this rostered day only. Omit to keep the employee's own location.",
  })
  @IsOptional()
  @IsString()
  locationId?: string;
}

export class ImportRosterDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ type: [RosterRowDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RosterRowDto)
  rows!: RosterRowDto[];

  @ApiPropertyOptional({
    default: false,
    description:
      'Replace an existing assignment that starts on the same day for the same employee. Without it, conflicting rows fail with a row-level error instead of creating an ambiguous second assignment.',
  })
  @IsOptional()
  @IsBoolean()
  replaceExisting?: boolean;
}

export class ListShiftAssignmentsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional({ description: 'Matches employee name or code' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: '2026-07-01' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-07-31' })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({ default: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

export class EffectiveShiftQueryDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  employeeId!: string;

  @ApiProperty({ example: '2026-07-01', description: SUPPORTED_ATTENDANCE_DATE_FORMATS })
  @IsString()
  @IsNotEmpty()
  date!: string;
}

export class UpdateShiftAssignmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shiftId?: string;

  @ApiPropertyOptional({ description: "Empty string clears the override back to the employee's location" })
  @IsOptional()
  @IsString()
  locationId?: string;

  @ApiPropertyOptional({ example: '2026-07-01' })
  @IsOptional()
  @IsString()
  effectiveFrom?: string;

  @ApiPropertyOptional({ example: '2026-07-31', description: 'Inclusive last day. Empty string reopens the assignment.' })
  @IsOptional()
  @IsString()
  effectiveTo?: string;
}

export class FinalizeAttendanceDto {
  @ApiProperty({ example: '2026-07' })
  @Matches(/^\d{4}-\d{2}$/)
  month!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  locationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateShiftSwapDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  requestedShiftId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  targetShiftId!: string;

  @ApiProperty()
  @IsDateString()
  requestedDate!: string;

  @ApiProperty()
  @IsDateString()
  targetDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  counterpartEmployeeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class DecideShiftSwapDto {
  @ApiProperty({ enum: [ShiftSwapStatus.APPROVED, ShiftSwapStatus.REJECTED, ShiftSwapStatus.CANCELLED] })
  @IsEnum(ShiftSwapStatus)
  status!: ShiftSwapStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateCompOffDto {
  @ApiProperty({ description: 'Employee the comp-off is credited to' })
  @IsString()
  @IsNotEmpty()
  employeeId!: string;

  @ApiProperty({ description: 'The weekly-off or holiday that was worked' })
  @IsDateString()
  earnedDate!: string;

  @ApiPropertyOptional({ description: 'Credited days; half-day comp-offs are 0.5', default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(2)
  days?: number;

  @ApiPropertyOptional({ description: 'Expiry date; defaults to 90 days after the earned date' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class DecideCompOffDto {
  @ApiProperty({ enum: [CompOffStatus.USED, CompOffStatus.CANCELLED, CompOffStatus.EXPIRED] })
  @IsEnum(CompOffStatus)
  status!: CompOffStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpsertHolidayDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty()
  @IsDateString()
  date!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isOptional?: boolean;
}
