import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PayrollModule } from '../payroll/payroll.module';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { AttendanceQrService } from './attendance-qr.service';
import { DeviceBindingService } from './device-binding.service';
import { QrDisplayController } from './qr-display.controller';
import { ShiftResolutionModule } from './shift-resolution.module';

@Module({
  // PayrollModule: automatic comp-off earning respects PayrollPolicy.compOffEnabled,
  // resolved through the same tenant/location policy that payroll processing uses.
  imports: [ConfigModule, ShiftResolutionModule, PayrollModule],
  controllers: [AttendanceController, QrDisplayController],
  providers: [AttendanceService, AttendanceQrService, DeviceBindingService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
