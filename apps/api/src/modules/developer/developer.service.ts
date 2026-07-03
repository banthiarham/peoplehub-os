import { createHash, randomBytes } from 'crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';

@Injectable()
export class DeveloperService {
  constructor(private readonly prisma: PrismaService) {}

  async listApiKeys(tenantId: string) {
    const keys = await this.prisma.apiKey.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    return keys.map(({ keyHash: _hash, ...k }) => k);
  }

  async createApiKey(tenantId: string, userId: string, name: string, scopes: string[]) {
    const raw = `phk_${randomBytes(24).toString('hex')}`;
    const keyHash = createHash('sha256').update(raw).digest('hex');
    const key = await this.prisma.apiKey.create({
      data: {
        tenantId,
        name,
        keyHash,
        keyPrefix: raw.slice(0, 12),
        scopes,
        createdById: userId,
      },
    });
    // Full key is returned exactly once — it is never stored in plaintext.
    return { id: key.id, name: key.name, key: raw, keyPrefix: key.keyPrefix, scopes: key.scopes };
  }

  async revokeApiKey(tenantId: string, id: string) {
    const key = await this.prisma.apiKey.findFirst({ where: { id, tenantId } });
    if (!key) throw new NotFoundException('API key not found');
    return this.prisma.apiKey.update({
      where: { id },
      data: { isActive: false },
      select: { id: true, name: true, isActive: true },
    });
  }

  async keyLogs(tenantId: string, id: string, page = 1) {
    const key = await this.prisma.apiKey.findFirst({ where: { id, tenantId } });
    if (!key) throw new NotFoundException('API key not found');
    const pageSize = 50;
    const [data, total] = await Promise.all([
      this.prisma.apiKeyLog.findMany({
        where: { apiKeyId: id },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.apiKeyLog.count({ where: { apiKeyId: id } }),
    ]);
    return { data, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }

  async listWebhooks(tenantId: string) {
    return this.prisma.webhookSubscription.findMany({
      where: { tenantId },
      include: { _count: { select: { deliveries: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createWebhook(tenantId: string, userId: string, url: string, events: string[]) {
    return this.prisma.webhookSubscription.create({
      data: {
        tenantId,
        url,
        events,
        secret: `whsec_${randomBytes(16).toString('hex')}`,
        createdById: userId,
      },
    });
  }

  async updateWebhook(
    tenantId: string,
    id: string,
    data: { events?: string[]; isActive?: boolean; url?: string },
  ) {
    const hook = await this.prisma.webhookSubscription.findFirst({ where: { id, tenantId } });
    if (!hook) throw new NotFoundException('Webhook not found');
    return this.prisma.webhookSubscription.update({ where: { id }, data });
  }

  async deliveries(tenantId: string, id: string) {
    const hook = await this.prisma.webhookSubscription.findFirst({ where: { id, tenantId } });
    if (!hook) throw new NotFoundException('Webhook not found');
    return this.prisma.webhookDelivery.findMany({
      where: { webhookSubscriptionId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async integrations(tenantId: string) {
    return this.prisma.integrationConnection.findMany({ where: { tenantId } });
  }

  async stats(tenantId: string) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const [activeKeys, requests30d, deliveries] = await Promise.all([
      this.prisma.apiKey.count({ where: { tenantId, isActive: true } }),
      this.prisma.apiKeyLog.count({
        where: { apiKey: { tenantId }, createdAt: { gte: thirtyDaysAgo } },
      }),
      this.prisma.webhookDelivery.groupBy({
        by: ['status'],
        where: { webhookSubscription: { tenantId } },
        _count: true,
      }),
    ]);
    const success = deliveries.find((d) => d.status === 'SUCCESS')?._count ?? 0;
    const totalDeliveries = deliveries.reduce((s, d) => s + d._count, 0);
    return {
      activeKeys,
      requests30d,
      webhookSuccessRate: totalDeliveries ? Math.round((success / totalDeliveries) * 100) : null,
    };
  }
}
