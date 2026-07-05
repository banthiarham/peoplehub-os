import { Controller, Get, Post, Patch, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { EmailService } from './email.service';
import { SmtpConfigService } from './smtp-config.service';
import { EmailTemplateService } from './email-template.service';
import { SendToEmployeeDto } from './dto/send-to-employee.dto';
import { SmtpEncryption } from '@prisma/client';

// All routes resolve the tenant (and acting user) from the JWT — a caller can
// never read or send as another tenant by passing ids in the query/body.
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
  listSmtp(@CurrentUser() user: AuthUser) {
    return this.smtpConfigService.list(user.tenantId);
  }

  @Post('smtp-config')
  @ApiOperation({ summary: 'Create SMTP configuration' })
  createSmtp(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      name: string;
      host: string;
      port: number;
      encryption: SmtpEncryption;
      username: string;
      password: string;
      fromEmail: string;
      fromName: string;
      replyTo?: string;
      bounceEmail?: string;
      testRecipient?: string;
      dailySendingLimit?: number;
    },
  ) {
    return this.smtpConfigService.create(user.tenantId, user.userId, body);
  }

  @Patch('smtp-config/:id')
  @ApiOperation({ summary: 'Update SMTP configuration' })
  updateSmtp(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      host?: string;
      port?: number;
      encryption?: SmtpEncryption;
      username?: string;
      password?: string;
      fromEmail?: string;
      fromName?: string;
      replyTo?: string;
      dailySendingLimit?: number;
    },
  ) {
    return this.smtpConfigService.update(user.tenantId, id, body);
  }

  @Post('smtp-config/:id/test')
  @ApiOperation({ summary: 'Send test email to verify SMTP configuration' })
  testSmtp(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.smtpConfigService.sendTest(user.tenantId, id, user.userId);
  }

  @Post('smtp-config/:id/activate')
  @ApiOperation({ summary: 'Activate this SMTP configuration as the active provider' })
  activateSmtp(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.smtpConfigService.activate(user.tenantId, id);
  }

  @Post('smtp-config/:id/deactivate')
  @ApiOperation({ summary: 'Deactivate SMTP configuration' })
  deactivateSmtp(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.smtpConfigService.deactivate(user.tenantId, id);
  }

  // ── Email Templates ────────────────────────────────────────────────────────

  @Get('templates')
  @ApiOperation({ summary: 'List email templates' })
  listTemplates(@CurrentUser() user: AuthUser, @Query('module') module?: string) {
    return this.templateService.list(user.tenantId, module);
  }

  @Get('templates/:id')
  @ApiOperation({ summary: 'Get email template with version history' })
  getTemplate(@Param('id') id: string) {
    return this.templateService.findById(id);
  }

  @Post('templates')
  @ApiOperation({ summary: 'Create email template' })
  createTemplate(
    @CurrentUser() user: AuthUser,
    @Body() body: Omit<Parameters<EmailTemplateService['create']>[1], 'createdById'>,
  ) {
    return this.templateService.create(user.tenantId, { ...body, createdById: user.userId });
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
  previewTemplate(@Param('id') id: string, @Body() body: { vars: Record<string, string> }) {
    return this.templateService.findById(id).then((tpl) => ({
      subject: this.templateService.resolveVariables(tpl.subject, body.vars),
      bodyHtml: this.templateService.resolveVariables(tpl.bodyHtml, body.vars),
    }));
  }

  @Post('templates/:id/clone')
  @ApiOperation({ summary: 'Clone a template for tenant customization' })
  cloneTemplate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.templateService.clone(id, user.tenantId, user.userId);
  }

  // ── Email Sending ──────────────────────────────────────────────────────────

  @Post('send')
  @ApiOperation({ summary: 'Queue a raw email' })
  send(
    @CurrentUser() user: AuthUser,
    @Body() body: Omit<Parameters<EmailService['queue']>[0], 'tenantId'>,
  ) {
    return this.emailService.queue({ ...body, tenantId: user.tenantId });
  }

  @Post('employee/:employeeId')
  @ApiOperation({ summary: "Send a one-off email to an employee's work address (tenant-scoped)" })
  sendToEmployee(
    @CurrentUser() user: AuthUser,
    @Param('employeeId') employeeId: string,
    @Body() dto: SendToEmployeeDto,
  ) {
    return this.emailService.sendToEmployee(user.tenantId, employeeId, dto);
  }

  @Get('employee/:employeeId/history')
  @ApiOperation({ summary: 'Emails sent to this employee (delivery log)' })
  employeeHistory(@CurrentUser() user: AuthUser, @Param('employeeId') employeeId: string) {
    return this.emailService.employeeEmailHistory(user.tenantId, employeeId);
  }

  @Post('send-template')
  @ApiOperation({ summary: 'Queue a template-based transactional email' })
  sendTemplate(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      templateKey: string;
      to: string | string[];
      vars: Record<string, string>;
      module?: string;
      relatedType?: string;
      relatedId?: string;
      idempotencyKey?: string;
    },
  ) {
    return this.emailService.sendTransactional(user.tenantId, body.templateKey, body.to, body.vars, {
      module: body.module,
      relatedType: body.relatedType,
      relatedId: body.relatedId,
      idempotencyKey: body.idempotencyKey,
    });
  }

  @Post('send-bulk')
  @ApiOperation({ summary: 'Queue bulk emails (one queue entry per recipient)' })
  async sendBulk(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      recipients: string[];
      templateKey: string;
      vars: Record<string, string>;
      module?: string;
    },
  ) {
    const ids = await Promise.all(
      body.recipients.map((to) =>
        this.emailService.sendTransactional(user.tenantId, body.templateKey, to, body.vars, {
          module: body.module,
        }),
      ),
    );
    return { queued: ids.length, ids };
  }

  @Post('queue/:id/retry')
  @ApiOperation({ summary: 'Manually retry a failed email' })
  retryQueue(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.emailService.retry(user.tenantId, id).then(() => ({ retried: true }));
  }

  @Post('queue/:id/cancel')
  @ApiOperation({ summary: 'Cancel a queued email' })
  cancelQueue(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.emailService.cancel(user.tenantId, id).then(() => ({ cancelled: true }));
  }

  // ── Email Logs ─────────────────────────────────────────────────────────────

  @Get('logs')
  @ApiOperation({ summary: 'List email delivery logs with filters' })
  getLogs(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: string,
    @Query('module') module?: string,
    @Query('templateKey') templateKey?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.emailService.getLogs(user.tenantId, {
      status,
      module,
      templateKey,
      search,
      page: page ? +page : 1,
      limit: limit ? +limit : 20,
    });
  }

  @Get('logs/:id')
  @ApiOperation({ summary: 'Get single delivery log with error details' })
  getLog(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.emailService['prisma'].emailDeliveryLog.findFirst({
      where: { id, tenantId: user.tenantId },
    });
  }

  @Post('logs/:id/retry')
  @ApiOperation({ summary: 'Retry from delivery log entry' })
  async retryLog(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const log = await this.emailService['prisma'].emailDeliveryLog.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (log) await this.emailService.retry(user.tenantId, log.queueId);
    return { retried: !!log };
  }

  // ── Email Preferences ──────────────────────────────────────────────────────

  @Get('preferences')
  @ApiOperation({ summary: 'Get own email preferences' })
  getPreferences(@CurrentUser() user: AuthUser) {
    return this.emailService.getPreferences(user.tenantId, user.employeeId ?? '');
  }

  @Patch('preferences')
  @ApiOperation({ summary: 'Update own email preferences' })
  updatePreferences(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      announcements?: boolean;
      recognition?: boolean;
      surveys?: boolean;
      reminders?: boolean;
      digestEmails?: boolean;
      digestFrequency?: string;
    },
  ) {
    return this.emailService.updatePreferences(user.tenantId, user.employeeId ?? '', body);
  }
}
