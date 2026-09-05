import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CompOffUnusedTreatment, CompOffUsagePeriod, SalaryBasis } from '@prisma/client';
import { PayrollPolicyService } from './payroll-policy.service';

/**
 * Prisma double whose `findFirst` matches the fixtures against the real `where` clause, so
 * tenant and location scoping is exercised rather than stubbed away.
 */
function buildPrisma(options: {
  policies?: Record<string, unknown>[];
  locations?: Record<string, unknown>[];
} = {}) {
  const policies = options.policies ?? [];
  const locations = options.locations ?? [];
  const matches = (row: Record<string, unknown>, where: Record<string, unknown>) =>
    Object.entries(where).every(([key, value]) => row[key] === value);

  return {
    location: {
      findFirst: jest.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(locations.find((l) => matches(l, where)) ?? null),
      ),
    },
    payrollPolicy: {
      findMany: jest.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(policies.filter((p) => matches(p, where))),
      ),
      findFirst: jest.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(policies.find((p) => matches(p, where)) ?? null),
      ),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'new-policy', createdAt: new Date(), updatedAt: new Date(), ...data }),
      ),
      update: jest.fn(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
        Promise.resolve({ ...policies.find((p) => p.id === where.id), ...data }),
      ),
      delete: jest.fn().mockResolvedValue({}),
    },
  };
}

function newService(prisma: ReturnType<typeof buildPrisma>) {
  return new PayrollPolicyService(prisma as any);
}

const tenantDefault = {
  id: 'tenant-default',
  tenantId: 'tenant-1',
  locationId: null,
  salaryBasis: SalaryBasis.CALENDAR_DAYS,
  fixedDays: null,
  overtimePaymentEnabled: false,
  compOffEnabled: false,
  compOffUnusedTreatment: CompOffUnusedTreatment.UNPAID,
  compOffUsagePeriod: CompOffUsagePeriod.MONTHLY,
  compOffCarryForwardEnabled: false,
  isDefault: true,
};

const locationPolicy = {
  id: 'location-policy',
  tenantId: 'tenant-1',
  locationId: 'loc-1',
  salaryBasis: SalaryBasis.FIXED_DAYS,
  fixedDays: 30,
  overtimePaymentEnabled: true,
  compOffEnabled: true,
  compOffUnusedTreatment: CompOffUnusedTreatment.PAY,
  compOffUsagePeriod: CompOffUsagePeriod.ANNUAL,
  compOffCarryForwardEnabled: true,
  isDefault: false,
};

