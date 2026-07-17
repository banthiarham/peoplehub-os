import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../common/database/database.module';
import { EmailModule } from '../email/email.module';
import { LeaveModule } from '../leave/leave.module';
import { SetupController } from './setup.controller';
import { SetupService } from './setup.service';

@Module({
  imports: [DatabaseModule, EmailModule, LeaveModule],
  controllers: [SetupController],
  providers: [SetupService],
})
export class SetupModule {}
