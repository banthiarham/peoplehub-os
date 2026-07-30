import { ShiftResolutionService } from './shift-resolution.service';

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

const base = {
  id: 'a-base',
  shiftId: 'shift-day',
  shift: { id: 'shift-day', name: 'Day' },
  locationId: null as string | null,
  source: 'MANUAL',
  effectiveFrom: day('2026-07-01'),
  effectiveTo: null as Date | null,
  createdAt: day('2026-06-01'),
  employeeId: 'emp-1',
};

const override = {
  id: 'a-roster',
  shiftId: 'shift-night',
  shift: { id: 'shift-night', name: 'Night' },
  locationId: 'loc-remote',
  source: 'ROSTER_UPLOAD',
  effectiveFrom: day('2026-07-10'),
  effectiveTo: day('2026-07-10'),
  createdAt: day('2026-06-20'),
  employeeId: 'emp-1',
};

function prismaMock(options?: {
  assignments?: Array<Record<string, unknown>>;
  employeeLocationId?: string | null;
  defaultShift?: Record<string, unknown> | null;
  employees?: Array<{ id: string }>;
}) {
  const assignments = options?.assignments ?? [];
  return {
    shiftAssignment: {
      // Mirrors the DB by applying the service's own window filter, so the
      // covering-window logic is exercised rather than stubbed away.
      findFirst: jest.fn(({ where }: any) => {
        const at = where.effectiveFrom.lte as Date;
        const covering = assignments
          .filter(
            (a: any) =>
              a.effectiveFrom <= at && (a.effectiveTo === null || a.effectiveTo >= at),
          )
          .sort((a: any, b: any) => b.effectiveFrom - a.effectiveFrom || b.createdAt - a.createdAt);
        return Promise.resolve(covering[0] ?? null);
      }),
      findMany: jest.fn().mockResolvedValue(assignments),
    },
    shift: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          options && 'defaultShift' in options
            ? options.defaultShift
            : { id: 'shift-tenant-default', name: 'Tenant default' },
        ),
    },
    employee: {
      findFirst: jest.fn().mockResolvedValue({ locationId: options?.employeeLocationId ?? 'loc-hq' }),
      findMany: jest.fn().mockResolvedValue(options?.employees ?? [{ id: 'emp-1' }]),
    },
  };
}

