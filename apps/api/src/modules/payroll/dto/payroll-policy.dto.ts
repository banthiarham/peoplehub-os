import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min, ValidateIf } from 'class-validator';
import { CompOffUnusedTreatment, CompOffUsagePeriod, SalaryBasis } from '@prisma/client';

export class UpsertPayrollPolicyDto {
  @ApiPropertyOptional({
    description: 'Location this policy applies to. Omit to set the tenant-wide default policy.',
  })
  @IsOptional()
  @IsString()
  locationId?: string;

  @ApiPropertyOptional({ enum: SalaryBasis, default: SalaryBasis.CALENDAR_DAYS })
  @IsOptional()
  @IsEnum(SalaryBasis)
  salaryBasis?: SalaryBasis;

  @ApiPropertyOptional({
    description:
      'Fixed number of payable days per month. Required only when salaryBasis is FIXED_DAYS, and rejected otherwise.',
    minimum: 1,
    maximum: 31,
  })
  @ValidateIf((dto: UpsertPayrollPolicyDto) => dto.salaryBasis === SalaryBasis.FIXED_DAYS)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(31)
  fixedDays?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  overtimePaymentEnabled?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  compOffEnabled?: boolean;

  @ApiPropertyOptional({ enum: CompOffUnusedTreatment, default: CompOffUnusedTreatment.UNPAID })
  @IsOptional()
  @IsEnum(CompOffUnusedTreatment)
  compOffUnusedTreatment?: CompOffUnusedTreatment;

  @ApiPropertyOptional({ enum: CompOffUsagePeriod, default: CompOffUsagePeriod.MONTHLY })
  @IsOptional()
  @IsEnum(CompOffUsagePeriod)
  compOffUsagePeriod?: CompOffUsagePeriod;

  @ApiPropertyOptional({
    description: 'Whether unused Comp-Off may cross the configured usage period boundary.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  compOffCarryForwardEnabled?: boolean;
}
