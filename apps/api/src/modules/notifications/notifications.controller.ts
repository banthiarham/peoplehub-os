import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Scopes } from '../../common/decorators/scopes.decorator';
import { AuthUser } from '../../common/types/auth-user';
import {
  CreateNotificationTemplateDto,
  PreviewNotificationTemplateDto,
  SendNotificationDto,
  UpdateNotificationTemplateDto,
} from './dto/notifications.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @Scopes('notifications:read')
  list(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: string,
    @Query('unread') unread?: string,
  ) {
    return this.notifications.list(user.userId, page ? Number(page) : 1, 20, unread === 'true');
  }

  @Get('unread-count')
  @Scopes('notifications:read')
  unreadCount(@CurrentUser() user: AuthUser) {
    return this.notifications.unreadCount(user.userId);
  }

  @Patch(':id/read')
  @Scopes('notifications:write')
  markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.notifications.markRead(user.userId, id);
  }

  @Post('read-all')
  @Scopes('notifications:write')
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user.userId);
  }

  @Get('templates')
  @Scopes('notifications:read')
  listTemplates(@CurrentUser() user: AuthUser, @Query('channel') channel?: string) {
    return this.notifications.listTemplates(user.tenantId, channel);
  }

  @Get('templates/:id')
  @Scopes('notifications:read')
  getTemplate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.notifications.getTemplate(user.tenantId, id);
  }

  @Post('templates')
  @Scopes('notifications:write')
  createTemplate(@CurrentUser() user: AuthUser, @Body() dto: CreateNotificationTemplateDto) {
    return this.notifications.createTemplate(user.tenantId, user.userId, dto);
  }

  @Patch('templates/:id')
  @Scopes('notifications:write')
  updateTemplate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateNotificationTemplateDto,
  ) {
    return this.notifications.updateTemplate(user.tenantId, user.userId, id, dto);
  }

  @Post('templates/:id/preview')
  @Scopes('notifications:read')
  previewTemplate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: PreviewNotificationTemplateDto,
  ) {
    return this.notifications.previewTemplate(user.tenantId, id, dto);
  }

  @Post()
  @Scopes('notifications:write')
  send(@CurrentUser() user: AuthUser, @Body() dto: SendNotificationDto) {
    return this.notifications.send(user, dto);
  }
}
