import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  Matches,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

@ValidatorConstraint({ name: 'notAfterCurrentMonth' })
export class NotAfterCurrentMonth implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    // YYYY-MM is lexicographically ordered, so a string compare is enough.
    return typeof value !== 'string' || value <= currentMonthKey();
  }

  defaultMessage(): string {
    return 'month cannot be in the future';
  }
}

export class EmployeeSummaryQueryDto {
  @ApiPropertyOptional({ example: '2026-07', description: 'YYYY-MM (defaults to the current month)' })
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'month must be in YYYY-MM format' })
  @Validate(NotAfterCurrentMonth)
  month?: string;
}
