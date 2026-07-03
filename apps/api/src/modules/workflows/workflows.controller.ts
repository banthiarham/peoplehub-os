import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApprovalStatus } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { RaiseApprovalDto, DecideDto } from './dto/workflows.dto';
import { WorkflowsService } from './workflows.service';

@ApiTags('Workflows & Approvals')
@ApiBearerAuth()
@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly workflows: WorkflowsService) {}

  @Get()
  listWorkflows(@CurrentUser() user: AuthUser) {
    return this.workflows.listWorkflows(user.tenantId);
  }

  @Get('approvals')
  listApprovals(@CurrentUser() user: AuthUser, @Query('status') status?: ApprovalStatus) {
    return this.workflows.listApprovals(user.tenantId, user, status);
  }

  @Get('approvals/my-requests')
  myRequests(@CurrentUser() user: AuthUser) {
    return this.workflows.myRequests(user);
  }

  @Post('approvals')
  raise(@CurrentUser() user: AuthUser, @Body() dto: RaiseApprovalDto) {
    return this.workflows.raise(user, dto);
  }

  @Patch('approvals/:id/approve')
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DecideDto) {
    return this.workflows.decide(user, id, 'APPROVED', dto.comment);
  }

  @Patch('approvals/:id/reject')
  reject(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DecideDto) {
    return this.workflows.decide(user, id, 'REJECTED', dto.comment);
  }

  @Get('stats')
  stats(@CurrentUser() user: AuthUser) {
    return this.workflows.stats(user.tenantId);
  }
}
