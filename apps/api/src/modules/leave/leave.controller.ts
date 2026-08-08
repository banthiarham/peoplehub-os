import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Scopes } from '../../common/decorators/scopes.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { SelfService } from '../../common/decorators/self-service.decorator';
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

  // Anyone who may apply must be able to see what they can apply for, so the type list is
  // readable through the leave scope OR through the caller's own employee link.
  @Get('types')
  @SelfService()
  @Scopes('leave:read')
  types(@CurrentUser() user: AuthUser) {
    return this.leave.types(user.tenantId);
  }

  // Leave setup (types and policies) is gated on `leave:configure`, not `leave:write`.
  // `RolesGuard` matches roles OR scopes, so leaving these on `leave:write` would hand
  // the leave configuration screens to every role that can apply for its own leave.
  @Post('types')
  @Roles('Super Admin', 'HR Admin')
  @Scopes('leave:configure')
  createType(@CurrentUser() user: AuthUser, @Body() dto: UpsertLeaveTypeDto) {
    return this.leave.createType(user.tenantId, dto);
  }

  @Patch('types/:id')
  @Roles('Super Admin', 'HR Admin')
  @Scopes('leave:configure')
  updateType(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpsertLeaveTypeDto) {
    return this.leave.updateType(user.tenantId, id, dto);
  }

  @Get('policies')
  @Roles('Super Admin', 'HR Admin', 'Manager')
  @Scopes('leave:read')
  policies(@CurrentUser() user: AuthUser) {
    return this.leave.policies(user.tenantId);
  }

  @Post('policies')
  @Roles('Super Admin', 'HR Admin')
  @Scopes('leave:configure')
  createPolicy(@CurrentUser() user: AuthUser, @Body() dto: UpsertLeavePolicyDto) {
    return this.leave.createPolicy(user.tenantId, dto);
  }

  @Patch('policies/:id')
  @Roles('Super Admin', 'HR Admin')
  @Scopes('leave:configure')
  updatePolicy(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpsertLeavePolicyDto) {
    return this.leave.updatePolicy(user.tenantId, id, dto);
  }

  @Get('balances/me')
  @SelfService()
  @Scopes('leave:read')
  myBalances(@CurrentUser() user: AuthUser) {
    return this.leave.myBalances(user);
  }

  @Get('balances')
  @Roles('Super Admin', 'HR Admin', 'Manager')
  @Scopes('leave:read')
  balances(@CurrentUser() user: AuthUser, @Query('employeeId') employeeId: string) {
    return this.leave.balances(user.tenantId, employeeId);
  }

  // Self-service only. The request is always raised for the caller's own employee record -
  // `LeaveService.apply` derives it from the token and refuses a mismatching body - so no
  // module scope is accepted here and there is no on-behalf-of path through this route.
  @Post('requests')
  @ApiOperation({ summary: 'Apply for your own leave' })
  @SelfService()
  apply(@CurrentUser() user: AuthUser, @Body() dto: ApplyLeaveDto) {
    return this.leave.apply(user, dto);
  }

  @Get('requests')
  @Scopes('leave:read')
  list(@CurrentUser() user: AuthUser, @Query() q: ListLeaveDto) {
    return this.leave.list(user.tenantId, q);
  }

  @Get('requests/me')
  @SelfService()
  @Scopes('leave:read')
  myRequests(@CurrentUser() user: AuthUser) {
    return this.leave.myRequests(user);
  }

  @Patch('requests/:id/approve')
  @Roles('Super Admin', 'HR Admin', 'Manager')
  @Scopes('leave:approve')
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DecideLeaveDto) {
    return this.leave.decide(user, id, 'APPROVED', dto);
  }

  @Patch('requests/:id/reject')
  @Roles('Super Admin', 'HR Admin', 'Manager')
  @Scopes('leave:approve')
  reject(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DecideLeaveDto) {
    return this.leave.decide(user, id, 'REJECTED', dto);
  }

  // Self-service only, and `LeaveService.cancel` already matches the request against the
  // caller's own employeeId, so a cancel can never reach someone else's request.
  @Patch('requests/:id/cancel')
  @SelfService()
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.leave.cancel(user, id);
  }

  @Get('calendar')
  @Scopes('leave:read')
  calendar(@CurrentUser() user: AuthUser, @Query() q: LeaveMonthDto) {
    return this.leave.calendar(user.tenantId, q.month);
  }

  @Get('stats')
  @Scopes('leave:read')
  stats(@CurrentUser() user: AuthUser) {
    return this.leave.stats(user.tenantId);
  }
}
