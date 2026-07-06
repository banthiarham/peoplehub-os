import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Scopes } from '../../common/decorators/scopes.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthUser } from '../../common/types/auth-user';
import {
  AiAnswerDto,
  CommentDto,
  CreateTicketDto,
  EscalateTicketDto,
  HelpdeskSlaRuleDto,
  KnowledgeBaseArticleDto,
  ListTicketsDto,
  UpdateTicketDto,
} from './dto/helpdesk.dto';
import { HelpdeskService } from './helpdesk.service';

@ApiTags('Helpdesk')
@ApiBearerAuth()
@Controller('helpdesk')
export class HelpdeskController {
  constructor(private readonly helpdesk: HelpdeskService) {}

  @Get('tickets')
  @Scopes('helpdesk:read')
  list(@CurrentUser() user: AuthUser, @Query() q: ListTicketsDto) {
    return this.helpdesk.list(user.tenantId, user, q);
  }

  @Get('tickets/me')
  @Scopes('helpdesk:read')
  myTickets(@CurrentUser() user: AuthUser) {
    return this.helpdesk.myTickets(user);
  }

  @Get('stats')
  @Scopes('helpdesk:read')
  stats(@CurrentUser() user: AuthUser) {
    return this.helpdesk.stats(user.tenantId);
  }

  @Get('sla-rules')
  @Roles('Super Admin', 'HR Admin', 'Payroll Admin', 'Integration Admin')
  @Scopes('helpdesk:read')
  slaRules(@CurrentUser() user: AuthUser) {
    return this.helpdesk.listSlaRules(user.tenantId);
  }

  @Post('sla-rules')
  @Roles('Super Admin', 'HR Admin', 'Payroll Admin', 'Integration Admin')
  @Scopes('helpdesk:write')
  createSlaRule(@CurrentUser() user: AuthUser, @Body() dto: HelpdeskSlaRuleDto) {
    return this.helpdesk.createSlaRule(user.tenantId, dto);
  }

  @Patch('sla-rules/:id')
  @Roles('Super Admin', 'HR Admin', 'Payroll Admin', 'Integration Admin')
  @Scopes('helpdesk:write')
  updateSlaRule(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: HelpdeskSlaRuleDto) {
    return this.helpdesk.updateSlaRule(user.tenantId, id, dto);
  }

  @Get('knowledge-base')
  @Scopes('helpdesk:read')
  listKnowledgeBase(@CurrentUser() user: AuthUser, @Query('category') category?: string, @Query('search') search?: string) {
    return this.helpdesk.listKnowledgeBase(user.tenantId, { category, search });
  }

  @Post('knowledge-base')
  @Roles('Super Admin', 'HR Admin')
  @Scopes('helpdesk:write')
  createKnowledgeBase(@CurrentUser() user: AuthUser, @Body() dto: KnowledgeBaseArticleDto) {
    return this.helpdesk.createKnowledgeBaseArticle(user.tenantId, dto);
  }

  @Patch('knowledge-base/:id')
  @Roles('Super Admin', 'HR Admin')
  @Scopes('helpdesk:write')
  updateKnowledgeBase(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: KnowledgeBaseArticleDto) {
    return this.helpdesk.updateKnowledgeBaseArticle(user.tenantId, id, dto);
  }

  @Post('ai-answer')
  @Scopes('helpdesk:read')
  aiAnswer(@CurrentUser() user: AuthUser, @Body() dto: AiAnswerDto) {
    return this.helpdesk.aiAnswer(user.tenantId, dto.question, dto.category);
  }

  @Get('knowledge-base/stats')
  @Scopes('helpdesk:read')
  kbStats(@CurrentUser() user: AuthUser) {
    return this.helpdesk.kbStats(user.tenantId);
  }

  @Get('tickets/:id')
  @Scopes('helpdesk:read')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.helpdesk.get(user.tenantId, id);
  }

  @Post('tickets')
  @Scopes('helpdesk:write')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTicketDto) {
    return this.helpdesk.create(user, dto);
  }

  @Patch('tickets/:id')
  @Scopes('helpdesk:write')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateTicketDto) {
    return this.helpdesk.update(user.tenantId, id, dto);
  }

  @Post('tickets/:id/comments')
  @Scopes('helpdesk:write')
  comment(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CommentDto) {
    return this.helpdesk.comment(user, id, dto.message, dto.isInternal);
  }

  @Post('tickets/:id/escalate')
  @Roles('Super Admin', 'HR Admin', 'Payroll Admin')
  @Scopes('helpdesk:approve')
  escalate(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: EscalateTicketDto) {
    return this.helpdesk.escalate(user, id, dto.assignedTo, dto.reason);
  }
}
