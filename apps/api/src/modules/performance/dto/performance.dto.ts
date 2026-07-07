import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsArray,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class KeyResultDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  target?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  current?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  weight?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional({ enum: ['NOT_STARTED', 'ON_TRACK', 'AT_RISK', 'DONE'] })
  @IsOptional()
  @IsString()
  status?: string;
}

export class ReviewQuestionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  id!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  label!: string;

  @ApiPropertyOptional({ enum: ['TEXT', 'RATING', 'CHOICE'] })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  competency?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  options?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  weight?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  required?: boolean;
}

export class CreateGoalDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  employeeId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: ['INDIVIDUAL', 'TEAM', 'COMPANY'] })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  weightage?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  targetDate?: string;

  @ApiPropertyOptional({ type: [KeyResultDto] })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => KeyResultDto)
  keyResults?: KeyResultDto[];
}

export class UpdateGoalDto {
  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  progress?: number;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'AT_RISK', 'COMPLETED', 'CANCELLED'] })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: [KeyResultDto] })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => KeyResultDto)
  keyResults?: KeyResultDto[];
}

export class CreateReviewCycleDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ enum: ['ANNUAL', 'HALF_YEARLY', 'QUARTERLY'] })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ enum: ['DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED'] })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiProperty()
  @IsDateString()
  startDate!: string;

  @ApiProperty()
  @IsDateString()
  endDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  selfReview?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  managerReview?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  peerReview?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  review360?: boolean;

  @ApiPropertyOptional({ type: [ReviewQuestionDto] })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ReviewQuestionDto)
  questions?: ReviewQuestionDto[];
}

export class UpdateReviewCycleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ enum: ['DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED'] })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ type: [ReviewQuestionDto] })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ReviewQuestionDto)
  questions?: ReviewQuestionDto[];
}

export class SubmitReviewDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  reviewCycleId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  revieweeId!: string;

  @ApiProperty({ enum: ['SELF', 'MANAGER', 'PEER', 'SKIP_LEVEL'] })
  @IsString()
  reviewerType!: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  overallRating?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comments?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  responses?: Record<string, unknown>;
}

export class GiveFeedbackDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  recipientId!: string;

  @ApiPropertyOptional({ enum: ['FEEDBACK', 'PRAISE'] })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  message!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

export class CreateCheckInDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  employeeId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  managerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  goalId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  checkInDate?: string;

  @ApiPropertyOptional({ enum: ['ON_TRACK', 'AT_RISK', 'BLOCKED', 'COMPLETE'] })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  progress?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  blockers?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nextSteps?: string;
}

export class CreateOneOnOneDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  employeeId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  managerId!: string;

  @ApiProperty()
  @IsDateString()
  scheduledAt!: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  agenda?: string[];
}

export class UpdateOneOnOneDto {
  @ApiPropertyOptional({ enum: ['SCHEDULED', 'COMPLETED', 'CANCELLED'] })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  actionItems?: string[];
}

export class CreateCompetencyFrameworkDto {
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
  @IsArray()
  competencies?: Array<Record<string, unknown>>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  ratingScale?: Array<Record<string, unknown>>;
}

export class CreateCalibrationDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  reviewCycleId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  revieweeId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  previousRating?: number;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  calibratedRating!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  performanceBand?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  potential?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  promotionRecommendation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  pipRecommendation?: boolean;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class CreatePromotionRecommendationDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  employeeId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reviewCycleId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currentRole?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  recommendedRole!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class CreatePipDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  employeeId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reviewCycleId?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  successCriteria?: Array<Record<string, unknown>>;

  @ApiProperty()
  @IsDateString()
  startDate!: string;

  @ApiProperty()
  @IsDateString()
  endDate!: string;
}

export class UpdatePipDto {
  @ApiPropertyOptional({ enum: ['ACTIVE', 'COMPLETED', 'EXTENDED', 'CLOSED'] })
  @IsOptional()
  @IsString()
  status?: string;
}
