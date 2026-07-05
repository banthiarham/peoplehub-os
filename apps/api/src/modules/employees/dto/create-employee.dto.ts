import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import {
  EmployeeStatus,
  EmploymentType,
  Gender,
  MaritalStatus,
  TaxRegime,
  WorkMode,
} from '@prisma/client';

export class CreateEmployeeDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  preferredName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  employeeCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  workEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  personalEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ enum: MaritalStatus })
  @IsOptional()
  @IsEnum(MaritalStatus)
  maritalStatus?: MaritalStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bloodGroup?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  joiningDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  confirmationDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  probationEndDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  exitDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  noticePeriodDays?: number;

  @ApiPropertyOptional({ enum: EmployeeStatus })
  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;

  @ApiPropertyOptional({ enum: EmploymentType })
  @IsOptional()
  @IsEnum(EmploymentType)
  employmentType?: EmploymentType;

  @ApiPropertyOptional({ enum: WorkMode })
  @IsOptional()
  @IsEnum(WorkMode)
  workMode?: WorkMode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  departmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  designationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  locationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  legalEntityId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  costCenterId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  businessUnitId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  managerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dottedManagerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pan?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  aadhaar?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  uan?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  esicNumber?: string;

  @ApiPropertyOptional({ enum: TaxRegime })
  @IsOptional()
  @IsEnum(TaxRegime)
  taxRegime?: TaxRegime;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  address?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  emergencyContact?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  bankDetails?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Also create a login user with this employee' })
  @IsOptional()
  @IsBoolean()
  createUser?: boolean;
}

export class UpdateEmployeeDto extends PartialType(CreateEmployeeDto) {}

export class CreateDocumentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  type!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  fileKey!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fileUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mimeType?: string;
}

export class CreateLifecycleEventDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  eventType!: string;

  @ApiProperty()
  @IsDateString()
  effectiveDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;
}

export class BulkImportEmployeesDto {
  @ApiProperty({ type: [CreateEmployeeDto] })
  @IsArray()
  employees!: CreateEmployeeDto[];
}

export class BulkUpdateEmployeesDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  employeeIds!: string[];

  @ApiProperty()
  @IsObject()
  updates!: UpdateEmployeeDto;
}

export class BulkDocumentDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  employeeIds!: string[];

  @ApiProperty()
  @IsString()
  type!: string;

  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsString()
  fileKey!: string;
}

export class BulkManagerChangeDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  employeeIds!: string[];

  @ApiProperty()
  @IsString()
  managerId!: string;
}

export class BulkSalaryAssignmentDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  employeeIds!: string[];

  @ApiProperty()
  @IsString()
  salaryStructureId!: string;

  @ApiProperty()
  @IsNumber()
  ctc!: number;

  @ApiProperty()
  @IsDateString()
  effectiveFrom!: string;
}
