import { OrganizationService } from './organization.service';

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
