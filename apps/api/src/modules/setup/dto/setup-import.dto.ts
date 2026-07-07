import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';

export class SetupEmployeeImportRowDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  employeeCode?: string;

  @ApiProperty()
  @IsString()
  firstName!: string;

  @ApiProperty()
  @IsString()
  lastName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  workEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  joiningDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  designation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  legalEntity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  managerEmployeeCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  employmentType?: string;

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankAccountNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankIfsc?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  salaryStructure?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  ctc?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  createUser?: boolean;
}

export class SetupEmployeeImportDto {
  @ApiProperty({ type: [SetupEmployeeImportRowDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SetupEmployeeImportRowDto)
  rows!: SetupEmployeeImportRowDto[];
}

export class SetupSalaryImportRowDto {
  @ApiProperty()
  @IsString()
  employeeCode!: string;

  @ApiProperty()
  @IsString()
  salaryStructure!: string;

  @ApiProperty()
  @IsNumber()
  ctc!: number;

  @ApiProperty()
  @IsDateString()
  effectiveFrom!: string;
}

export class SetupSalaryImportDto {
  @ApiProperty({ type: [SetupSalaryImportRowDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SetupSalaryImportRowDto)
  rows!: SetupSalaryImportRowDto[];
}
