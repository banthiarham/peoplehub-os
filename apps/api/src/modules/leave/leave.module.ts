import { Module } from '@nestjs/common';
import { ShiftResolutionModule } from '../attendance/shift-resolution.module';
import { LeaveBalanceInitializationService } from './leave-balance-initialization.service';
import { LeaveController } from './leave.controller';
import { LeaveService } from './leave.service';

@Module({
  imports: [ShiftResolutionModule],
  controllers: [LeaveController],
  providers: [LeaveService, LeaveBalanceInitializationService],
  exports: [LeaveBalanceInitializationService, LeaveService],
})
export class LeaveModule {}
