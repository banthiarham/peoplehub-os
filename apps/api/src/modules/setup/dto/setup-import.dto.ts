import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsEmail, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, MaxLength, ValidateNested } from 'class-validator';

export class SetupEmployeeImportRowDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/, { message: 'employeeCode contains invalid characters' })
  employeeCode?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsEmail()
  @MaxLength(254)
  workEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^\+?[1-9]\d{7,14}$/, { message: 'phone must be a valid international phone number' })
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  joiningDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  department?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  designation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  location?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  legalEntity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/, { message: 'managerEmployeeCode contains invalid characters' })
  managerEmployeeCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  employmentType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{5}[0-9]{4}[A-Z]$/, { message: 'pan must be a valid PAN' })
  pan?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^\d{12}$/, { message: 'aadhaar must contain 12 digits' })
  aadhaar?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^\d{12}$/, { message: 'uan must contain 12 digits' })
  uan?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^\d{17}$/, { message: 'esicNumber must contain 17 digits' })
  esicNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^\d{6,34}$/, { message: 'bankAccountNumber must contain 6 to 34 digits' })
  bankAccountNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{4}0[A-Z0-9]{6}$/, { message: 'bankIfsc must be a valid IFSC' })
  bankIfsc?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
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
