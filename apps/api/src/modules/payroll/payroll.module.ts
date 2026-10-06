import { Module } from '@nestjs/common';
import { ShiftResolutionModule } from '../attendance/shift-resolution.module';
import { TaxModule } from '../tax/tax.module';
import { PayrollCalculatorService } from './payroll-calculator.service';
import { PayrollController } from './payroll.controller';
import { PayrollPolicyController } from './payroll-policy.controller';
import { PayrollPolicyService } from './payroll-policy.service';
import { PayrollService } from './payroll.service';
import { SalaryDenominatorService } from './salary-denominator.service';

@Module({
  // ShiftResolutionModule: the WORKING_DAYS salary basis counts an employee's scheduled days
  // through the same shift/weekly-off precedence attendance and leave already resolve with.
  imports: [TaxModule, ShiftResolutionModule],
  controllers: [PayrollController, PayrollPolicyController],
  providers: [PayrollService, PayrollCalculatorService, PayrollPolicyService, SalaryDenominatorService],
  exports: [PayrollCalculatorService, PayrollPolicyService, SalaryDenominatorService],
})
export class PayrollModule {}
