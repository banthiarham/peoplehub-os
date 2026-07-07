import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class OnboardingTemplateTaskDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: ['HR', 'MANAGER', 'IT', 'ADMIN', 'FINANCE', 'EMPLOYEE'] })
  @IsOptional()
  @IsString()
  assignedTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isMandatory?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requiresUpload?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  dueInDays?: number;
}

export class CreateOnboardingTemplateDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  departmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  locationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  employmentType?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roleScope?: string[];

  @ApiProperty({ type: [OnboardingTemplateTaskDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OnboardingTemplateTaskDto)
  tasks!: OnboardingTemplateTaskDto[];

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  documentChecklist?: Record<string, unknown>[];

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  joiningForms?: Record<string, unknown>[];

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  policyChecklist?: Record<string, unknown>[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  welcomeEmail?: Record<string, unknown>;
}

export class StartOnboardingDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  employeeId!: string;

  @ApiPropertyOptional({ description: 'If omitted, the best active template is selected by employee org scope' })
  @IsOptional()
  @IsString()
  templateId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  buddyEmployeeId?: string;
}

export class UpdateOnboardingTaskDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  completed?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isWaived?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assignedTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  documentKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  formResponse?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  acknowledged?: boolean;
}

export class CreateExitRequestDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  employeeId!: string;

  @ApiProperty()
  @IsDateString()
  resignationDate!: string;

  @ApiProperty()
  @IsDateString()
  lastWorkingDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class UpdateExitRequestDto {
  @ApiPropertyOptional({ enum: ['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED'] })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  lastWorkingDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ enum: ['PENDING', 'APPROVED', 'REJECTED'] })
  @IsOptional()
  @IsString()
  managerApprovalStatus?: string;

  @ApiPropertyOptional({ enum: ['PENDING', 'APPROVED', 'REJECTED'] })
  @IsOptional()
  @IsString()
  hrApprovalStatus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assetRecoveryStatus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  knowledgeTransferStatus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  exitInterviewStatus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  finalSettlementStatus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  experienceLetterKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  relievingLetterKey?: string;
}

export class UpdateExitTaskDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  completed?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isWaived?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assignedTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  documentKey?: string;
}
