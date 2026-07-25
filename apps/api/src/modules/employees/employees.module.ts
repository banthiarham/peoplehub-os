import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { EmailModule } from '../email/email.module';
import { LeaveModule } from '../leave/leave.module';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';

@Module({
  imports: [RbacModule, EmailModule, LeaveModule],
  controllers: [EmployeesController],
  providers: [EmployeesService],
  exports: [EmployeesService],
})
export class EmployeesModule {}
