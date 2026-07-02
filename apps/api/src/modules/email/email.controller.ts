import { Controller, Get, Post, Patch, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { EmailService } from './email.service';
import { SmtpConfigService } from './smtp-config.service';
import { EmailTemplateService } from './email-template.service';
import { SmtpEncryption } from '@prisma/client';

@ApiTags('Email')
@ApiBearerAuth()
@Controller('email')
export class EmailController {
  constructor(
    private readonly emailService: EmailService,
    private readonly smtpConfigService: SmtpConfigService,
    private readonly templateService: EmailTemplateService,
  ) {}

  // ── SMTP Config ────────────────────────────────────────────────────────────

  @Get('smtp-config')
  @ApiOperation({ summary: 'List SMTP configurations' })
  listSmtp(@Query('tenantId') tenantId: string) {
    return this.smtpConfigService.list(tenantId);
  }

  @Post('smtp-config')
  @ApiOperation({ summary: 'Create SMTP configuration' })
  createSmtp(
    @Query('tenantId') tenantId: string,
    @Body() body: { name: string; host: string; port: number; encryption: SmtpEncryption; username: string; password: string; fromEmail: string; fromName: string; replyTo?: string; bounceEmail?: string; testRecipient?: string; dailySendingLimit?: number; createdById: string },
  ) {
    return this.smtpConfigService.create(tenantId, body.createdById, body);
  }

  @Patch('smtp-config/:id')
  @ApiOperation({ summary: 'Update SMTP configuration' })
  updateSmtp(
    @Param('id') id: string,
    @Query('tenantId') tenantId: string,
    @Body() body: { name?: string; host?: string; port?: number; encryption?: SmtpEncryption; username?: string; password?: string; fromEmail?: string; fromName?: string; replyTo?: string; dailySendingLimit?: number },
  ) {
    return this.smtpConfigService.update(tenantId, id, body);
  }

  @Post('smtp-config/:id/test')
  @ApiOperation({ summary: 'Send test email to verify SMTP configuration' })
  testSmtp(
    @Param('id') id: string,
    @Query('tenantId') tenantId: string,
    @Body() body: { testedById: string },
  ) {
    return this.smtpConfigService.sendTest(tenantId, id, body.testedById);
  }

  @Post('smtp-config/:id/activate')
  @ApiOperation({ summary: 'Activate this SMTP configuration as the active provider' })
  activateSmtp(@Param('id') id: string, @Query('tenantId') tenantId: string) {
    return this.smtpConfigService.activate(tenantId, id);
  }

  @Post('smtp-config/:id/deactivate')
  @ApiOperation({ summary: 'Deactivate SMTP configuration' })
  deactivateSmtp(@Param('id') id: string, @Query('tenantId') tenantId: string) {
    return this.smtpConfigService.deactivate(tenantId, id);
  }

  // ── Email Templates ────────────────────────────────────────────────────────

  @Get('templates')
  @ApiOperation({ summary: 'List email templates' })
  listTemplates(@Query('tenantId') tenantId: string, @Query('module') module?: string) {
    return this.templateService.list(tenantId, module);
  }

  @Get('templates/:id')
  @ApiOperation({ summary: 'Get email template with version history' })
  getTemplate(@Param('id') id: string) {
    return this.templateService.findById(id);
  }

  @Post('templates')
  @ApiOperation({ summary: 'Create email template' })
  createTemplate(
    @Query('tenantId') tenantId: string,
    @Body() body: Parameters<EmailTemplateService['create']>[1],
  ) {
    return this.templateService.create(tenantId, body);
  }

  @Patch('templates/:id')
  @ApiOperation({ summary: 'Update email template (archives previous version)' })
  updateTemplate(
    @Param('id') id: string,
    @Body() body: Parameters<EmailTemplateService['update']>[1],
  ) {
    return this.templateService.update(id, body);
  }

  @Post('templates/:id/preview')
  @ApiOperation({ summary: 'Preview rendered template with sample variables' })
  previewTemplate(
    @Param('id') id: string,
    @Query('tenantId') tenantId: string,
    @Body() body: { vars: Record<string, string> },
  ) {
    return this.templateService.findById(id).then((tpl) => ({
      subject: this.templateService.resolveVariables(tpl.subject, body.vars),
      bodyHtml: this.templateService.resolveVariables(tpl.bodyHtml, body.vars),
    }));
  }

  @Post('templates/:id/clone')
  @ApiOperation({ summary: 'Clone a template for tenant customization' })
  cloneTemplate(
    @Param('id') id: string,
    @Query('tenantId') tenantId: string,
    @Body() body: { createdById: string },
  ) {
    return this.templateService.clone(id, tenantId, body.createdById);
  }

  // ── Email Sending ──────────────────────────────────────────────────────────

  @Post('send')
  @ApiOperation({ summary: 'Queue a raw email' })
  send(@Body() body: Parameters<EmailService['queue']>[0]) {
    return this.emailService.queue(body);
  }

  @Post('send-template')
  @ApiOperation({ summary: 'Queue a template-based transactional email' })
  sendTemplate(@Body() body: { tenantId: string; templateKey: string; to: string | string[]; vars: Record<string, string>; module?: string; relatedType?: string; relatedId?: string; idempotencyKey?: string }) {
    return this.emailService.sendTransactional(body.tenantId, body.templateKey, body.to, body.vars, { module: body.module, relatedType: body.relatedType, relatedId: body.relatedId, idempotencyKey: body.idempotencyKey });
  }

  @Post('send-bulk')
  @ApiOperation({ summary: 'Queue bulk emails (one queue entry per recipient)' })
  async sendBulk(@Body() body: { tenantId: string; recipients: string[]; templateKey: string; vars: Record<string, string>; module?: string }) {
    const ids = await Promise.all(
      body.recipients.map((to) =>
        this.emailService.sendTransactional(body.tenantId, body.templateKey, to, body.vars, { module: body.module }),
      ),
    );
    return { queued: ids.length, ids };
  }

  @Post('queue/:id/retry')
  @ApiOperation({ summary: 'Manually retry a failed email' })
  retryQueue(@Param('id') id: string, @Query('tenantId') tenantId: string) {
    return this.emailService.retry(tenantId, id).then(() => ({ retried: true }));
  }

  @Post('queue/:id/cancel')
  @ApiOperation({ summary: 'Cancel a queued email' })
  cancelQueue(@Param('id') id: string, @Query('tenantId') tenantId: string) {
    return this.emailService.cancel(tenantId, id).then(() => ({ cancelled: true }));
  }

  // ── Email Logs ─────────────────────────────────────────────────────────────

  @Get('logs')
  @ApiOperation({ summary: 'List email delivery logs with filters' })
  getLogs(
    @Query('tenantId') tenantId: string,
    @Query('status') status?: string,
    @Query('module') module?: string,
    @Query('templateKey') templateKey?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.emailService.getLogs(tenantId, { status, module, templateKey, search, page: page ? +page : 1, limit: limit ? +limit : 20 });
  }

  @Get('logs/:id')
  @ApiOperation({ summary: 'Get single delivery log with error details' })
  getLog(@Param('id') id: string) {
    return this.emailService['prisma'].emailDeliveryLog.findUnique({ where: { id } });
  }

  @Post('logs/:id/retry')
  @ApiOperation({ summary: 'Retry from delivery log entry' })
  async retryLog(@Param('id') id: string, @Query('tenantId') tenantId: string) {
    const log = await this.emailService['prisma'].emailDeliveryLog.findUnique({ where: { id } });
    if (log) await this.emailService.retry(tenantId, log.queueId);
    return { retried: !!log };
  }

  // ── Email Preferences ──────────────────────────────────────────────────────

  @Get('preferences')
  @ApiOperation({ summary: 'Get employee email preferences' })
  getPreferences(@Query('tenantId') tenantId: string, @Query('employeeId') employeeId: string) {
    return this.emailService.getPreferences(tenantId, employeeId);
  }

  @Patch('preferences')
  @ApiOperation({ summary: 'Update employee email preferences' })
  updatePreferences(
    @Query('tenantId') tenantId: string,
    @Query('employeeId') employeeId: string,
    @Body() body: { announcements?: boolean; recognition?: boolean; surveys?: boolean; reminders?: boolean; digestEmails?: boolean; digestFrequency?: string },
  ) {
    return this.emailService.updatePreferences(tenantId, employeeId, body);
  }
}
