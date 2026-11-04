import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min, ValidateIf } from 'class-validator';
import { CompOffExpiryTreatment, CompOffUnusedTreatment, CompOffUsagePeriod, SalaryBasis } from '@prisma/client';

/**
 * Bounds for `compOffExpiryDays`: at least a day to be meaningful, at most three years, which
 * is already longer than any usage period the policy can express. Declared here rather than
 * in the service because the service imports this file - the validation decorators below read
 * them at class-definition time, and a cycle would leave them undefined.
 */
export const MIN_COMP_OFF_EXPIRY_DAYS = 1;
export const MAX_COMP_OFF_EXPIRY_DAYS = 1095;

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

  @ApiPropertyOptional({
    description:
      'How many days a newly credited Comp-Off stays valid, counted from the day it was ' +
      'earned. Omit to keep the 90-day default. Read only when a grant is created, so ' +
      'changing it never re-dates an existing grant.',
    minimum: MIN_COMP_OFF_EXPIRY_DAYS,
    maximum: MAX_COMP_OFF_EXPIRY_DAYS,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_COMP_OFF_EXPIRY_DAYS)
  @Max(MAX_COMP_OFF_EXPIRY_DAYS)
  compOffExpiryDays?: number;

  @ApiPropertyOptional({
    enum: CompOffExpiryTreatment,
    default: CompOffExpiryTreatment.NOT_ENFORCED,
    description:
      'What the expiry date does. NOT_ENFORCED keeps the legacy behaviour, where the date is ' +
      'advisory and a grant stays usable to the end of its usage period. FORFEIT makes it a ' +
      'deadline and pays nothing afterwards. PAY_OUT makes it a deadline but still settles ' +
      'the unused grant through payroll.',
  })
  @IsOptional()
  @IsEnum(CompOffExpiryTreatment)
  compOffExpiryTreatment?: CompOffExpiryTreatment;
}
