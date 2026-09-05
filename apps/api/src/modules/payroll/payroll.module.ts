import { Module } from '@nestjs/common';
import { TaxModule } from '../tax/tax.module';
import { PayrollCalculatorService } from './payroll-calculator.service';
import { PayrollController } from './payroll.controller';
import { PayrollPolicyController } from './payroll-policy.controller';
import { PayrollPolicyService } from './payroll-policy.service';
import { PayrollService } from './payroll.service';

@Module({
  imports: [TaxModule],
  controllers: [PayrollController, PayrollPolicyController],
  providers: [PayrollService, PayrollCalculatorService, PayrollPolicyService],
  exports: [PayrollCalculatorService, PayrollPolicyService],
})
export class PayrollModule {}
