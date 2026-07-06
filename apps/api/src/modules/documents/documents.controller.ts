import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Scopes } from '../../common/decorators/scopes.decorator';
import { AuthUser } from '../../common/types/auth-user';
import {
  AcknowledgePolicyDto,
  CreateDocumentTemplateDto,
  UpsertCustomFormDto,
  UpdateDocumentTemplateDto,
} from './dto/documents.dto';
import { DocumentsService } from './documents.service';

@ApiTags('Documents')
@ApiBearerAuth()
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get('templates')
  @Scopes('documents:read')
  listTemplates(@CurrentUser() user: AuthUser, @Query('module') module?: string) {
    return this.documents.listTemplates(user.tenantId, module);
  }

  @Get('templates/:id')
  @Scopes('documents:read')
  getTemplate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.documents.getTemplate(user.tenantId, id);
  }

  @Post('templates')
  @Scopes('documents:write')
  createTemplate(@CurrentUser() user: AuthUser, @Body() dto: CreateDocumentTemplateDto) {
    return this.documents.createTemplate(user.tenantId, user.userId, dto);
  }

  @Patch('templates/:id')
  @Scopes('documents:write')
  updateTemplate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateDocumentTemplateDto,
  ) {
    return this.documents.updateTemplate(user.tenantId, user.userId, id, dto);
  }

  @Post('templates/:id/clone')
  @Scopes('documents:write')
  cloneTemplate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.documents.cloneTemplate(user.tenantId, user.userId, id);
  }

  @Post('templates/:id/generate')
  @Scopes('documents:write')
  generate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { employeeId: string; vars?: Record<string, unknown>; fileName?: string; title?: string },
  ) {
    return this.documents.generateDocument(user, id, body);
  }

  @Post('templates/:id/acknowledge')
  @Scopes('documents:write')
  acknowledge(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: AcknowledgePolicyDto & { employeeId?: string },
  ) {
    return this.documents.acknowledgePolicy(user, id, body);
  }

  @Get('generated')
  @Scopes('documents:read')
  listGenerated(
    @CurrentUser() user: AuthUser,
    @Query('employeeId') employeeId?: string,
    @Query('templateId') templateId?: string,
  ) {
    return this.documents.listGenerated(user.tenantId, { employeeId, templateId });
  }

  @Get('forms')
  @Scopes('documents:read')
  listForms(@CurrentUser() user: AuthUser) {
    return this.documents.listForms(user.tenantId);
  }

  @Get('forms/:id')
  @Scopes('documents:read')
  getForm(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.documents.getForm(user.tenantId, id);
  }

  @Post('forms')
  @Scopes('documents:write')
  createForm(@CurrentUser() user: AuthUser, @Body() dto: UpsertCustomFormDto) {
    return this.documents.upsertForm(user.tenantId, user.userId, dto);
  }

  @Patch('forms/:id')
  @Scopes('documents:write')
  updateForm(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpsertCustomFormDto) {
    return this.documents.upsertForm(user.tenantId, user.userId, dto, id);
  }

  @Delete('forms/:id')
  @Scopes('documents:write')
  deleteForm(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.documents.deleteForm(user.tenantId, user.userId, id);
  }
}
