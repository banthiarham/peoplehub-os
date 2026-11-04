import { randomUUID } from 'crypto';
import { PrismaService } from '../../common/database/prisma.service';
import { AuthUser } from '../../common/types/auth-user';
import { PayrollPolicyService } from '../payroll/payroll-policy.service';
import { AttendanceService } from './attendance.service';
import { ShiftResolutionService } from './shift-resolution.service';

/**
 * Tenant-configurable comp-off expiry, against PostgreSQL.
 *
 * The two things a mock cannot vouch for here are both about *resolution*: that a policy row
 * actually persists the new enum and integer columns the migration added, and that two
 * tenants configured differently really do resolve differently rather than sharing a cached
 * or leaked value. Both are exercised through the real `PayrollPolicyService` and the real
 * `AttendanceService`, against rows this suite writes and removes.
 *
 * The behavioural matrix (FORFEIT vs PAY_OUT vs NOT_ENFORCED at every boundary) is covered by
 * the unit suites; what is here is what only a database can answer.
 *
 * Safety is identical to the sibling suites: an explicit `TEST_DATABASE_URL` naming
 * `peoplehub_os_test`, passed straight to the client, and no `.env` fallback.
 */

const REQUIRED_DATABASE = 'peoplehub_os_test';

function resolveTestDatabaseUrl(): string | null {
  const url = process.env.TEST_DATABASE_URL?.trim();
  if (!url) return null;
  try {
    const database = new URL(url).pathname.replace(/^\//, '');
    return database === REQUIRED_DATABASE ? url : null;
  } catch {
    return null;
  }
}

const testDatabaseUrl = resolveTestDatabaseUrl();
const describeIntegration = testDatabaseUrl ? describe : describe.skip;

if (!testDatabaseUrl) {
  // eslint-disable-next-line no-console
  console.warn(
    `[comp-off expiry policy] skipped: set TEST_DATABASE_URL to a ${REQUIRED_DATABASE} database to run it.`,
  );
}

class TestPrismaService extends PrismaService {
  constructor(url: string) {
    super({ datasources: { db: { url } } });
  }
}

describeIntegration('tenant-configurable comp-off expiry (PostgreSQL)', () => {
  let prisma: TestPrismaService;
  let policies: PayrollPolicyService;
  let attendance: AttendanceService;

  beforeAll(async () => {
    prisma = new TestPrismaService(testDatabaseUrl as string);
    await prisma.$connect();
    policies = new PayrollPolicyService(prisma);
    const unused = new Proxy(
      {},
      {
        get(_target, property) {
          throw new Error(`Unexpected dependency call: ${String(property)}`);
        },
      },
    ) as never;
    // The shift resolver is real: a successful `USED` decision runs the weekly-off check,
    // which reads the employee's shift from the same database. The device and QR services
    // are genuinely unreachable from this path and stay unreachable.
    attendance = new AttendanceService(
      prisma,
      new ShiftResolutionService(prisma),
      unused,
      unused,
      policies,
    );
  }, 30_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  interface TenantFixture {
    tenantId: string;
    employeeId: string;
    user: AuthUser;
  }

  /**
   * Two independent tenants, each with its own payroll policy, handed to `body` together.
   * Everything is removed afterwards by id, child-first, whatever the body does.
   */
  async function withTenants(
    specs: Array<{ expiryDays?: number | null; treatment?: 'NOT_ENFORCED' | 'FORFEIT' | 'PAY_OUT' }>,
    body: (tenants: TenantFixture[]) => Promise<void>,
  ): Promise<void> {
    const suffix = randomUUID();
    const tenantIds: string[] = [];
    const employeeIds: string[] = [];
    const policyIds: string[] = [];
    const tenants: TenantFixture[] = [];

    try {
      for (const [index, spec] of specs.entries()) {
        const tenant = await prisma.tenant.create({
          data: { name: `Expiry ${index} ${suffix}`, slug: `expiry-${index}-${suffix}` },
        });
        tenantIds.push(tenant.id);

        const policy = await prisma.payrollPolicy.create({
          data: {
            tenantId: tenant.id,
            locationId: null,
            isDefault: true,
            compOffEnabled: true,
            compOffUsagePeriod: 'ANNUAL',
            compOffExpiryDays: spec.expiryDays ?? null,
            compOffExpiryTreatment: spec.treatment ?? 'NOT_ENFORCED',
          },
        });
        policyIds.push(policy.id);

        const employee = await prisma.employee.create({
          data: {
            tenantId: tenant.id,
            employeeCode: `EX-${index}-${suffix.slice(0, 8)}`,
            firstName: 'Asha',
            lastName: 'Shah',
            status: 'ACTIVE',
          },
        });
        employeeIds.push(employee.id);

        tenants.push({
          tenantId: tenant.id,
          employeeId: employee.id,
          user: {
            userId: `user-${index}-${suffix}`,
            tenantId: tenant.id,
            email: 'hr@example.test',
            name: 'HR Admin',
            isSuperAdmin: false,
            employeeId: null,
            roles: ['HR Admin'],
          },
        });
      }

      await body(tenants);
    } finally {
      await prisma.compOffGrant.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.payrollPolicy.deleteMany({ where: { id: { in: policyIds } } });
      await prisma.employee.deleteMany({ where: { id: { in: employeeIds } } });
      await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    }
  }

  const dayOf = (date: Date | null) => date?.toISOString().slice(0, 10);

  /**
   * The ground a usage needs before the expiry rule is the thing deciding it.
   *
   * `assertCompOffExactDurationMatch` refuses any usage whose month is not finalized and whose
   * target date is not an unpaid absence of exactly the grant's duration. Those are earlier
   * gates than expiry, so without this fixture a tenant that *should* allow the usage is
   * refused for an unrelated reason and the test proves nothing about expiry. Planted for
   * every tenant in the comparison, so the treatment column stays the only difference between
   * them.
   */
  async function finalizeMonthWithFullDayAbsence(
    tenantId: string,
    employeeId: string,
    date: string,
  ): Promise<void> {
    const day = new Date(`${date}T00:00:00.000Z`);
    await prisma.attendanceFinalization.create({
      data: {
        tenantId,
        month: day.getUTCMonth() + 1,
        year: day.getUTCFullYear(),
        locationId: null,
        status: 'FINALIZED',
      },
    });
    // A full-day ABSENT record scores 1.0 through the shared absence resolver, matching the
    // 1-day grant `createCompOff` credits by default.
    await prisma.attendanceRecord.create({
      data: { tenantId, employeeId, date: day, status: 'ABSENT', isFinalized: true },
    });
  }

  it('1. persists and resolves the new columns', async () => {
    await withTenants([{ expiryDays: 45, treatment: 'PAY_OUT' }], async ([tenant]) => {
      const resolved = await policies.resolve(tenant.tenantId, null);

      expect(resolved).toMatchObject({
        compOffExpiryDays: 45,
        compOffExpiryTreatment: 'PAY_OUT',
      });
    });
  });

  it('2. an unconfigured tenant resolves to the legacy behaviour', async () => {
    // No policy row at all - the in-code fallback, which is what every tenant that never
    // touches this feature keeps getting.
    const suffix = randomUUID();
    const tenant = await prisma.tenant.create({
      data: { name: `Bare ${suffix}`, slug: `bare-${suffix}` },
    });
    try {
      const resolved = await policies.resolve(tenant.id, null);
      expect(resolved).toMatchObject({
        compOffExpiryDays: null,
        compOffExpiryTreatment: 'NOT_ENFORCED',
      });
    } finally {
      await prisma.tenant.deleteMany({ where: { id: tenant.id } });
    }
  });

  it('3. two tenants stamp different expiry dates for the same earned day', async () => {
    await withTenants(
      [{ expiryDays: 30 }, { expiryDays: 365 }],
      async ([short, long]) => {
        const earnedDate = '2026-08-15';

        const shortGrant = await attendance.createCompOff(short.tenantId, {
          employeeId: short.employeeId,
          earnedDate,
        });
        const longGrant = await attendance.createCompOff(long.tenantId, {
          employeeId: long.employeeId,
          earnedDate,
        });

        expect(dayOf(shortGrant.expiresAt)).toBe('2026-09-14');
        expect(dayOf(longGrant.expiresAt)).toBe('2027-08-15');
      },
    );
  });

  it("4. one tenant's policy does not reach another tenant's grants", async () => {
    // The second tenant configures nothing, so it must keep the 90-day default rather than
    // inherit the first tenant's 10-day window.
    await withTenants([{ expiryDays: 10 }, {}], async ([configured, bare]) => {
      const earnedDate = '2026-08-15';

      const configuredGrant = await attendance.createCompOff(configured.tenantId, {
        employeeId: configured.employeeId,
        earnedDate,
      });
      const bareGrant = await attendance.createCompOff(bare.tenantId, {
        employeeId: bare.employeeId,
        earnedDate,
      });

      expect(dayOf(configuredGrant.expiresAt)).toBe('2026-08-25');
      expect(dayOf(bareGrant.expiresAt)).toBe('2026-11-13');
    });
  });

  it('5. enforcement is per tenant: the same date is refused for one and allowed for the other', async () => {
    await withTenants(
      [{ expiryDays: 10, treatment: 'FORFEIT' }, { expiryDays: 10, treatment: 'NOT_ENFORCED' }],
      async ([enforced, legacy]) => {
        const earnedDate = '2026-08-03';
        // Both grants expire 13 Aug 2026; 17 Aug is a Monday in the same calendar year, so
        // under an ANNUAL period only the expiry rule can separate these two outcomes.
        const usedOnDate = '2026-08-17';

        await finalizeMonthWithFullDayAbsence(enforced.tenantId, enforced.employeeId, usedOnDate);
        await finalizeMonthWithFullDayAbsence(legacy.tenantId, legacy.employeeId, usedOnDate);

        const enforcedGrant = await attendance.createCompOff(enforced.tenantId, {
          employeeId: enforced.employeeId,
          earnedDate,
        });
        const legacyGrant = await attendance.createCompOff(legacy.tenantId, {
          employeeId: legacy.employeeId,
          earnedDate,
        });
        expect(dayOf(enforcedGrant.expiresAt)).toBe('2026-08-13');

        await expect(
          attendance.decideCompOff(enforced.user, enforcedGrant.id, {
            status: 'USED' as never,
            usedOnDate,
          }),
        ).rejects.toThrow('has expired and can no longer be used');

        const used = await attendance.decideCompOff(legacy.user, legacyGrant.id, {
          status: 'USED' as never,
          usedOnDate,
        });
        expect(used.status).toBe('USED');

        // And the refused one is untouched, not half-transitioned.
        const refused = await prisma.compOffGrant.findUniqueOrThrow({ where: { id: enforcedGrant.id } });
        expect(refused.status).toBe('AVAILABLE');
        expect(refused.usedOnDate).toBeNull();
      },
    );
  }, 30_000);

  it('6. changing the policy does not re-date a grant that already exists', async () => {
    await withTenants([{ expiryDays: 10 }], async ([tenant]) => {
      const grant = await attendance.createCompOff(tenant.tenantId, {
        employeeId: tenant.employeeId,
        earnedDate: '2026-08-15',
      });
      expect(dayOf(grant.expiresAt)).toBe('2026-08-25');

      await prisma.payrollPolicy.updateMany({
        where: { tenantId: tenant.tenantId },
        data: { compOffExpiryDays: 365 },
      });

      const unchanged = await prisma.compOffGrant.findUniqueOrThrow({ where: { id: grant.id } });
      expect(dayOf(unchanged.expiresAt)).toBe('2026-08-25');
    });
  });
});
