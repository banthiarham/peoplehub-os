import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
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
} from 'class-validator';
import { AttendanceStatus, ShiftType } from '@prisma/client';

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

  @ApiPropertyOptional({ type: [Number], default: [0, 6] })
  @IsOptional()
  @IsArray()
  weeklyOffDays?: number[];
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
