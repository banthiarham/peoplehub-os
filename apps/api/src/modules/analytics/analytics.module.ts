import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  // AttendanceModule: the attendance register and summary are built from
  // `AttendanceService.rangeLedger`, the same derivation the attendance screen
  // and month finalization use, so the three cannot disagree about what an
  // unrecorded day was.
  imports: [AttendanceModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
