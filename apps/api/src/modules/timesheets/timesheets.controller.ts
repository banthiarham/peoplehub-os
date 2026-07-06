import { Body, Controller, Get, Header, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { CreateProjectDto, ListTimesheetsDto, UpsertTimesheetDto } from './dto/timesheets.dto';
import { TimesheetsService } from './timesheets.service';

@ApiTags('Timesheets')
@ApiBearerAuth()
@Controller('timesheets')
export class TimesheetsController {
  constructor(private readonly timesheets: TimesheetsService) {}

  @Get('projects')
  listProjects(@CurrentUser() user: AuthUser) {
    return this.timesheets.listProjects(user.tenantId);
  }

  @Post('projects')
  @Roles('Super Admin', 'HR Admin', 'Manager')
  createProject(@CurrentUser() user: AuthUser, @Body() dto: CreateProjectDto) {
    return this.timesheets.createProject(user.tenantId, dto);
  }

  @Patch('projects/:id')
  @Roles('Super Admin', 'HR Admin', 'Manager')
  updateProject(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreateProjectDto) {
    return this.timesheets.updateProject(user.tenantId, id, dto);
  }

  @Get('me')
  mine(@CurrentUser() user: AuthUser) {
    return this.timesheets.mine(user);
  }

  @Get('summary')
  summary(@CurrentUser() user: AuthUser) {
    return this.timesheets.summary(user.tenantId);
  }

  @Get('utilization')
  utilization(@CurrentUser() user: AuthUser) {
    return this.timesheets.utilization(user.tenantId);
  }

  @Get('billing/export')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="timesheet-billing.csv"')
  billingCsv(@CurrentUser() user: AuthUser) {
    return this.timesheets.billingCsv(user.tenantId);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: ListTimesheetsDto) {
    return this.timesheets.list(user.tenantId, q);
  }

  @Post()
  upsert(@CurrentUser() user: AuthUser, @Body() dto: UpsertTimesheetDto) {
    return this.timesheets.upsert(user, dto);
  }

  @Post(':id/submit')
  submit(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.timesheets.submit(user, id);
  }

  @Patch(':id/approve')
  @Roles('Super Admin', 'HR Admin', 'Manager')
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.timesheets.decide(user.tenantId, id, 'APPROVED');
  }

  @Patch(':id/reject')
  @Roles('Super Admin', 'HR Admin', 'Manager')
  reject(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.timesheets.decide(user.tenantId, id, 'REJECTED');
  }
}
