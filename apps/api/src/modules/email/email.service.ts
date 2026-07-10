import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { ConfigService } from '@nestjs/config';
import { SmtpConfigService } from './smtp-config.service';
import { EmailTemplateService } from './email-template.service';
import { MockEmailProvider } from './providers/mock.provider';
import { ResendProvider } from './providers/resend.provider';
import { EmailStatus } from '@prisma/client';

export interface QueueEmailInput {
  tenantId: string;
  to: string | string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  bodyHtml?: string;
  bodyText?: string;
  templateKey?: string;
  templateVars?: Record<string, string>;
  module?: string;
  relatedType?: string;
  relatedId?: string;
  isMandatory?: boolean;
  priority?: number;
  idempotencyKey?: string;
  attachments?: {
    filename: string;
    contentType: string;
    fileObjectId?: string;
    isSecureLink?: boolean;
    secureUrl?: string;
    expiresAt?: Date;
  }[];
  createdById?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly isDemoMode: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly smtpConfigService: SmtpConfigService,
    private readonly templateService: EmailTemplateService,
  ) {
    this.isDemoMode = config.get<string>('NODE_ENV') !== 'production';
  }

  async queue(input: QueueEmailInput): Promise<string> {
    // Check suppression list
    const toArr = Array.isArray(input.to) ? input.to : [input.to];
    if (!input.isMandatory) {
      const suppressed = await this.prisma.emailSuppression.findFirst({
        where: { email: { in: toArr } },
      });
      if (suppressed) {
        this.logger.warn(`Email suppressed for ${toArr.join(', ')}`);
        return 'suppressed';
      }
    }

    // Check idempotency
    if (input.idempotencyKey) {
      const existing = await this.prisma.emailQueue.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) return existing.id;
    }

    const queued = await this.prisma.emailQueue.create({
      data: {
        tenantId: input.tenantId,
        idempotencyKey: input.idempotencyKey,
        to: toArr,
        cc: input.cc ?? [],
        bcc: input.bcc ?? [],
        subject: input.subject ?? '',
        bodyHtml: input.bodyHtml ?? '',
        bodyText: input.bodyText,
        templateKey: input.templateKey,
        templateVars: input.templateVars,
        module: input.module,
        relatedType: input.relatedType,
        relatedId: input.relatedId,
        isMandatory: input.isMandatory ?? false,
        priority: input.priority ?? 5,
        status: EmailStatus.QUEUED,
      },
    });

    if (input.attachments?.length) {
      await this.prisma.emailAttachment.createMany({
        data: input.attachments.map((a) => ({
          queueId: queued.id,
          filename: a.filename,
          contentType: a.contentType,
          fileObjectId: a.fileObjectId,
          isSecureLink: a.isSecureLink ?? false,
          secureUrl: a.secureUrl,
          expiresAt: a.expiresAt,
        })),
      });
    }

    // Process immediately (in production this would be a BullMQ job)
    setImmediate(() => this.processEmail(queued.id).catch((e) => this.logger.error(e)));

    return queued.id;
  }

  async processEmail(queueId: string): Promise<void> {
    const queued = await this.prisma.emailQueue.findUnique({
      where: { id: queueId },
      include: { attachments: true },
    });
    if (!queued || queued.status === 'CANCELLED' || queued.status === 'SENT') return;

    await this.prisma.emailQueue.update({
      where: { id: queueId },
      data: { status: EmailStatus.SENDING },
    });

    try {
      let subject = queued.subject;
      let bodyHtml = queued.bodyHtml;
      let bodyText = queued.bodyText ?? '';

      // Resolve template if key is set
      if (queued.templateKey) {
        const vars = (queued.templateVars ?? {}) as Record<string, string>;
        const rendered = await this.templateService.render(
          queued.tenantId,
          queued.templateKey,
          vars,
        );
        subject = rendered.subject || subject;
        bodyHtml = rendered.bodyHtml || bodyHtml;
        bodyText = rendered.bodyText || bodyText;
      }

      let result: { success: boolean; messageId?: string; error?: string };
      let providerType = 'SMTP';

      // Always prefer the tenant's active SMTP provider when one is
      // configured; the mock is only a fallback for dev environments with
      // no provider set up.
      const smtpConfig = await this.smtpConfigService.buildProvider(queued.tenantId);
      if (smtpConfig) {
        result = await smtpConfig.provider.sendEmail({
          to: queued.to,
          cc: queued.cc,
          bcc: queued.bcc,
          subject,
          bodyHtml,
          bodyText,
          fromEmail: smtpConfig.fromEmail,
          fromName: smtpConfig.fromName,
          replyTo: smtpConfig.replyTo,
        });
      } else if (this.resendApiKey) {
        providerType = 'RESEND';
        const resend = new ResendProvider({
          apiKey: this.resendApiKey,
          fromEmail: this.resendFromEmail,
          fromName: this.resendFromName,
          replyTo: this.config.get<string>('RESEND_REPLY_TO') || undefined,
        });
        result = await resend.sendEmail({
          to: queued.to,
          cc: queued.cc,
          bcc: queued.bcc,
          subject,
          bodyHtml,
          bodyText,
          fromEmail: this.resendFromEmail,
          fromName: this.resendFromName,
          replyTo: this.config.get<string>('RESEND_REPLY_TO') || undefined,
        });
      } else if (this.isDemoMode) {
        providerType = 'MOCK';
        const mock = new MockEmailProvider();
        result = await mock.sendEmail({
          to: queued.to,
          cc: queued.cc,
          bcc: queued.bcc,
          subject,
          bodyHtml,
          bodyText,
          fromEmail: 'noreply@viohr.local',
          fromName: 'VioHr',
        });
      } else {
        result = { success: false, error: 'No active email provider configured' };
      }

      const newStatus = result.success ? EmailStatus.SENT : EmailStatus.FAILED;

      await this.prisma.$transaction([
        this.prisma.emailQueue.update({
          where: { id: queueId },
          data: {
            status: newStatus,
            lastError: result.error,
            retryCount: { increment: result.success ? 0 : 1 },
          },
        }),
        this.prisma.emailDeliveryLog.upsert({
          where: { queueId },
          create: {
            tenantId: queued.tenantId,
            queueId,
            to: queued.to,
            cc: queued.cc,
            subject,
            templateKey: queued.templateKey,
            module: queued.module,
            relatedType: queued.relatedType,
            relatedId: queued.relatedId,
            providerType,
            status: newStatus,
            errorMessage: result.error,
            messageId: result.messageId,
            sentAt: result.success ? new Date() : null,
          },
          update: {
            status: newStatus,
            errorMessage: result.error,
            messageId: result.messageId,
            sentAt: result.success ? new Date() : null,
            retryCount: { increment: 1 },
          },
        }),
      ]);

      // Schedule retry with exponential backoff on failure
      if (!result.success && queued.retryCount < queued.maxRetries) {
        const backoffMs = Math.pow(2, queued.retryCount) * 60 * 1000;
        await this.prisma.emailQueue.update({
          where: { id: queueId },
          data: { status: EmailStatus.QUEUED, processAfter: new Date(Date.now() + backoffMs) },
        });
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      await this.prisma.emailQueue.update({
        where: { id: queueId },
        data: { status: EmailStatus.FAILED, lastError: errMsg, retryCount: { increment: 1 } },
      });
    }
  }

  async sendTransactional(
    tenantId: string,
    templateKey: string,
    to: string | string[],
    vars: Record<string, string>,
    opts: Partial<QueueEmailInput> = {},
  ): Promise<string> {
    return this.queue({
      tenantId,
      to,
      templateKey,
      templateVars: vars,
      isMandatory: opts.isMandatory ?? true,
      module: opts.module,
      relatedType: opts.relatedType,
      relatedId: opts.relatedId,
      idempotencyKey: opts.idempotencyKey,
    });
  }

  /**
   * Sends a one-off email to an employee at their work email. Tenant and
   * recipient are resolved server-side from the authenticated user's tenant,
   * so a caller can never send as (or to) another tenant. The send is logged
   * against the employee via relatedType/relatedId for their comms history.
   */
  async sendToEmployee(
    tenantId: string,
    employeeId: string,
    input: { subject: string; bodyHtml: string; cc?: string[] },
  ): Promise<{ queueId: string; to: string }> {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
      select: { workEmail: true, firstName: true, lastName: true },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    if (!employee.workEmail) {
      throw new BadRequestException('This employee has no work email on file');
    }
    const queueId = await this.queue({
      tenantId,
      to: employee.workEmail,
      cc: input.cc,
      subject: input.subject,
      bodyHtml: input.bodyHtml,
      isMandatory: false,
      module: 'communications',
      relatedType: 'employee',
      relatedId: employeeId,
    });
    return { queueId, to: employee.workEmail };
  }

  async employeeEmailHistory(tenantId: string, employeeId: string) {
    return this.prisma.emailDeliveryLog.findMany({
      where: { tenantId, relatedType: 'employee', relatedId: employeeId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, subject: true, to: true, status: true, sentAt: true, createdAt: true },
    });
  }

  async retry(tenantId: string, queueId: string): Promise<void> {
    await this.prisma.emailQueue.updateMany({
      where: { id: queueId, tenantId, status: { in: ['FAILED', 'BOUNCED'] } },
      data: { status: EmailStatus.QUEUED, processAfter: null },
    });
    setImmediate(() => this.processEmail(queueId).catch((e) => this.logger.error(e)));
  }

  async cancel(tenantId: string, queueId: string): Promise<void> {
    await this.prisma.emailQueue.updateMany({
      where: { id: queueId, tenantId, status: { in: ['QUEUED', 'DRAFT'] } },
      data: { status: EmailStatus.CANCELLED },
    });
  }

  async getLogs(
    tenantId: string,
    filters: {
      status?: string;
      module?: string;
      templateKey?: string;
      search?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const where = {
      tenantId,
      ...(filters.status && { status: filters.status as EmailStatus }),
      ...(filters.module && { module: filters.module }),
      ...(filters.templateKey && { templateKey: filters.templateKey }),
      ...(filters.search && {
        OR: [
          { to: { has: filters.search } },
          { subject: { contains: filters.search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.emailDeliveryLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.emailDeliveryLog.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async getPreferences(tenantId: string, employeeId: string) {
    return this.prisma.emailPreference.findUnique({
      where: { tenantId_employeeId: { tenantId, employeeId } },
    });
  }

  async updatePreferences(
    tenantId: string,
    employeeId: string,
    data: {
      announcements?: boolean;
      recognition?: boolean;
      surveys?: boolean;
      reminders?: boolean;
      digestEmails?: boolean;
      digestFrequency?: string;
    },
  ) {
    return this.prisma.emailPreference.upsert({
      where: { tenantId_employeeId: { tenantId, employeeId } },
      create: { tenantId, employeeId, ...data },
      update: data,
    });
  }

  private get resendApiKey() {
    return this.config.get<string>('RESEND_API_KEY')?.trim();
  }

  private get resendFromEmail() {
    return (
      this.config.get<string>('RESEND_FROM_EMAIL')?.trim() ||
      this.parseFrom(this.config.get<string>('EMAIL_FROM') || '').email ||
      'noreply@viohr.local'
    );
  }

  private get resendFromName() {
    return (
      this.config.get<string>('RESEND_FROM_NAME')?.trim() ||
      this.parseFrom(this.config.get<string>('EMAIL_FROM') || '').name ||
      'VioHr'
    );
  }

  private parseFrom(value: string) {
    const match = value.match(/^"?([^"<]+?)"?\s*<([^>]+)>$/);
    if (match) return { name: match[1].trim(), email: match[2].trim() };
    return { name: '', email: value.includes('@') ? value.trim().replace(/^"|"$/g, '') : '' };
  }
}
