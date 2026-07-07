import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ExpenseReimbursementMethod, ExpenseStatus, PayrollRunType } from '@prisma/client';

export class PageDto {
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
  search?: string;
}

export class AssignSalaryDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  employeeId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  salaryStructureId!: string;

  @ApiProperty({ description: 'Annual CTC in INR' })
  @IsNumber()
  @Min(0)
  ctc!: number;

  @ApiProperty()
  @IsDateString()
  effectiveFrom!: string;
}

export class SalaryComponentConfigDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty({ enum: ['EARNING', 'DEDUCTION', 'EMPLOYER_CONTRIBUTION'] })
  @IsString()
  @IsNotEmpty()
  type!: string;

  @ApiProperty({ enum: ['FIXED', 'PERCENTAGE_OF_BASIC', 'PERCENTAGE_OF_GROSS'], default: 'FIXED' })
  @IsString()
  calculationType!: string;

  @ApiProperty()
  @IsNumber()
  value!: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isTaxable?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isStatutory?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  statutoryType?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sequence?: number;
}

export class UpsertSalaryStructureDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ type: [SalaryComponentConfigDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalaryComponentConfigDto)
  components?: SalaryComponentConfigDto[];
}

export class PreviewSalaryStructureDto {
  @ApiProperty({ description: 'Annual CTC in INR' })
  @IsNumber()
  @Min(1)
  ctc!: number;
}

export class CreateRunDto {
  @ApiProperty({ minimum: 1, maximum: 12 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  year!: number;

  @ApiPropertyOptional({ enum: PayrollRunType, default: PayrollRunType.MONTHLY })
  @IsOptional()
  @IsEnum(PayrollRunType)
  runType?: PayrollRunType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  legalEntityId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  locationId?: string;

  @ApiPropertyOptional({ example: 'India Monthly' })
  @IsOptional()
  @IsString()
  payGroup?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateExpenseDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  category!: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  amount!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'File object key for uploaded receipt' })
  @IsOptional()
  @IsString()
  receiptKey?: string;

  @ApiPropertyOptional({ enum: ExpenseReimbursementMethod, default: ExpenseReimbursementMethod.PAYROLL })
  @IsOptional()
  @IsEnum(ExpenseReimbursementMethod)
  reimbursementMethod?: ExpenseReimbursementMethod;
}

export class ListExpensesDto extends PageDto {
  @ApiPropertyOptional({ enum: ExpenseStatus })
  @IsOptional()
  @IsEnum(ExpenseStatus)
  status?: ExpenseStatus;
}

export class CreateLoanDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  employeeId!: string;

  @ApiProperty({ enum: ['LOAN', 'ADVANCE'] })
  @IsString()
  type!: string;

  @ApiProperty()
  @IsNumber()
  @Min(1)
  amount!: number;

  @ApiProperty()
  @IsNumber()
  @Min(1)
  emiAmount!: number;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  totalInstallments!: number;
}

export class CreatePayrollInputDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  employeeId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  payrollRunId?: string;

  @ApiProperty({ minimum: 1, maximum: 12 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  year!: number;

  @ApiProperty({ enum: ['BONUS', 'ARREAR', 'INCENTIVE', 'OVERTIME', 'REIMBURSEMENT', 'DEDUCTION', 'LEAVE_ENCASHMENT', 'FULL_AND_FINAL'] })
  @IsString()
  @IsNotEmpty()
  type!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  label!: string;

  @ApiProperty()
  @IsNumber()
  amount!: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  taxable?: boolean;

  @ApiPropertyOptional({ default: 'APPROVED' })
  @IsOptional()
  @IsString()
  status?: string;
}

export class OverrideWarningsDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class ExpenseDecisionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class WaiveLoanDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
