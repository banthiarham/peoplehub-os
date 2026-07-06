import { createHash, randomBytes } from 'crypto';
import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../../common/database/prisma.service';
import { CreateOAuthClientDto, UpdateOAuthClientDto } from './dto/developer.dto';

const WEBHOOK_EVENT_CATALOG = {
  employee: [
    'employee.created',
    'employee.updated',
    'employee.activated',
    'employee.transferred',
    'employee.exited',
    'employee.manager_changed',
    'employee.salary_changed',
    'employee.document_uploaded',
  ],
  attendance: [
    'attendance.punched_in',
    'attendance.punched_out',
    'attendance.exception_created',
    'attendance.finalized',
  ],
  leave: ['leave.requested', 'leave.approved', 'leave.rejected', 'leave.cancelled'],
  payroll: ['payroll.run_created', 'payroll.calculated', 'payroll.approved', 'payroll.locked', 'payroll.payslips_published'],
  workflow: ['approval.created', 'approval.approved', 'approval.rejected', 'approval.escalated'],
  hiring: ['candidate.created', 'candidate.stage_changed', 'offer.sent', 'offer.accepted', 'candidate.converted_to_employee'],
};

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

  async requestLogs(tenantId: string, page = 1) {
    const pageSize = 50;
    const [data, total] = await Promise.all([
      this.prisma.apiRequestLog.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.apiRequestLog.count({ where: { tenantId } }),
    ]);
    return { data, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }

  async listOAuthClients(tenantId: string) {
    return this.prisma.oAuthClient.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        clientId: true,
        redirectUris: true,
        scopes: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async createOAuthClient(tenantId: string, userId: string, dto: CreateOAuthClientDto) {
    const clientSecret = `phs_${randomBytes(24).toString('hex')}`;
    const client = await this.prisma.oAuthClient.create({
      data: {
        tenantId,
        name: dto.name,
        clientId: `phc_${randomBytes(12).toString('hex')}`,
        clientSecretHash: createHash('sha256').update(clientSecret).digest('hex'),
        redirectUris: dto.redirectUris,
        scopes: dto.scopes,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId: userId,
        action: 'oauth_client.created',
        objectType: 'OAuthClient',
        objectId: client.id,
        newValue: client as any,
      },
    });
    return { ...client, clientSecret };
  }

  async updateOAuthClient(tenantId: string, id: string, dto: UpdateOAuthClientDto) {
    const client = await this.prisma.oAuthClient.findFirst({ where: { id, tenantId } });
    if (!client) throw new NotFoundException('OAuth client not found');
    return this.prisma.oAuthClient.update({
      where: { id },
      data: {
        ...(dto.scopes && { scopes: dto.scopes }),
        ...(dto.redirectUris && { redirectUris: dto.redirectUris }),
        ...(typeof dto.isActive === 'boolean' && { isActive: dto.isActive }),
      },
      select: {
        id: true,
        name: true,
        clientId: true,
        redirectUris: true,
        scopes: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async revokeOAuthClient(tenantId: string, id: string) {
    const client = await this.prisma.oAuthClient.findFirst({ where: { id, tenantId } });
    if (!client) throw new NotFoundException('OAuth client not found');
    return this.prisma.oAuthClient.update({
      where: { id },
      data: { isActive: false },
      select: { id: true, name: true, clientId: true, isActive: true },
    });
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

  async sendWebhookTest(tenantId: string, id: string, payload?: Record<string, unknown>) {
    const hook = await this.prisma.webhookSubscription.findFirst({
      where: { id, tenantId },
    });
    if (!hook) throw new NotFoundException('Webhook not found');
    const body = payload ?? {
      eventType: 'developer.test',
      tenantId,
      emittedAt: new Date().toISOString(),
      sample: true,
    };
    const delivery = await this.prisma.webhookDelivery.create({
      data: {
        webhookSubscriptionId: hook.id,
        eventType: String(body.eventType ?? 'developer.test'),
        payload: body as never,
        status: 'PENDING',
      },
    });

    let attempt = 0;
    while (attempt < 3) {
      attempt++;
      try {
        const response = await axios.post(hook.url, body, {
          timeout: 5000,
          headers: {
          'content-type': 'application/json',
          'x-peoplehub-signature': hook.secret ?? '',
          },
        });
        await this.prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            status: 'SUCCESS',
            attempts: attempt,
            responseCode: response.status,
            responseBody: JSON.stringify(response.data).slice(0, 4000),
            lastAttemptAt: new Date(),
          },
        });
        return { ok: true, deliveryId: delivery.id, status: 'SUCCESS', attempts: attempt };
      } catch (error: any) {
        const statusCode = error?.response?.status ?? 0;
        const responseBody = error?.response?.data ? JSON.stringify(error.response.data).slice(0, 4000) : error?.message ?? 'Webhook delivery failed';
        await this.prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            status: attempt >= 3 ? 'FAILED' : 'RETRYING',
            attempts: attempt,
            responseCode: statusCode || null,
            responseBody,
            lastAttemptAt: new Date(),
            nextRetryAt: attempt >= 3 ? null : new Date(Date.now() + attempt * 1500),
          },
        });
        if (attempt >= 3) {
          return { ok: false, deliveryId: delivery.id, status: 'FAILED', attempts: attempt, error: responseBody };
        }
      }
    }
    throw new ServiceUnavailableException('Unable to deliver webhook');
  }

  async integrations(tenantId: string) {
    const rows = await this.prisma.integrationConnection.findMany({ where: { tenantId } });
    const marketplace = [
      'Accounting software',
      'Biometric devices',
      'Slack',
      'Microsoft Teams',
      'Google Workspace',
      'Microsoft 365',
      'Calendar',
      'Email',
      'WhatsApp provider',
      'Background verification',
      'E-signature',
      'LMS',
      'ERP',
      'CRM',
      'Internal founder-owned products',
    ];
    return {
      connected: rows,
      marketplace: marketplace.map((provider) => ({
        provider,
        status: rows.some((row) => row.provider === provider) ? 'CONNECTED' : 'AVAILABLE',
      })),
    };
  }

  async stats(tenantId: string) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const [activeKeys, requests30d, deliveries, oauthClients, webhooks] = await Promise.all([
      this.prisma.apiKey.count({ where: { tenantId, isActive: true } }),
      this.prisma.apiRequestLog.count({
        where: { tenantId, createdAt: { gte: thirtyDaysAgo } },
      }),
      this.prisma.webhookDelivery.groupBy({
        by: ['status'],
        where: { webhookSubscription: { tenantId } },
        _count: true,
      }),
      this.prisma.oAuthClient.count({ where: { tenantId } }),
      this.prisma.webhookSubscription.count({ where: { tenantId } }),
    ]) as [
      number,
      number,
      Array<{ status: string; _count: number }>,
      number,
      number,
    ];
    const success = deliveries.find((delivery) => delivery.status === 'SUCCESS')?._count ?? 0;
    const totalDeliveries = deliveries.reduce((sum, delivery) => sum + delivery._count, 0);
    return {
      activeKeys,
      oauthClients,
      webhooks,
      requests30d,
      rateLimitPerMinute: 100,
      webhookSuccessRate: totalDeliveries ? Math.round((success / totalDeliveries) * 100) : null,
      eventCatalog: WEBHOOK_EVENT_CATALOG,
    };
  }

  webhookEvents() {
    return WEBHOOK_EVENT_CATALOG;
  }

  sandbox() {
    return {
      tenantSlug: 'demo-corp',
      baseUrl: '/api/v1',
      apiKeyHeader: 'X-API-Key',
      sampleHeaders: {
        'X-API-Key': 'phk_demo_key',
        'Content-Type': 'application/json',
      },
      sampleCode: {
        apiKeyCurl: `curl -H "X-API-Key: phk_demo_key" ${'/api/v1/employees'}`,
        oauthTokenCurl: `curl -X POST ${'/api/v1/auth/oauth/token'} -H "Content-Type: application/json" -d '{"grant_type":"client_credentials","client_id":"phc_xxx","client_secret":"phs_xxx"}'`,
      },
      samplePayloads: {
        employeeCreated: { eventType: 'employee.created', employeeId: 'emp-demo' },
        leaveRequested: { eventType: 'leave.requested', leaveRequestId: 'leave-demo' },
        payrollPublished: { eventType: 'payroll.payslips_published', payrollRunId: 'payroll-demo' },
      },
    };
  }
}
