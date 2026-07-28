import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { EmailModule } from '../email/email.module';
import { LeaveModule } from '../leave/leave.module';
import { EmployeeSummaryService } from './employee-summary.service';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';

@Module({
  imports: [RbacModule, AttendanceModule, EmailModule, LeaveModule],
  controllers: [EmployeesController],
  providers: [EmployeesService, EmployeeSummaryService],
  exports: [EmployeesService],
})
export class EmployeesModule {}
