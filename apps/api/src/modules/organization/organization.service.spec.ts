import { NotFoundException } from '@nestjs/common';
import { OrganizationService } from './organization.service';

describe('OrganizationService.createTenant', () => {
  it('seeds the system role catalog alongside the Tenant Owner role', async () => {
    const tx = {
      tenant: { create: jest.fn().mockResolvedValue({ id: 'tenant-new', slug: 'new-co' }) },
      role: {
        create: jest.fn().mockResolvedValue({ id: 'role-owner' }),
        findMany: jest.fn().mockResolvedValue([{ id: 'role-owner', name: 'Tenant Owner', permissions: [] }]),
        upsert: jest.fn(async ({ create }: any) => ({ id: `role-${create.name}`, ...create })),
      },
      permission: { createMany: jest.fn().mockResolvedValue({ count: 20 }) },
      user: { create: jest.fn() },
      userRole: { create: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    };
    const service = new OrganizationService(prisma as any);

    await service.createTenant({ name: 'New Co', slug: 'new-co' } as any, 'actor-1');

    const seeded = tx.role.upsert.mock.calls.map(([args]: any) => args.create.name);
    expect(seeded).toEqual(expect.arrayContaining(['HR Admin', 'Recruiter', 'Manager', 'Employee']));
    expect(seeded).not.toContain('Tenant Owner');
  });
});

describe('OrganizationService tenant settings', () => {
  const tenantId = 'tenant-1';
  const actorUserId = 'user-1';
  const existingTenant = {
    id: tenantId,
    name: 'Acme',
    slug: 'acme',
    legalName: 'Acme Private Limited',
    country: 'IN',
    industry: 'IT Services',
    companySize: '51-200',
    billingPlan: 'trial',
    status: 'TRIAL',
    timezone: 'Asia/Kolkata',
    currency: 'INR',
    logoUrl: 'https://cdn.example.com/logo.png',
    brandColor: '#2F6D5C',
  };

  const createService = (tenant: unknown = existingTenant) => {
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue(tenant),
        update: jest.fn().mockImplementation(({ data }) => ({ ...existingTenant, ...data })),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };

    return {
      prisma,
      service: new OrganizationService(prisma as never),
    };
  };

  it('updates submitted values', async () => {
    const { prisma, service } = createService();

    await service.updateTenant(
      tenantId,
      { name: 'Acme India', legalName: 'Acme India Private Limited' },
      actorUserId,
    );

    expect(prisma.tenant.update).toHaveBeenCalledWith({
      where: { id: tenantId },
      data: { name: 'Acme India', legalName: 'Acme India Private Limited' },
    });
  });

  it('trims submitted required and optional values', async () => {
    const { prisma, service } = createService();

    await service.updateTenant(
      tenantId,
      {
        name: '  Acme India  ',
        country: ' IN ',
        currency: ' INR ',
        timezone: ' Asia/Kolkata ',
        companySize: ' 201-500 ',
        legalName: '  Acme India Private Limited  ',
      },
      actorUserId,
    );

    expect(prisma.tenant.update).toHaveBeenCalledWith({
      where: { id: tenantId },
      data: {
        name: 'Acme India',
        country: 'IN',
        currency: 'INR',
        timezone: 'Asia/Kolkata',
        companySize: '201-500',
        legalName: 'Acme India Private Limited',
      },
    });
  });

  it('never clears companySize', async () => {
    const { prisma, service } = createService();

    await service.updateTenant(tenantId, { companySize: '' }, actorUserId);

    expect(prisma.tenant.update).toHaveBeenCalledWith({
      where: { id: tenantId },
      data: { companySize: '' },
    });
    expect(prisma.tenant.update.mock.calls[0]![0].data.companySize).not.toBeNull();
  });

  it('clears optional values when submitted empty', async () => {
    const { prisma, service } = createService();

    await service.updateTenant(
      tenantId,
      { legalName: '', industry: '', logoUrl: '', brandColor: '' },
      actorUserId,
    );

    expect(prisma.tenant.update).toHaveBeenCalledWith({
      where: { id: tenantId },
      data: {
        legalName: null,
        industry: null,
        logoUrl: null,
        brandColor: null,
      },
    });
  });

  it('omits fields that were not submitted', async () => {
    const { prisma, service } = createService();

    await service.updateTenant(tenantId, { name: 'Acme India' }, actorUserId);

    const update = prisma.tenant.update.mock.calls[0]![0];
    expect(update.data).toEqual({ name: 'Acme India' });
    for (const field of ['legalName', 'industry', 'companySize', 'logoUrl', 'brandColor']) {
      expect(update.data).not.toHaveProperty(field);
    }
  });

  it('never writes immutable tenant fields', async () => {
    const { prisma, service } = createService();

    await service.updateTenant(
      tenantId,
      {
        name: 'Acme India',
        billingPlan: 'enterprise',
        status: 'ACTIVE',
        slug: 'acme-india',
        primaryAdminEmail: 'owner@acme.example',
      } as never,
      actorUserId,
    );

    const update = prisma.tenant.update.mock.calls[0]![0];
    expect(update.data).toEqual({ name: 'Acme India' });
    for (const field of ['billingPlan', 'status', 'slug', 'primaryAdminEmail']) {
      expect(update.data).not.toHaveProperty(field);
    }
  });

  it('audits the tenant update with previous and new values', async () => {
    const { prisma, service } = createService();

    await service.updateTenant(tenantId, { name: 'Acme India' }, actorUserId);

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        tenantId,
        actorId: actorUserId,
        action: 'tenant.updated',
        objectType: 'Tenant',
        objectId: tenantId,
        oldValue: existingTenant,
        newValue: { ...existingTenant, name: 'Acme India' },
      },
    });
  });

  it('throws when the tenant does not exist', async () => {
    const { prisma, service } = createService(null);

    await expect(service.updateTenant(tenantId, { name: 'Acme India' }, actorUserId)).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.tenant.update).not.toHaveBeenCalled();
  });
});

