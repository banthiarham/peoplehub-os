import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApprovalStatus } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Scopes } from '../../common/decorators/scopes.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { CreateWorkflowDto, DecideDto, RaiseApprovalDto, UpdateWorkflowDto } from './dto/workflows.dto';
import { WorkflowsService } from './workflows.service';

@ApiTags('Workflows & Approvals')
@ApiBearerAuth()
@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly workflows: WorkflowsService) {}

  @Get()
  @Scopes('workflow:read')
  listWorkflows(@CurrentUser() user: AuthUser) {
    return this.workflows.listWorkflows(user.tenantId);
  }

  @Get('catalog')
  @Scopes('workflow:read')
  catalog() {
    return this.workflows.catalog();
  }

  @Get('detail/:id')
  @Scopes('workflow:read')
  getWorkflow(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.workflows.getWorkflow(user.tenantId, id);
  }

  @Post()
  @Roles('Super Admin', 'HR Admin', 'Payroll Admin')
  @Scopes('workflow:write')
  createWorkflow(@CurrentUser() user: AuthUser, @Body() dto: CreateWorkflowDto) {
    return this.workflows.createWorkflow(user.tenantId, user.userId, dto);
  }

  @Patch('detail/:id')
  @Roles('Super Admin', 'HR Admin', 'Payroll Admin')
  @Scopes('workflow:write')
  updateWorkflow(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateWorkflowDto) {
    return this.workflows.updateWorkflow(user.tenantId, id, user.userId, dto);
  }

  @Delete('detail/:id')
  @Roles('Super Admin', 'HR Admin', 'Payroll Admin')
  @Scopes('workflow:write')
  archiveWorkflow(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.workflows.archiveWorkflow(user.tenantId, id, user.userId);
  }

  @Get('approvals')
  @Scopes('workflow:read')
  listApprovals(@CurrentUser() user: AuthUser, @Query('status') status?: ApprovalStatus) {
    return this.workflows.listApprovals(user.tenantId, user, status);
  }

  @Get('approvals/:id')
  @Scopes('workflow:read')
  getApproval(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.workflows.getApproval(user.tenantId, id);
  }

  @Get('approvals/my-requests')
  @Scopes('workflow:read')
  myRequests(@CurrentUser() user: AuthUser) {
    return this.workflows.myRequests(user);
  }

  @Post('approvals')
  @Scopes('workflow:write')
  raise(@CurrentUser() user: AuthUser, @Body() dto: RaiseApprovalDto) {
    return this.workflows.raise(user, dto);
  }

  @Patch('approvals/:id/approve')
  @Scopes('workflow:approve')
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DecideDto) {
    return this.workflows.decide(user, id, 'APPROVED', dto.comment);
  }

  @Patch('approvals/:id/reject')
  @Scopes('workflow:approve')
  reject(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DecideDto) {
    return this.workflows.decide(user, id, 'REJECTED', dto.comment);
  }

  @Post('escalations/run')
  @Roles('Super Admin', 'HR Admin', 'Payroll Admin')
  @Scopes('workflow:approve')
  runEscalations(@CurrentUser() user: AuthUser) {
    return this.workflows.runEscalations(user.tenantId);
  }

  @Get('stats')
  @Scopes('workflow:read')
  stats(@CurrentUser() user: AuthUser) {
    return this.workflows.stats(user.tenantId);
  }
}
