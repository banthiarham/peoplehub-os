import { Module } from '@nestjs/common';
import { LeaveBalanceInitializationService } from './leave-balance-initialization.service';
import { LeaveController } from './leave.controller';
import { LeaveService } from './leave.service';

@Module({
  controllers: [LeaveController],
  providers: [LeaveService, LeaveBalanceInitializationService],
  exports: [LeaveBalanceInitializationService],
})
export class LeaveModule {}
