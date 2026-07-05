import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { CommentDto, CreateTicketDto, ListTicketsDto, UpdateTicketDto } from './dto/helpdesk.dto';
import { HelpdeskService } from './helpdesk.service';

@ApiTags('Helpdesk')
@ApiBearerAuth()
@Controller('helpdesk')
export class HelpdeskController {
  constructor(private readonly helpdesk: HelpdeskService) {}

  @Get('tickets')
  list(@CurrentUser() user: AuthUser, @Query() q: ListTicketsDto) {
    return this.helpdesk.list(user.tenantId, user, q);
  }

  @Get('tickets/me')
  myTickets(@CurrentUser() user: AuthUser) {
    return this.helpdesk.myTickets(user);
  }

  @Get('tickets/:id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.helpdesk.get(user.tenantId, id);
  }

  @Post('tickets')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTicketDto) {
    return this.helpdesk.create(user, dto);
  }

  @Patch('tickets/:id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateTicketDto) {
    return this.helpdesk.update(user.tenantId, id, dto);
  }

  @Post('tickets/:id/comments')
  comment(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CommentDto) {
    return this.helpdesk.comment(user, id, dto.message);
  }

  @Get('stats')
  stats(@CurrentUser() user: AuthUser) {
    return this.helpdesk.stats(user.tenantId);
  }
}
