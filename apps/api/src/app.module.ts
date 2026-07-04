import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from './common/database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { LeaveModule } from './modules/leave/leave.module';
import { TimesheetsModule } from './modules/timesheets/timesheets.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { RecruitmentModule } from './modules/recruitment/recruitment.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { PerformanceModule } from './modules/performance/performance.module';
import { EngagementModule } from './modules/engagement/engagement.module';
import { HelpdeskModule } from './modules/helpdesk/helpdesk.module';
import { AssetsModule } from './modules/assets/assets.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { WorkflowsModule } from './modules/workflows/workflows.module';
import { DeveloperModule } from './modules/developer/developer.module';
import { AiModule } from './modules/ai/ai.module';
import { SearchModule } from './modules/search/search.module';
import { TaxModule } from './modules/tax/tax.module';
import { EmailModule } from './modules/email/email.module';
import { LocationsModule } from './modules/locations/locations.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    DatabaseModule,
    AuthModule,
    EmployeesModule,
    AttendanceModule,
    LeaveModule,
    TimesheetsModule,
    PayrollModule,
    AnalyticsModule,
    RecruitmentModule,
    OnboardingModule,
    PerformanceModule,
    EngagementModule,
    HelpdeskModule,
    AssetsModule,
    NotificationsModule,
    WorkflowsModule,
    DeveloperModule,
    AiModule,
    SearchModule,
    TaxModule,
    EmailModule,
    LocationsModule,
  ],
})
export class AppModule {}
