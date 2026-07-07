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
} from 'class-validator';
import { LeaveRequestStatus } from '@prisma/client';

export class ApplyLeaveDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  leaveTypeId!: string;

  @ApiProperty()
  @IsDateString()
  fromDate!: string;

  @ApiProperty()
  @IsDateString()
  toDate!: string;

  @ApiPropertyOptional({ description: 'Half day leave (single date only)' })
  @IsOptional()
  @IsBoolean()
  halfDay?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ description: 'Uploaded proof/medical document key if required by policy' })
  @IsOptional()
  @IsString()
  attachmentKey?: string;

  @ApiPropertyOptional({ description: 'Apply on behalf of (HR only)' })
  @IsOptional()
  @IsString()
  employeeId?: string;
}

export class UpsertLeaveTypeDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isPaid?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isCarryForward?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  maxCarryForwardDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isEncashable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requiresAttachment?: boolean;

  @ApiPropertyOptional({ default: 0.5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minDuration?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  maxDuration?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowNegativeBalance?: boolean;

  @ApiPropertyOptional({ enum: ['MALE', 'FEMALE'] })
  @IsOptional()
  @IsString()
  genderRestriction?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpsertLeavePolicyDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  leaveTypeId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  locationId?: string;

  @ApiPropertyOptional({ enum: ['MONTHLY', 'YEARLY', 'UPFRONT'] })
  @IsOptional()
  @IsString()
  accrualType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  accrualDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxAnnualDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  maxCarryForwardDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  encashmentAllowed?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  encashmentMaxDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  expiryDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minDuration?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxDuration?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requiresAttachment?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowNegativeBalance?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  genderRestriction?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  employmentTypes?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  probationAllowed?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  noticePeriodAllowed?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  sandwichRule?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ListLeaveDto {
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

  @ApiPropertyOptional({ enum: LeaveRequestStatus })
  @IsOptional()
  @IsEnum(LeaveRequestStatus)
  status?: LeaveRequestStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  leaveTypeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class DecideLeaveDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;
}

export class LeaveMonthDto {
  @ApiPropertyOptional({ example: '2026-07' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/)
  month?: string;
}
