import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { DeviceBindingService } from './device-binding.service';
import { ShiftResolutionModule } from './shift-resolution.module';

@Module({
  imports: [ConfigModule, ShiftResolutionModule],
  controllers: [AttendanceController],
  providers: [AttendanceService, DeviceBindingService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
