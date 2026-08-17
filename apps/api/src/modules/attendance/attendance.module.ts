import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { AttendanceQrService } from './attendance-qr.service';
import { DeviceBindingService } from './device-binding.service';
import { QrDisplayController } from './qr-display.controller';
import { ShiftResolutionModule } from './shift-resolution.module';

@Module({
  imports: [ConfigModule, ShiftResolutionModule],
  controllers: [AttendanceController, QrDisplayController],
  providers: [AttendanceService, AttendanceQrService, DeviceBindingService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
