import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  it('creates and versions notification templates', async () => {
    const prisma = {
      notificationTemplate: {
        create: jest.fn().mockResolvedValue({
          id: 'template-1',
          tenantId: 'tenant-1',
          templateKey: 'payroll_published',
          name: 'Payroll Published',
          channel: 'IN_APP',
          title: 'Payroll published',
          body: '<p>Done</p>',
          variables: [],
          isMandatory: true,
          status: 'ACTIVE',
          version: 1,
        }),
        findFirst: jest.fn().mockResolvedValue({
          id: 'template-1',
          tenantId: 'tenant-1',
          templateKey: 'payroll_published',
          name: 'Payroll Published',
          channel: 'IN_APP',
          title: 'Payroll published',
          body: '<p>Done</p>',
          variables: [],
          isMandatory: true,
          status: 'ACTIVE',
          version: 1,
          versions: [],
        }),
      },
      notificationTemplateVersion: {
        create: jest.fn().mockResolvedValue({}),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new NotificationsService(prisma as any);

    await expect(
      service.createTemplate('tenant-1', 'user-1', {
        templateKey: 'payroll_published',
        name: 'Payroll Published',
        channel: 'IN_APP',
        title: 'Payroll published',
        body: '<p>Done</p>',
        variables: ['vars.month'],
        isMandatory: true,
        status: 'ACTIVE',
      }),
    ).resolves.toEqual(expect.objectContaining({ id: 'template-1' }));

    expect(prisma.notificationTemplateVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          templateId: 'template-1',
          version: 1,
        }),
      }),
    );
  });

  it('renders template notifications and marks inbox items read', async () => {
    const prisma = {
      notificationTemplate: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'template-1',
          tenantId: 'tenant-1',
          templateKey: 'payroll_published',
          name: 'Payroll Published',
          channel: 'IN_APP',
          title: 'Payroll published for {{vars.month}}',
          body: '<p>{{vars.message}}</p>',
          variables: [],
          status: 'ACTIVE',
          version: 1,
        }),
      },
      notification: {
        create: jest.fn().mockResolvedValue({ id: 'notif-1' }),
        findFirst: jest.fn().mockResolvedValue({ id: 'notif-1', userId: 'user-1' }),
        update: jest.fn().mockResolvedValue({ id: 'notif-1', isRead: true }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([{ id: 'notif-1' }]),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new NotificationsService(prisma as any);

    await expect(
      service.notify('tenant-1', 'user-1', {
        templateKey: 'payroll_published',
        vars: { month: 'June 2026', message: 'Payroll is published' },
        type: 'PAYROLL',
      }),
    ).resolves.toEqual(expect.objectContaining({ id: 'notif-1' }));

    await expect(service.markRead('user-1', 'notif-1')).resolves.toEqual(
      expect.objectContaining({ isRead: true }),
    );
  });
});