describe('PayrollPolicyService validation', () => {
  it('rejects FIXED_DAYS without a fixedDays value', async () => {
    const service = newService(buildPrisma());
    await expect(service.create('tenant-1', { salaryBasis: SalaryBasis.FIXED_DAYS })).rejects.toThrow(
      BadRequestException,
    );
  });

  it.each([0, -5, 32, 26.5])('rejects an invalid fixedDays value of %p', async (fixedDays) => {
    const service = newService(buildPrisma());
    await expect(
      service.create('tenant-1', { salaryBasis: SalaryBasis.FIXED_DAYS, fixedDays }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects fixedDays set alongside a non-FIXED_DAYS salary basis', async () => {
    const service = newService(buildPrisma());
    await expect(
      service.create('tenant-1', { salaryBasis: SalaryBasis.CALENDAR_DAYS, fixedDays: 26 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepts a valid FIXED_DAYS policy and stores fixedDays', async () => {
    const service = newService(buildPrisma());
    const policy = await service.create('tenant-1', { salaryBasis: SalaryBasis.FIXED_DAYS, fixedDays: 30 });
    expect(policy.salaryBasis).toBe(SalaryBasis.FIXED_DAYS);
    expect(policy.fixedDays).toBe(30);
  });

  it('defaults an otherwise empty policy to the model defaults', async () => {
    const service = newService(buildPrisma());
    const policy = await service.create('tenant-1', {});
    expect(policy).toMatchObject({
      salaryBasis: SalaryBasis.CALENDAR_DAYS,
      fixedDays: null,
      overtimePaymentEnabled: false,
      compOffEnabled: false,
      compOffUnusedTreatment: CompOffUnusedTreatment.UNPAID,
      compOffUsagePeriod: CompOffUsagePeriod.MONTHLY,
      compOffCarryForwardEnabled: false,
    });
  });

  it('persists the comp-off configuration as given', async () => {
    const service = newService(buildPrisma({ locations: [{ id: 'loc-1', tenantId: 'tenant-1' }] }));
    const policy = await service.create('tenant-1', {
      locationId: 'loc-1',
      compOffEnabled: true,
      compOffUnusedTreatment: CompOffUnusedTreatment.PAY,
      compOffUsagePeriod: CompOffUsagePeriod.ANNUAL,
      compOffCarryForwardEnabled: true,
    });
    expect(policy).toMatchObject({
      compOffEnabled: true,
      compOffUnusedTreatment: CompOffUnusedTreatment.PAY,
      compOffUsagePeriod: CompOffUsagePeriod.ANNUAL,
      compOffCarryForwardEnabled: true,
    });
  });

  it('clears fixedDays when a FIXED_DAYS policy is switched to another salary basis', async () => {
    const prisma = buildPrisma({ policies: [{ ...locationPolicy, locationId: null, id: 'p1' }] });
    const service = newService(prisma);
    const updated = await service.update('tenant-1', 'p1', { salaryBasis: SalaryBasis.CALENDAR_DAYS });
    expect(updated.salaryBasis).toBe(SalaryBasis.CALENDAR_DAYS);
    expect(updated.fixedDays).toBeNull();
  });

  it('keeps the stored fixedDays when an unrelated field is updated', async () => {
    const prisma = buildPrisma({ policies: [locationPolicy] });
    const service = newService(prisma);
    const updated = await service.update('tenant-1', 'location-policy', { overtimePaymentEnabled: false });
    expect(updated.salaryBasis).toBe(SalaryBasis.FIXED_DAYS);
    expect(updated.fixedDays).toBe(30);
    expect(updated.overtimePaymentEnabled).toBe(false);
  });

  it('rejects moving a policy to a different location', async () => {
    const prisma = buildPrisma({ policies: [locationPolicy] });
    const service = newService(prisma);
    await expect(
      service.update('tenant-1', 'location-policy', { locationId: 'loc-2' }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('PayrollPolicyService default uniqueness and scoping', () => {
  it('rejects creating a location policy for a location outside the tenant', async () => {
    const prisma = buildPrisma({ locations: [{ id: 'loc-1', tenantId: 'tenant-2' }] });
    const service = newService(prisma);
    await expect(service.create('tenant-1', { locationId: 'loc-1' })).rejects.toThrow(NotFoundException);
  });

  it('rejects a second tenant-wide default policy', async () => {
    const prisma = buildPrisma({ policies: [tenantDefault] });
    const service = newService(prisma);
    await expect(service.create('tenant-1', {})).rejects.toThrow(BadRequestException);
  });

  it('rejects a second policy for the same location', async () => {
    const prisma = buildPrisma({
      policies: [locationPolicy],
      locations: [{ id: 'loc-1', tenantId: 'tenant-1' }],
    });
    const service = newService(prisma);
    await expect(service.create('tenant-1', { locationId: 'loc-1' })).rejects.toThrow(BadRequestException);
  });

  it('allows a location policy alongside an existing tenant default', async () => {
    const prisma = buildPrisma({
      policies: [tenantDefault],
      locations: [{ id: 'loc-1', tenantId: 'tenant-1' }],
    });
    const service = newService(prisma);
    const policy = await service.create('tenant-1', { locationId: 'loc-1', overtimePaymentEnabled: true });
    expect(policy.locationId).toBe('loc-1');
    expect(policy.isDefault).toBe(false);
  });

  it('derives isDefault from the scope rather than the client', async () => {
    const service = newService(buildPrisma());
    const created = await service.create('tenant-1', {});
    expect(created.isDefault).toBe(true);
  });

  it.each([
    ['get', (s: PayrollPolicyService) => s.get('tenant-2', 'tenant-default')],
    ['update', (s: PayrollPolicyService) => s.update('tenant-2', 'tenant-default', {})],
    ['delete', (s: PayrollPolicyService) => s.delete('tenant-2', 'tenant-default')],
  ])('%s cannot reach a policy belonging to another tenant', async (_name, call) => {
    const prisma = buildPrisma({ policies: [tenantDefault] });
    await expect(call(newService(prisma))).rejects.toThrow(NotFoundException);
  });

  it('lists only the calling tenant policies', async () => {
    const prisma = buildPrisma({
      policies: [tenantDefault, locationPolicy, { ...tenantDefault, id: 'other', tenantId: 'tenant-2' }],
    });
    const policies = await newService(prisma).list('tenant-1');
    expect(policies.map((p) => p.id)).toEqual(['tenant-default', 'location-policy']);
  });
});

describe('PayrollPolicyService.resolve precedence', () => {
  it('returns the location-specific policy when one exists for the location', async () => {
    const prisma = buildPrisma({ policies: [tenantDefault, locationPolicy] });
    const resolved = await newService(prisma).resolve('tenant-1', 'loc-1');
    expect(resolved.id).toBe('location-policy');
    expect(resolved.inherited).toBe(false);
  });

  it('falls back to the tenant-wide default when no location policy exists', async () => {
    const prisma = buildPrisma({ policies: [tenantDefault] });
    const resolved = await newService(prisma).resolve('tenant-1', 'loc-1');
    expect(resolved.id).toBe('tenant-default');
    expect(resolved.inherited).toBe(true);
  });

  it('returns the tenant default when no locationId is given', async () => {
    const prisma = buildPrisma({ policies: [tenantDefault, locationPolicy] });
    const resolved = await newService(prisma).resolve('tenant-1');
    expect(resolved.id).toBe('tenant-default');
    expect(resolved.inherited).toBe(false);
  });

  it('falls back to the in-code default when nothing is configured', async () => {
    const prisma = buildPrisma({ policies: [] });
    const resolved = await newService(prisma).resolve('tenant-1', 'loc-1');
    expect(resolved).toMatchObject({
      salaryBasis: SalaryBasis.CALENDAR_DAYS,
      fixedDays: null,
      overtimePaymentEnabled: false,
      compOffEnabled: false,
      compOffUnusedTreatment: CompOffUnusedTreatment.UNPAID,
      compOffUsagePeriod: CompOffUsagePeriod.MONTHLY,
      compOffCarryForwardEnabled: false,
      inherited: true,
    });
  });

  it('never resolves a policy belonging to another tenant', async () => {
    const prisma = buildPrisma({ policies: [tenantDefault, locationPolicy] });
    const resolved = await newService(prisma).resolve('tenant-2', 'loc-1');
    expect(resolved.id).toBe('default:tenant-2');
    expect(resolved.inherited).toBe(true);
  });

  it('does not leak another location policy into an unconfigured location', async () => {
    const prisma = buildPrisma({ policies: [locationPolicy] });
    const resolved = await newService(prisma).resolve('tenant-1', 'loc-2');
    expect(resolved.id).toBe('default:tenant-1');
  });
});
