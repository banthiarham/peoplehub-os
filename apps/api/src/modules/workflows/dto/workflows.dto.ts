import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsInt,
  Min,
  ValidateNested,
} from 'class-validator';

export class WorkflowStepDto {
  @ApiProperty({ example: 'REPORTING_MANAGER' })
  @IsString()
  @IsNotEmpty()
  approverType!: string;

  @ApiPropertyOptional({ example: 'emp-123' })
  @IsOptional()
  @IsString()
  approverValue?: string;

  @ApiPropertyOptional({ example: 24, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  slaHours?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  autoApprove?: boolean;
}

export class CreateWorkflowDto {
  @ApiProperty({ example: 'Expense approval' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 'expenses' })
  @IsString()
  @IsNotEmpty()
  module!: string;

  @ApiProperty({ example: 'expense_claim.submitted' })
  @IsString()
  @IsNotEmpty()
  trigger!: string;

  @ApiPropertyOptional({ example: 'Two-step approval for travel claims' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: 'object', default: {} })
  @IsOptional()
  @IsObject()
  conditions?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'notify_requester' })
  @IsOptional()
  @IsString()
  finalAction?: string;

  @ApiPropertyOptional({ example: 'return_to_draft' })
  @IsOptional()
  @IsString()
  rejectionBehavior?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  notifications?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  autoApproveRules?: string[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ type: [WorkflowStepDto] })
  @ValidateNested({ each: true })
  @Type(() => WorkflowStepDto)
  steps!: WorkflowStepDto[];
}

export class UpdateWorkflowDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  module?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  trigger?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: 'object' })
  @IsOptional()
  @IsObject()
  conditions?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  finalAction?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rejectionBehavior?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  notifications?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  autoApproveRules?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ type: [WorkflowStepDto] })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => WorkflowStepDto)
  steps?: WorkflowStepDto[];
}

export class RaiseApprovalDto {
  @ApiProperty({ example: 'expenses' })
  @IsString()
  @IsNotEmpty()
  module!: string;

  @ApiProperty({ example: 'ExpenseClaim' })
  @IsString()
  @IsNotEmpty()
  objectType!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  objectId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  requestData?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  approverId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  workflowId?: string;
}

export class DecideDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;
}