describe('ShiftResolutionService', () => {
  describe('effective shift', () => {
    it('uses the assignment covering the date', async () => {
      const service = new ShiftResolutionService(prismaMock({ assignments: [base] }) as never);
      const resolved = await service.resolveAt('tenant-1', 'emp-1', day('2026-07-05'));
      expect(resolved.shift).toMatchObject({ id: 'shift-day' });
      expect(resolved.assignment).toMatchObject({ id: 'a-base', source: 'MANUAL' });
    });

    it('lets a later-starting override win on its own day only', async () => {
      const service = new ShiftResolutionService(
        prismaMock({ assignments: [base, override] }) as never,
      );
      await expect(service.shiftAt('tenant-1', 'emp-1', day('2026-07-10'))).resolves.toMatchObject({
        id: 'shift-night',
      });
      await expect(service.shiftAt('tenant-1', 'emp-1', day('2026-07-11'))).resolves.toMatchObject({
        id: 'shift-day',
      });
    });

    it('falls back to the tenant default when nothing covers the date', async () => {
      const service = new ShiftResolutionService(prismaMock({ assignments: [base] }) as never);
      const resolved = await service.resolveAt('tenant-1', 'emp-1', day('2026-06-30'));
      expect(resolved.shift).toMatchObject({ id: 'shift-tenant-default' });
      expect(resolved.assignment).toBeNull();
    });

    it('scopes the assignment lookup to the tenant', async () => {
      const prisma = prismaMock({ assignments: [base] });
      const service = new ShiftResolutionService(prisma as never);
      await service.resolveAt('tenant-1', 'emp-1', day('2026-07-05'));
      expect(prisma.shiftAssignment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ employee: { tenantId: 'tenant-1' } }),
        }),
      );
    });

    it('breaks a same-day tie on the most recently created assignment', async () => {
      const older = { ...base, id: 'older', createdAt: day('2026-06-01') };
      const newer = {
        ...base,
        id: 'newer',
        shiftId: 'shift-newer',
        shift: { id: 'shift-newer', name: 'Newer' },
        createdAt: day('2026-06-15'),
      };
      const service = new ShiftResolutionService(
        prismaMock({ assignments: [older, newer] }) as never,
      );
      // Same query run twice must not depend on row order.
      const resolver = await service.resolverForRange(
        'tenant-1',
        'emp-1',
        day('2026-07-01'),
        day('2026-07-31'),
      );
      expect(resolver(day('2026-07-05')).shift).toMatchObject({ id: 'shift-newer' });
      const reversed = new ShiftResolutionService(
        prismaMock({ assignments: [newer, older] }) as never,
      );
      const reversedResolver = await reversed.resolverForRange(
        'tenant-1',
        'emp-1',
        day('2026-07-01'),
        day('2026-07-31'),
      );
      expect(reversedResolver(day('2026-07-05')).shift).toMatchObject({ id: 'shift-newer' });
    });
  });

  describe('effective location', () => {
    it("uses the employee's own location when no assignment overrides it", async () => {
      const service = new ShiftResolutionService(
        prismaMock({ assignments: [base], employeeLocationId: 'loc-hq' }) as never,
      );
      await expect(
        service.effectiveLocationId('tenant-1', 'emp-1', day('2026-07-05')),
      ).resolves.toBe('loc-hq');
    });

    it('lets a date-effective assignment override the location for that day only', async () => {
      const service = new ShiftResolutionService(
        prismaMock({ assignments: [base, override], employeeLocationId: 'loc-hq' }) as never,
      );
      await expect(
        service.effectiveLocationId('tenant-1', 'emp-1', day('2026-07-10')),
      ).resolves.toBe('loc-remote');
      await expect(
        service.effectiveLocationId('tenant-1', 'emp-1', day('2026-07-11')),
      ).resolves.toBe('loc-hq');
    });

    it('resolves exactly one effective location per date', async () => {
      const second = { ...override, id: 'a-roster-2', locationId: 'loc-other' };
      const service = new ShiftResolutionService(
        prismaMock({ assignments: [base, override, second], employeeLocationId: 'loc-hq' }) as never,
      );
      const resolved = await service.effectiveLocationId('tenant-1', 'emp-1', day('2026-07-10'));
      expect(typeof resolved).toBe('string');
    });

    it('reads the base location straight off the employee record', async () => {
      const prisma = prismaMock({ employeeLocationId: 'loc-hq' });
      const service = new ShiftResolutionService(prisma as never);
      await expect(service.employeeLocationId('tenant-1', 'emp-1')).resolves.toBe('loc-hq');
      expect(prisma.employee.findFirst).toHaveBeenCalledWith({
        where: { id: 'emp-1', tenantId: 'tenant-1' },
        select: { locationId: true },
      });
    });
  });

  describe('activeShiftCounts', () => {
    it('counts each employee once, on the shift that actually governs today', async () => {
      const prisma = prismaMock({
        assignments: [base, override],
        employees: [{ id: 'emp-1' }, { id: 'emp-2' }],
      });
      const service = new ShiftResolutionService(prisma as never);

      const counts = await service.activeShiftCounts('tenant-1', day('2026-07-10'));

      // emp-1 resolves to the roster override, emp-2 has none and lands on the
      // tenant default. No employee is counted twice, and expired rows never
      // inflate the total the way a lifetime assignment count did.
      expect(counts.get('shift-night')).toBe(1);
      expect(counts.get('shift-tenant-default')).toBe(1);
      expect(counts.get('shift-day')).toBeUndefined();
      expect([...counts.values()].reduce((sum, value) => sum + value, 0)).toBe(2);
    });

    it('leaves unassigned employees uncounted when the tenant has no shifts', async () => {
      const prisma = prismaMock({ assignments: [], defaultShift: null, employees: [{ id: 'emp-1' }] });
      const service = new ShiftResolutionService(prisma as never);
      await expect(service.activeShiftCounts('tenant-1', day('2026-07-10'))).resolves.toEqual(
        new Map(),
      );
    });
  });
});