describe('OrganizationService designation codes', () => {
  const tenantId = 'tenant-1';
  const actorUserId = 'user-1';
  const designationId = 'designation-1';

  const createService = () => {
    const prisma = {
      designation: {
        create: jest.fn().mockImplementation(({ data }) => ({ id: designationId, ...data })),
        findFirst: jest.fn().mockResolvedValue({
          id: designationId,
          tenantId,
          name: 'Engineer',
          code: 'ENG',
          grade: null,
          level: null,
          isActive: true,
        }),
        update: jest.fn().mockImplementation(({ data }) => ({ id: designationId, tenantId, ...data })),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };

    return {
      prisma,
      service: new OrganizationService(prisma as never),
    };
  };

  it('creates a designation without code when code is omitted', async () => {
    const { prisma, service } = createService();

    await service.createOrgUnit(tenantId, 'designations', { name: 'Engineer' }, actorUserId);

    expect(prisma.designation.create).toHaveBeenCalledWith({
      data: {
        tenantId,
        name: 'Engineer',
        isActive: true,
        grade: undefined,
        level: undefined,
      },
    });
  });

  it('creates a designation with code when code is provided', async () => {
    const { prisma, service } = createService();

    await service.createOrgUnit(
      tenantId,
      'designations',
      { name: 'Engineer', code: 'ENG' },
      actorUserId,
    );

    expect(prisma.designation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ code: 'ENG' }),
    });
  });

  it('updates a designation code when code is provided', async () => {
    const { prisma, service } = createService();

    await service.updateOrgUnit(tenantId, 'designations', designationId, { code: 'SWE' }, actorUserId);

    expect(prisma.designation.update).toHaveBeenCalledWith({
      where: { id: designationId },
      data: expect.objectContaining({ code: 'SWE' }),
    });
  });

  it('does not update a designation code when code is omitted', async () => {
    const { prisma, service } = createService();

    await service.updateOrgUnit(tenantId, 'designations', designationId, { name: 'Senior Engineer' }, actorUserId);

    const update = prisma.designation.update.mock.calls[0]![0];
    expect(update.data).not.toHaveProperty('code');
    expect(update.data).toEqual({
      name: 'Senior Engineer',
      isActive: undefined,
      grade: undefined,
      level: undefined,
    });
  });

  it('clears a designation code when code is empty', async () => {
    const { prisma, service } = createService();

    await service.updateOrgUnit(tenantId, 'designations', designationId, { code: '' }, actorUserId);

    expect(prisma.designation.update).toHaveBeenCalledWith({
      where: { id: designationId },
      data: expect.objectContaining({ code: null }),
    });
  });
});
