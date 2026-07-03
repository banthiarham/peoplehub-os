import { Module } from '@nestjs/common';
import { PayrollCalculatorService } from './payroll-calculator.service';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';

@Module({
  controllers: [PayrollController],
  providers: [PayrollService, PayrollCalculatorService],
  exports: [PayrollCalculatorService],
})
export class PayrollModule {}
