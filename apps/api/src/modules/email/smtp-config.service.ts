import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/database/prisma.service';
import { SmtpProvider } from './providers/smtp.provider';
import { SmtpEncryption } from '@prisma/client';
import * as crypto from 'crypto';

@Injectable()
export class SmtpConfigService {
  private readonly algorithm = 'aes-256-gcm';

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private get encryptionKey(): Buffer {
    const key = this.config.get<string>('ENCRYPTION_KEY', '');
    if (!key || key.length < 32) throw new Error('ENCRYPTION_KEY must be at least 32 characters');
    return Buffer.from(key.slice(0, 32));
  }

  private encrypt(plain: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  private decrypt(stored: string): string {
    const [ivHex, tagHex, encHex] = stored.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const encrypted = Buffer.from(encHex, 'hex');
    const decipher = crypto.createDecipheriv(this.algorithm, this.encryptionKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }

  async getActive(tenantId: string) {
    return this.prisma.emailProviderConfig.findFirst({
      where: { tenantId, isActive: true },
      include: {
        smtpConfig: {
          select: {
            id: true,
            host: true,
            port: true,
            encryption: true,
            username: true,
            fromEmail: true,
            fromName: true,
            replyTo: true,
            bounceEmail: true,
            testRecipient: true,
          },
        },
      },
    });
  }

  async list(tenantId: string) {
    return this.prisma.emailProviderConfig.findMany({
      where: { tenantId },
      include: {
        smtpConfig: {
          select: {
            id: true,
            host: true,
            port: true,
            encryption: true,
            username: true,
            fromEmail: true,
            fromName: true,
            replyTo: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(
    tenantId: string,
    createdById: string,
    data: {
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
    const provider = await this.prisma.emailProviderConfig.create({
      data: {
        tenantId,
        providerType: 'SMTP',
        name: data.name,
        isActive: false,
        dailySendingLimit: data.dailySendingLimit,
        createdById,
      },
    });

    await this.prisma.smtpConfig.create({
      data: {
        tenantId,
        providerId: provider.id,
        host: data.host,
        port: data.port,
        encryption: data.encryption,
        username: data.username,
        passwordEncrypted: this.encrypt(data.password),
        fromEmail: data.fromEmail,
        fromName: data.fromName,
        replyTo: data.replyTo,
        bounceEmail: data.bounceEmail,
        testRecipient: data.testRecipient,
      },
    });

    return provider;
  }

  async update(
    tenantId: string,
    providerId: string,
    data: {
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
    const existing = await this.prisma.emailProviderConfig.findFirst({
      where: { id: providerId, tenantId },
    });
    if (!existing) throw new NotFoundException('SMTP config not found');

    if (data.name || data.dailySendingLimit !== undefined) {
      await this.prisma.emailProviderConfig.update({
        where: { id: providerId },
        data: { name: data.name, dailySendingLimit: data.dailySendingLimit },
      });
    }

    const smtpUpdate: Record<string, unknown> = {};
    if (data.host) smtpUpdate.host = data.host;
    if (data.port) smtpUpdate.port = data.port;
    if (data.encryption) smtpUpdate.encryption = data.encryption;
    if (data.username) smtpUpdate.username = data.username;
    if (data.password) smtpUpdate.passwordEncrypted = this.encrypt(data.password);
    if (data.fromEmail) smtpUpdate.fromEmail = data.fromEmail;
    if (data.fromName) smtpUpdate.fromName = data.fromName;
    if (data.replyTo !== undefined) smtpUpdate.replyTo = data.replyTo;

    if (Object.keys(smtpUpdate).length > 0) {
      await this.prisma.smtpConfig.update({ where: { providerId }, data: smtpUpdate });
    }

    return this.prisma.emailProviderConfig.findUnique({ where: { id: providerId } });
  }

  async sendTest(
    tenantId: string,
    providerId: string,
    testedById: string,
  ): Promise<{ success: boolean; error?: string }> {
    const provider = await this.prisma.emailProviderConfig.findFirst({
      where: { id: providerId, tenantId },
      include: { smtpConfig: true },
    });
    if (!provider?.smtpConfig) throw new NotFoundException('SMTP config not found');

    const smtp = provider.smtpConfig;
    const password = this.decrypt(smtp.passwordEncrypted);

    const smtpProvider = new SmtpProvider({
      host: smtp.host,
      port: smtp.port,
      encryption: smtp.encryption,
      username: smtp.username,
      password,
      fromEmail: smtp.fromEmail,
      fromName: smtp.fromName,
      replyTo: smtp.replyTo ?? undefined,
    });

    const recipient = smtp.testRecipient ?? smtp.fromEmail;
    const result = await smtpProvider.sendEmail({
      to: [recipient],
      subject: 'VioHr — SMTP Test',
      bodyHtml:
        '<p>This is a test email from VioHr. Your SMTP configuration is working correctly.</p>',
      fromEmail: smtp.fromEmail,
      fromName: smtp.fromName,
    });

    await this.prisma.emailTestLog.create({
      data: {
        tenantId,
        providerId,
        recipient,
        success: result.success,
        error: result.error,
        testedById,
      },
    });

    return result;
  }

  async activate(tenantId: string, providerId: string) {
    const provider = await this.prisma.emailProviderConfig.findFirst({
      where: { id: providerId, tenantId },
    });
    if (!provider) throw new NotFoundException('Provider not found');

    await this.prisma.$transaction([
      this.prisma.emailProviderConfig.updateMany({
        where: { tenantId, isActive: true },
        data: { isActive: false },
      }),
      this.prisma.emailProviderConfig.update({
        where: { id: providerId },
        data: { isActive: true },
      }),
    ]);
  }

  async deactivate(tenantId: string, providerId: string) {
    await this.prisma.emailProviderConfig.updateMany({
      where: { id: providerId, tenantId },
      data: { isActive: false },
    });
  }

  async buildProvider(
    tenantId: string,
  ): Promise<{
    provider: SmtpProvider;
    fromEmail: string;
    fromName: string;
    replyTo?: string;
  } | null> {
    const config = await this.prisma.emailProviderConfig.findFirst({
      where: { tenantId, isActive: true, providerType: 'SMTP' },
      include: { smtpConfig: true },
    });
    if (!config?.smtpConfig) return null;

    const smtp = config.smtpConfig;
    const password = this.decrypt(smtp.passwordEncrypted);
    return {
      provider: new SmtpProvider({
        host: smtp.host,
        port: smtp.port,
        encryption: smtp.encryption,
        username: smtp.username,
        password,
        fromEmail: smtp.fromEmail,
        fromName: smtp.fromName,
      }),
      fromEmail: smtp.fromEmail,
      fromName: smtp.fromName,
      replyTo: smtp.replyTo ?? undefined,
    };
  }
}
