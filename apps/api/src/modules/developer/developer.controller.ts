import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Scopes } from '../../common/decorators/scopes.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { CreateApiKeyDto, CreateOAuthClientDto, CreateWebhookDto, UpdateOAuthClientDto, UpdateWebhookDto } from './dto/developer.dto';
import { DeveloperService } from './developer.service';

/**
 * May reach the developer console at all. HR Admin is no longer here: the catalog gives
 * HR Admin no `developer` grant, and the roles that own this surface are Developer and
 * Integration Admin.
 */
const DEVELOPER_ROLES = ['Super Admin', 'Tenant Owner', 'Developer', 'Integration Admin'];

/**
 * May manage API keys and OAuth clients. Integration Admin is deliberately excluded -
 * its catalog grant is MANAGE_INTEGRATIONS only, never MANAGE_API_KEYS.
 */
const API_KEY_ROLES = ['Super Admin', 'Tenant Owner', 'Developer'];

@ApiTags('Developer')
@ApiBearerAuth()
@Roles(...DEVELOPER_ROLES)
@Scopes('developer:read')
@Controller('developer')
export class DeveloperController {
  constructor(private readonly developer: DeveloperService) {}

  @Get('api-keys')
  @Roles(...API_KEY_ROLES)
  @Scopes('developer:api_keys')
  listApiKeys(@CurrentUser() user: AuthUser) {
    return this.developer.listApiKeys(user.tenantId);
  }

  @Post('api-keys')
  @Roles(...API_KEY_ROLES)
  @Scopes('developer:api_keys')
  @ApiOperation({ summary: 'Create API key — full key returned exactly once' })
  createApiKey(@CurrentUser() user: AuthUser, @Body() dto: CreateApiKeyDto) {
    return this.developer.createApiKey(user.tenantId, user.userId, dto.name, dto.scopes ?? ['read']);
  }

  @Delete('api-keys/:id')
  @Roles(...API_KEY_ROLES)
  @Scopes('developer:api_keys')
  revokeApiKey(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.developer.revokeApiKey(user.tenantId, id);
  }

  @Get('api-keys/:id/logs')
  @Roles(...API_KEY_ROLES)
  @Scopes('developer:api_keys')
  keyLogs(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query('page') page?: string) {
    return this.developer.keyLogs(user.tenantId, id, page ? Number(page) : 1);
  }

  @Get('request-logs')
  @Roles(...DEVELOPER_ROLES)
  @Scopes('developer:integrations')
  requestLogs(@CurrentUser() user: AuthUser, @Query('page') page?: string) {
    return this.developer.requestLogs(user.tenantId, page ? Number(page) : 1);
  }

  @Get('oauth-apps')
  @Roles(...API_KEY_ROLES)
  @Scopes('developer:api_keys')
  oauthApps(@CurrentUser() user: AuthUser) {
    return this.developer.listOAuthClients(user.tenantId);
  }

  @Post('oauth-apps')
  @Roles(...API_KEY_ROLES)
  @Scopes('developer:api_keys')
  createOAuthApp(@CurrentUser() user: AuthUser, @Body() dto: CreateOAuthClientDto) {
    return this.developer.createOAuthClient(user.tenantId, user.userId, dto);
  }

  @Patch('oauth-apps/:id')
  @Roles(...API_KEY_ROLES)
  @Scopes('developer:api_keys')
  updateOAuthApp(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateOAuthClientDto) {
    return this.developer.updateOAuthClient(user.tenantId, id, dto);
  }

  @Delete('oauth-apps/:id')
  @Roles(...API_KEY_ROLES)
  @Scopes('developer:api_keys')
  deleteOAuthApp(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.developer.revokeOAuthClient(user.tenantId, id);
  }

  @Get('webhooks')
  @Roles(...DEVELOPER_ROLES)
  @Scopes('developer:integrations')
  listWebhooks(@CurrentUser() user: AuthUser) {
    return this.developer.listWebhooks(user.tenantId);
  }

  @Post('webhooks')
  @Roles(...DEVELOPER_ROLES)
  @Scopes('developer:integrations')
  createWebhook(@CurrentUser() user: AuthUser, @Body() dto: CreateWebhookDto) {
    return this.developer.createWebhook(user.tenantId, user.userId, dto.url, dto.events);
  }

  @Patch('webhooks/:id')
  @Roles(...DEVELOPER_ROLES)
  @Scopes('developer:integrations')
  updateWebhook(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateWebhookDto) {
    return this.developer.updateWebhook(user.tenantId, id, dto);
  }

  @Get('webhooks/:id/deliveries')
  @Roles(...DEVELOPER_ROLES)
  @Scopes('developer:integrations')
  deliveries(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.developer.deliveries(user.tenantId, id);
  }

  @Post('webhooks/:id/test')
  @Roles(...DEVELOPER_ROLES)
  @Scopes('developer:integrations')
  testWebhook(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { payload?: Record<string, unknown> }) {
    return this.developer.sendWebhookTest(user.tenantId, id, body.payload);
  }

  @Get('integrations')
  @Roles(...DEVELOPER_ROLES)
  @Scopes('developer:integrations')
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
