import { Module } from '@nestjs/common';
import { LeaveModule } from '../leave/leave.module';
import { RecruitmentController } from './recruitment.controller';
import { RecruitmentService } from './recruitment.service';

@Module({
  imports: [LeaveModule],
  controllers: [RecruitmentController],
  providers: [RecruitmentService],
})
export class RecruitmentModule {}
