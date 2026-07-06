import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthUser } from '../../common/types/auth-user';
import {
  ApplyLeaveDto,
  DecideLeaveDto,
  ListLeaveDto,
  LeaveMonthDto,
  UpsertLeavePolicyDto,
  UpsertLeaveTypeDto,
} from './dto/leave.dto';
import { LeaveService } from './leave.service';

@ApiTags('Leave')
@ApiBearerAuth()
@Controller('leave')
export class LeaveController {
  constructor(private readonly leave: LeaveService) {}

  @Get('types')
  types(@CurrentUser() user: AuthUser) {
    return this.leave.types(user.tenantId);
  }

  @Post('types')
  @Roles('Super Admin', 'HR Admin')
  createType(@CurrentUser() user: AuthUser, @Body() dto: UpsertLeaveTypeDto) {
    return this.leave.createType(user.tenantId, dto);
  }

  @Patch('types/:id')
  @Roles('Super Admin', 'HR Admin')
  updateType(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpsertLeaveTypeDto) {
    return this.leave.updateType(user.tenantId, id, dto);
  }

  @Get('policies')
  @Roles('Super Admin', 'HR Admin', 'Manager')
  policies(@CurrentUser() user: AuthUser) {
    return this.leave.policies(user.tenantId);
  }

  @Post('policies')
  @Roles('Super Admin', 'HR Admin')
  createPolicy(@CurrentUser() user: AuthUser, @Body() dto: UpsertLeavePolicyDto) {
    return this.leave.createPolicy(user.tenantId, dto);
  }

  @Patch('policies/:id')
  @Roles('Super Admin', 'HR Admin')
  updatePolicy(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpsertLeavePolicyDto) {
    return this.leave.updatePolicy(user.tenantId, id, dto);
  }

  @Get('balances/me')
  myBalances(@CurrentUser() user: AuthUser) {
    return this.leave.balances(user.tenantId, user.employeeId ?? '');
  }

  @Get('balances')
  @Roles('Super Admin', 'HR Admin', 'Manager')
  balances(@CurrentUser() user: AuthUser, @Query('employeeId') employeeId: string) {
    return this.leave.balances(user.tenantId, employeeId);
  }

  @Post('requests')
  @ApiOperation({ summary: 'Apply for leave' })
  apply(@CurrentUser() user: AuthUser, @Body() dto: ApplyLeaveDto) {
    return this.leave.apply(user, dto);
  }

  @Get('requests')
  list(@CurrentUser() user: AuthUser, @Query() q: ListLeaveDto) {
    return this.leave.list(user.tenantId, q);
  }

  @Get('requests/me')
  myRequests(@CurrentUser() user: AuthUser) {
    return this.leave.myRequests(user);
  }

  @Patch('requests/:id/approve')
  @Roles('Super Admin', 'HR Admin', 'Manager')
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DecideLeaveDto) {
    return this.leave.decide(user, id, 'APPROVED', dto);
  }

  @Patch('requests/:id/reject')
  @Roles('Super Admin', 'HR Admin', 'Manager')
  reject(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DecideLeaveDto) {
    return this.leave.decide(user, id, 'REJECTED', dto);
  }

  @Patch('requests/:id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.leave.cancel(user, id);
  }

  @Get('calendar')
  calendar(@CurrentUser() user: AuthUser, @Query() q: LeaveMonthDto) {
    return this.leave.calendar(user.tenantId, q.month);
  }

  @Get('stats')
  stats(@CurrentUser() user: AuthUser) {
    return this.leave.stats(user.tenantId);
  }
}
