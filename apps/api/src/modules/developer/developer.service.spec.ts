import axios from 'axios';
import { createHash } from 'crypto';
import { DeveloperService } from './developer.service';

jest.mock('axios');

describe('DeveloperService', () => {
  it('creates API keys once and returns the raw secret only at creation', async () => {
    const prisma = {
      apiKey: {
        create: jest.fn().mockImplementation(async ({ data }) => ({
          id: 'key-1',
          ...data,
        })),
      },
    };
    const service = new DeveloperService(prisma as any);

    const result = await service.createApiKey('tenant-1', 'user-1', 'Internal app', ['employees:read']);

    expect(result.key).toMatch(/^phk_/);
    expect(result.scopes).toEqual(['employees:read']);
    expect(prisma.apiKey.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          name: 'Internal app',
          keyHash: createHash('sha256').update(result.key).digest('hex'),
          scopes: ['employees:read'],
        }),
      }),
    );
  });

  it('retries webhook delivery and stores the final result', async () => {
    (axios.post as jest.Mock).mockResolvedValueOnce({ status: 200, data: { ok: true } });
    const updates: any[] = [];
    const prisma = {
      webhookSubscription: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'wh-1',
          tenantId: 'tenant-1',
          url: 'https://example.com/webhook',
          secret: 'whsec_abc',
        }),
      },
      webhookDelivery: {
        create: jest.fn().mockResolvedValue({ id: 'delivery-1' }),
        update: jest.fn().mockImplementation(async ({ data }) => {
          updates.push(data);
          return { id: 'delivery-1', ...data };
        }),
      },
    };
    const service = new DeveloperService(prisma as any);

    const result = await service.sendWebhookTest('tenant-1', 'wh-1', { eventType: 'employee.created' });

    expect(result).toEqual(expect.objectContaining({ ok: true, status: 'SUCCESS', attempts: 1 }));
    expect(prisma.webhookDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ webhookSubscriptionId: 'wh-1', eventType: 'employee.created' }),
      }),
    );
    expect(updates[0]).toEqual(
      expect.objectContaining({
        status: 'SUCCESS',
        attempts: 1,
        responseCode: 200,
      }),
    );
  });
});
