import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationChannel, NotificationTemplateStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { AuthUser } from '../../common/types/auth-user';
import {
  CreateNotificationTemplateDto,
  PreviewNotificationTemplateDto,
  UpdateNotificationTemplateDto,
} from './dto/notifications.dto';

type RenderContext = Record<string, unknown>;

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pathLookup(source: unknown, path: string): unknown {
  if (!path) return undefined;
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[key];
  }, source);
}

function resolveTemplate(input: string, context: RenderContext, html = false) {
  return input.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, rawPath) => {
    const value = pathLookup(context, String(rawPath).trim());
    const text = value == null ? '' : String(value);
    return html ? escapeHtml(text) : text;
  });
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, page = 1, pageSize = 20, unreadOnly = false) {
    const where = { userId, ...(unreadOnly && { isRead: false }) };
    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return { data, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }

  async unreadCount(userId: string) {
    const count = await this.prisma.notification.count({ where: { userId, isRead: false } });
    return { count };
  }

  async markRead(userId: string, id: string) {
    const notification = await this.prisma.notification.findFirst({ where: { id, userId } });
    if (!notification) throw new NotFoundException('Notification not found');
    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { updated: result.count };
  }

  async listTemplates(tenantId: string, channel?: string) {
    return this.prisma.notificationTemplate.findMany({
      where: {
        OR: [{ tenantId }, { tenantId: null }],
        ...(channel && { channel }),
      },
      include: { versions: { orderBy: { version: 'desc' } } },
      orderBy: [{ name: 'asc' }],
    });
  }

  async getTemplate(tenantId: string, id: string) {
    const template = await this.prisma.notificationTemplate.findFirst({
      where: { id, OR: [{ tenantId }, { tenantId: null }] },
      include: { versions: { orderBy: { version: 'desc' } } },
    });
    if (!template) throw new NotFoundException('Notification template not found');
    return template;
  }

  async createTemplate(tenantId: string, actorId: string, dto: CreateNotificationTemplateDto) {
    const template = await this.prisma.notificationTemplate.create({
      data: {
        tenantId,
        templateKey: dto.templateKey,
        name: dto.name,
        channel: dto.channel ?? 'IN_APP',
        title: dto.title,
        body: dto.body,
        variables: dto.variables ?? [],
        isMandatory: dto.isMandatory ?? false,
        status: (dto.status ?? 'DRAFT') as NotificationTemplateStatus,
        createdById: actorId,
      },
    });
    await this.prisma.notificationTemplateVersion.create({
      data: {
        templateId: template.id,
        version: 1,
        title: template.title,
        body: template.body,
        variables: template.variables as Prisma.InputJsonValue,
        createdById: actorId,
      },
    });
    await this.audit(tenantId, actorId, 'notification.template_created', 'NotificationTemplate', template.id, null, template);
    return this.getTemplate(tenantId, template.id);
  }

  async updateTemplate(tenantId: string, actorId: string, id: string, dto: UpdateNotificationTemplateDto) {
    const current = await this.getTemplate(tenantId, id);
    await this.prisma.notificationTemplateVersion.create({
      data: {
        templateId: current.id,
        version: current.version,
        title: current.title,
        body: current.body,
        variables: current.variables as Prisma.InputJsonValue,
        createdById: actorId,
      },
    });
    const updated = await this.prisma.notificationTemplate.update({
      where: { id: current.id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.channel !== undefined && { channel: dto.channel }),
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.body !== undefined && { body: dto.body }),
        ...(dto.variables !== undefined && { variables: dto.variables }),
        ...(dto.isMandatory !== undefined && { isMandatory: dto.isMandatory }),
        ...(dto.status !== undefined && { status: dto.status as NotificationTemplateStatus }),
        version: current.version + 1,
      },
    });
    await this.audit(tenantId, actorId, 'notification.template_updated', 'NotificationTemplate', current.id, current, updated);
    return this.getTemplate(tenantId, current.id);
  }

  async previewTemplate(tenantId: string, id: string, dto: PreviewNotificationTemplateDto) {
    const template = await this.getTemplate(tenantId, id);
    const context: RenderContext = { vars: dto.vars ?? {} };
    return {
      title: resolveTemplate(template.title, context, false),
      body: resolveTemplate(template.body, context, false),
      channel: template.channel,
      variables: template.variables,
    };
  }

  /** For other modules to push in-app notifications. */
  async notify(
    tenantId: string,
    userId: string,
    payload: {
      title?: string;
      body?: string;
      type?: string;
      link?: string;
      templateKey?: string;
      channels?: string[];
      vars?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
    },
  ) {
    let title = payload.title ?? '';
    let body = payload.body ?? '';
    let channels = payload.channels ?? ['IN_APP'];

    if (payload.templateKey) {
      const template = await this.prisma.notificationTemplate.findFirst({
        where: { tenantId, templateKey: payload.templateKey, status: 'ACTIVE' },
      });
      if (!template) throw new NotFoundException(`Notification template '${payload.templateKey}' not found`);
      const context: RenderContext = { vars: payload.vars ?? {} };
      title = payload.title ?? resolveTemplate(template.title, context, false);
      body = payload.body ?? resolveTemplate(template.body, context, false);
      channels = payload.channels ?? [template.channel];
    }

    if (!title || !body) {
      throw new BadRequestException('Notification title and body are required');
    }

    return this.prisma.notification.create({
      data: {
        tenantId,
        userId,
        templateKey: payload.templateKey ?? null,
        type: payload.type ?? payload.templateKey ?? 'GENERAL',
        title,
        body,
        channels,
        channel: (channels[0] ?? 'IN_APP') as NotificationChannel,
        metadata: {
          ...(payload.metadata ?? {}),
          ...(payload.link ? { link: payload.link } : {}),
          vars: payload.vars ?? {},
        } as Prisma.InputJsonValue,
      },
    });
  }

  async send(
    user: AuthUser,
    payload: { userId: string; title: string; body: string; type?: string; channels?: string[]; metadata?: Record<string, unknown> },
  ) {
    return this.notify(user.tenantId, payload.userId, payload);
  }

  private async audit(
    tenantId: string,
    actorId: string,
    action: string,
    objectType: string,
    objectId: string,
    oldValue: unknown,
    newValue: unknown,
  ) {
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId,
        action,
        objectType,
        objectId,
        oldValue: oldValue as Prisma.InputJsonValue | undefined,
        newValue: newValue as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
