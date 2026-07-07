import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { CreateApiKeyDto, CreateOAuthClientDto, CreateWebhookDto, UpdateOAuthClientDto, UpdateWebhookDto } from './dto/developer.dto';
import { DeveloperService } from './developer.service';

@ApiTags('Developer')
@ApiBearerAuth()
@Roles('Super Admin', 'HR Admin')
@Controller('developer')
export class DeveloperController {
  constructor(private readonly developer: DeveloperService) {}

  @Get('api-keys')
  listApiKeys(@CurrentUser() user: AuthUser) {
    return this.developer.listApiKeys(user.tenantId);
  }

  @Post('api-keys')
  @ApiOperation({ summary: 'Create API key — full key returned exactly once' })
  createApiKey(@CurrentUser() user: AuthUser, @Body() dto: CreateApiKeyDto) {
    return this.developer.createApiKey(user.tenantId, user.userId, dto.name, dto.scopes ?? ['read']);
  }

  @Delete('api-keys/:id')
  revokeApiKey(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.developer.revokeApiKey(user.tenantId, id);
  }

  @Get('api-keys/:id/logs')
  keyLogs(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query('page') page?: string) {
    return this.developer.keyLogs(user.tenantId, id, page ? Number(page) : 1);
  }

  @Get('request-logs')
  requestLogs(@CurrentUser() user: AuthUser, @Query('page') page?: string) {
    return this.developer.requestLogs(user.tenantId, page ? Number(page) : 1);
  }

  @Get('oauth-apps')
  oauthApps(@CurrentUser() user: AuthUser) {
    return this.developer.listOAuthClients(user.tenantId);
  }

  @Post('oauth-apps')
  createOAuthApp(@CurrentUser() user: AuthUser, @Body() dto: CreateOAuthClientDto) {
    return this.developer.createOAuthClient(user.tenantId, user.userId, dto);
  }

  @Patch('oauth-apps/:id')
  updateOAuthApp(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateOAuthClientDto) {
    return this.developer.updateOAuthClient(user.tenantId, id, dto);
  }

  @Delete('oauth-apps/:id')
  deleteOAuthApp(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.developer.revokeOAuthClient(user.tenantId, id);
  }

  @Get('webhooks')
  listWebhooks(@CurrentUser() user: AuthUser) {
    return this.developer.listWebhooks(user.tenantId);
  }

  @Post('webhooks')
  createWebhook(@CurrentUser() user: AuthUser, @Body() dto: CreateWebhookDto) {
    return this.developer.createWebhook(user.tenantId, user.userId, dto.url, dto.events);
  }

  @Patch('webhooks/:id')
  updateWebhook(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateWebhookDto) {
    return this.developer.updateWebhook(user.tenantId, id, dto);
  }

  @Get('webhooks/:id/deliveries')
  deliveries(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.developer.deliveries(user.tenantId, id);
  }

  @Post('webhooks/:id/test')
  testWebhook(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { payload?: Record<string, unknown> }) {
    return this.developer.sendWebhookTest(user.tenantId, id, body.payload);
  }

  @Get('integrations')
  integrations(@CurrentUser() user: AuthUser) {
    return this.developer.integrations(user.tenantId);
  }

  @Get('events')
  events() {
    return this.developer.webhookEvents();
  }

  @Get('sandbox')
  sandbox() {
    return this.developer.sandbox();
  }

  @Get('stats')
  stats(@CurrentUser() user: AuthUser) {
    return this.developer.stats(user.tenantId);
  }
}
