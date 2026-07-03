import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { CandidateStage } from '@prisma/client';

export class CreateJobDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title!: string;

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
  designationId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  openings?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  jobDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  requirements?: string;

  @ApiPropertyOptional({ enum: ['DRAFT', 'OPEN', 'ON_HOLD', 'CLOSED'] })
  @IsOptional()
  @IsString()
  status?: string;
}

export class UpdateJobDto extends PartialType(CreateJobDto) {}

export class CreateCandidateDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  jobRequisitionId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  currentCTC?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  expectedCTC?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateCandidateDto {
  @ApiPropertyOptional({ enum: CandidateStage })
  @IsOptional()
  @IsEnum(CandidateStage)
  currentStage?: CandidateStage;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  expectedCTC?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;
}

export class ListCandidatesDto {
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
  jobId?: string;

  @ApiPropertyOptional({ enum: CandidateStage })
  @IsOptional()
  @IsEnum(CandidateStage)
  stage?: CandidateStage;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}

export class ScheduleInterviewDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  candidateId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  stage!: string;

  @ApiProperty()
  @IsDateString()
  scheduledAt!: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  interviewers?: string[];

  @ApiPropertyOptional({ enum: ['VIDEO', 'IN_PERSON', 'PHONE'] })
  @IsOptional()
  @IsString()
  mode?: string;
}

export class UpdateInterviewDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  feedback?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional({ enum: ['PASS', 'FAIL', 'ON_HOLD'] })
  @IsOptional()
  @IsString()
  result?: string;
}

export class CreateOfferDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  candidateId!: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  ctc!: number;

  @ApiProperty()
  @IsDateString()
  joiningDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  designation?: string;
}

export class UpdateOfferDto {
  @ApiProperty({ enum: ['DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED'] })
  @IsString()
  status!: string;
}
