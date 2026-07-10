import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
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
import { AttendanceCaptureMode, AttendanceStatus, ShiftSwapStatus, ShiftType } from '@prisma/client';

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
}

export class QrPunchDto extends CheckInDto {
  @ApiProperty({ description: 'QR payload generated for the location, e.g. PHUB:<locationId>' })
  @IsString()
  @IsNotEmpty()
  qrCode!: string;
}

export class CheckOutDto {
  @ApiProperty({ description: 'Stable device identifier registered to this employee' })
  @IsString()
  @IsNotEmpty()
  deviceId!: string;
}

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

export class MonthQueryDto {
  @ApiPropertyOptional({ example: '2026-07', description: 'YYYY-MM (defaults to current month)' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/)
  month?: string;
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
}

export class BiometricPunchRowDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  employeeCode!: string;

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

  @ApiProperty()
  @IsDateString()
  date!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shiftId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shiftName?: string;
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
