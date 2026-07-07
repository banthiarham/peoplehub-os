import { Module } from '@nestjs/common';
import { TaxModule } from '../tax/tax.module';
import { PayrollCalculatorService } from './payroll-calculator.service';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';

@Module({
  imports: [TaxModule],
  controllers: [PayrollController],
  providers: [PayrollService, PayrollCalculatorService],
  exports: [PayrollCalculatorService],
})
export class PayrollModule {}
