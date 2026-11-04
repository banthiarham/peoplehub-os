import { randomUUID } from 'crypto';
import { PrismaService } from '../../common/database/prisma.service';
import { AuthUser } from '../../common/types/auth-user';
import { PayrollService } from '../payroll/payroll.service';
import { AttendanceService } from './attendance.service';

/**
 * The one query in the Comp-Off guard that a hand-written Prisma mock cannot vouch for.
 *
 * `assertCompOffPayoutNotFrozen` decides whether a grant has already been paid by reading
 * the generated payout's own `metadata.grantIds` with a nested JSONB filter:
 *
 *   metadata: { path: ['grantIds'], array_contains: grant.id }
 *
 * Every other test of this guard answers that `findFirst` from a JavaScript fixture, so a
 * filter that matched *nothing* against a real PostgreSQL would still pass all of them - and
 * a guard that matches nothing is a guard that is not there. `array_contains` on a nested
 * path is also exactly the kind of Prisma filter whose scalar-versus-array argument handling
 * differs between providers, so the question is settled here against the database rather
 * than against the documentation.
 *
 * The suite therefore mocks nothing below the service: real rows, real `PrismaService`, real
 * `AttendanceService`, and the real `decideCompOff` entry point. `CANCELLED` is the status
 * used throughout because it reaches the guard on the shortest path - it skips
 * `validateCompOffUsage` and `assertPayrollPeriodOpen` entirely, so no payroll policy, shift,
 * holiday calendar or run-membership fixture is needed and nothing but the query under test
 * can decide the outcome.
 *
 * Safety: the suite runs only against an explicit `TEST_DATABASE_URL` naming the dedicated
 * `peoplehub_os_test` database, which is passed straight to the client. It never falls back
 * to `.env`, so an ordinary `npm test` on a developer machine skips it rather than writing
 * fixtures into the shared development database.
 */

/** The dedicated throwaway database this suite is allowed to touch. Nothing else qualifies. */
const REQUIRED_DATABASE = 'peoplehub_os_test';

/**
 * The configured URL, or null when it is absent or points somewhere this suite must not
 * write. Resolved before any client exists: a URL that fails this check never reaches Prisma.
 */
function resolveTestDatabaseUrl(): string | null {
  const url = process.env.TEST_DATABASE_URL?.trim();
  if (!url) return null;
  try {
    // `pathname` is `/<database>`; the query string (`?schema=public`) is not part of it.
    const database = new URL(url).pathname.replace(/^\//, '');
    return database === REQUIRED_DATABASE ? url : null;
  } catch {
    return null;
  }
}

const testDatabaseUrl = resolveTestDatabaseUrl();
const describeIntegration = testDatabaseUrl ? describe : describe.skip;

if (!testDatabaseUrl) {
  // Visible in the runner output, so a skipped suite is never mistaken for a passing one.
  // eslint-disable-next-line no-console
  console.warn(
    `[comp-off payout guard] skipped: set TEST_DATABASE_URL to a ${REQUIRED_DATABASE} database to run it.`,
  );
}

/** A real `PrismaService`, pointed at the test database rather than at `DATABASE_URL`. */
class TestPrismaService extends PrismaService {
  constructor(url: string) {
    super({ datasources: { db: { url } } });
  }
}

describeIntegration('assertCompOffPayoutNotFrozen (PostgreSQL)', () => {
  let prisma: TestPrismaService;
  let service: AttendanceService;
  let payroll: PayrollService;

  beforeAll(async () => {
    prisma = new TestPrismaService(testDatabaseUrl as string);
    await prisma.$connect();
    // Only `prisma` is exercised by the paths under test; the rest are constructor arguments
    // these tests never reach, stubbed so an accidental call fails loudly instead of silently.
    const unused = new Proxy(
      {},
      {
        get(_target, property) {
          throw new Error(`Unexpected dependency call: ${String(property)}`);
        },
      },
    );
    service = new AttendanceService(
      prisma,
      unused as never,
      unused as never,
      unused as never,
      unused as never,
    );
    // `approveRun`/`lockRun` consult exactly one policy method before the check under test;
    // a run with no recorded snapshot is never reported stale, so this is never reached in
    // practice and is present only to keep the dependency honest.
    const policies = { isSnapshotStale: async () => false };
    payroll = new PayrollService(
      prisma,
      unused as never,
      unused as never,
      unused as never,
      policies as never,
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  interface PayoutSpec {
    /** Ids written into `metadata.grantIds`; `'SELF'` is replaced by the grant's real id. */
    grantIds: Array<string | 'SELF'>;
    status: 'DRAFT' | 'REVIEW' | 'APPROVED' | 'LOCKED' | 'PUBLISHED' | 'CLOSED';
    /** True to attach the payout to a second tenant instead of the grant's own. */
    foreignTenant?: boolean;
    /**
     * Adds a clean `PayrollRunEmployee` entry, which `approveRun` requires before it will
     * consider a run at all. Cascade-deleted with its run, so it needs no cleanup of its own.
     */
    withEntry?: boolean;
  }

  interface Fixture {
    tenantId: string;
    employeeId: string;
    grantId: string;
    /** The payout runs created, in the order `payouts` listed them. */
    runIds: string[];
    user: AuthUser;
  }

  /**
   * Creates one isolated island of rows and hands it to `body`, then removes exactly those
   * rows again - by id, child-first, never by truncation - so the suite leaves the database
   * as it found it even when an assertion throws.
   */
  async function withFixture(
    payouts: PayoutSpec[],
    body: (fixture: Fixture) => Promise<void>,
  ): Promise<void> {
    const suffix = randomUUID();
    const createdTenantIds: string[] = [];
    const createdEmployeeIds: string[] = [];
    const createdRunIds: string[] = [];
    const createdInputIds: string[] = [];
    let grantId: string | undefined;

    try {
      const tenant = await prisma.tenant.create({
        data: { name: `Comp-Off Guard ${suffix}`, slug: `comp-off-guard-${suffix}` },
      });
      createdTenantIds.push(tenant.id);

      const employee = await prisma.employee.create({
        data: {
          tenantId: tenant.id,
          employeeCode: `CG-${suffix.slice(0, 8)}`,
          firstName: 'Asha',
          lastName: 'Shah',
          status: 'ACTIVE',
        },
      });
      createdEmployeeIds.push(employee.id);

      const grant = await prisma.compOffGrant.create({
        data: {
          tenantId: tenant.id,
          employeeId: employee.id,
          earnedDate: new Date(Date.UTC(2026, 6, 5)),
          days: 1,
        },
      });
      grantId = grant.id;

      for (const payout of payouts) {
        let payoutTenantId = tenant.id;
        let payoutEmployeeId = employee.id;

        if (payout.foreignTenant) {
          // A whole second tenant, with its own employee: the guard filters on `tenantId`
          // *and* `employeeId`, so sharing either one would not prove isolation.
          const otherTenant = await prisma.tenant.create({
            data: { name: `Other Tenant ${suffix}`, slug: `other-tenant-${suffix}` },
          });
          createdTenantIds.push(otherTenant.id);
          const otherEmployee = await prisma.employee.create({
            data: {
              tenantId: otherTenant.id,
              employeeCode: `CG-OTHER-${suffix.slice(0, 8)}`,
              firstName: 'Ravi',
              lastName: 'Kumar',
              status: 'ACTIVE',
            },
          });
          createdEmployeeIds.push(otherEmployee.id);
          payoutTenantId = otherTenant.id;
          payoutEmployeeId = otherEmployee.id;
        }

        const run = await prisma.payrollRun.create({
          data: { tenantId: payoutTenantId, month: 12, year: 2026, status: payout.status },
        });
        createdRunIds.push(run.id);

        if (payout.withEntry) {
          await prisma.payrollRunEmployee.create({
            data: {
              payrollRunId: run.id,
              employeeId: payoutEmployeeId,
              grossPay: 26838.71,
              totalDeductions: 0,
              netPay: 26838.71,
              components: [],
              errors: [],
              warnings: [],
            },
          });
        }

        const input = await prisma.payrollVariableInput.create({
          data: {
            tenantId: payoutTenantId,
            employeeId: payoutEmployeeId,
            payrollRunId: run.id,
            month: 12,
            year: 2026,
            type: 'COMP_OFF_PAYOUT',
            label: 'Unused comp-off payout (1 day)',
            amount: 838.71,
            taxable: true,
            status: 'APPROVED',
            source: 'COMP_OFF',
            metadata: {
              grantIds: payout.grantIds.map((id) => (id === 'SELF' ? grant.id : id)),
              days: 1,
              dailyRate: 838.71,
            },
          },
        });
        createdInputIds.push(input.id);
      }

      await body({
        tenantId: tenant.id,
        employeeId: employee.id,
        grantId: grant.id,
        runIds: [...createdRunIds],
        user: {
          userId: `user-${suffix}`,
          tenantId: tenant.id,
          email: 'hr@example.test',
          name: 'HR Admin',
          isSuperAdmin: false,
          // Deliberately not the grant's employee, so the self-approval rule stays out of it.
          employeeId: null,
          roles: ['HR Admin'],
        },
      });
    } finally {
      // Child-first, so no delete is refused by a foreign key still pointing at its parent.
      if (createdInputIds.length) {
        await prisma.payrollVariableInput.deleteMany({ where: { id: { in: createdInputIds } } });
      }
      if (grantId) {
        await prisma.compOffGrant.deleteMany({ where: { id: grantId } });
      }
      if (createdRunIds.length) {
        await prisma.payrollRun.deleteMany({ where: { id: { in: createdRunIds } } });
      }
      if (createdEmployeeIds.length) {
        await prisma.employee.deleteMany({ where: { id: { in: createdEmployeeIds } } });
      }
      if (createdTenantIds.length) {
        await prisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
      }
    }
  }

  const cancel = (fixture: Fixture) =>
    service.decideCompOff(fixture.user, fixture.grantId, { status: 'CANCELLED' as never });

  const statusOf = async (grantId: string) =>
    (await prisma.compOffGrant.findUniqueOrThrow({ where: { id: grantId } })).status;

  it('1. refuses to move a grant a PUBLISHED run already paid, and leaves it AVAILABLE', async () => {
    await withFixture([{ grantIds: ['SELF'], status: 'PUBLISHED' }], async (fixture) => {
      await expect(cancel(fixture)).rejects.toThrow(
        'This comp-off was already paid out in 2026-12 payroll, which is published',
      );
      expect(await statusOf(fixture.grantId)).toBe('AVAILABLE');
    });
  });

  it.each(['LOCKED', 'CLOSED'] as const)(
    '2. refuses the same grant when the paying run is %s',
    async (status) => {
      await withFixture([{ grantIds: ['SELF'], status }], async (fixture) => {
        await expect(cancel(fixture)).rejects.toThrow(
          `already paid out in 2026-12 payroll, which is ${status.toLowerCase()}`,
        );
        expect(await statusOf(fixture.grantId)).toBe('AVAILABLE');
      });
    },
  );

  it('3. allows cancellation when a PUBLISHED payout names only other grants', async () => {
    // The load-bearing negative. Tests 1 and 2 would also pass against a filter that matched
    // every row; only this one separates real containment from an ignored condition.
    await withFixture(
      [{ grantIds: ['grant-someone-else', 'grant-another'], status: 'PUBLISHED' }],
      async (fixture) => {
        await expect(cancel(fixture)).resolves.toMatchObject({ status: 'CANCELLED' });
        expect(await statusOf(fixture.grantId)).toBe('CANCELLED');
      },
    );
  });

  it('4. allows cancellation while the payout sits in a REVIEW run that can still be reprocessed', async () => {
    await withFixture([{ grantIds: ['SELF'], status: 'REVIEW' }], async (fixture) => {
      await expect(cancel(fixture)).resolves.toMatchObject({ status: 'CANCELLED' });
      expect(await statusOf(fixture.grantId)).toBe('CANCELLED');
    });
  });

  it("5. ignores a matching payout that belongs to another tenant's frozen run", async () => {
    await withFixture(
      [{ grantIds: ['SELF'], status: 'PUBLISHED', foreignTenant: true }],
      async (fixture) => {
        await expect(cancel(fixture)).resolves.toMatchObject({ status: 'CANCELLED' });
        expect(await statusOf(fixture.grantId)).toBe('CANCELLED');
      },
    );
  });

  /**
   * The other half of the bargain `decideCompOff` strikes at REVIEW.
   *
   * Letting a claimed grant still be decided is deliberate - it is how a late correction
   * reaches payroll - but it is only safe while something forces the run to be reprocessed
   * before it pays. These cover that gate at both boundaries, against real rows, so the
   * grant status and the payout's JSONB `grantIds` are the actual ones the guard reads.
   */
  describe('approval and locking revalidate the grants the run is paying', () => {
    it('5a. refuses to approve a REVIEW run paying a grant since marked USED', async () => {
      await withFixture(
        [{ grantIds: ['SELF'], status: 'REVIEW', withEntry: true }],
        async (fixture) => {
          await prisma.compOffGrant.update({
            where: { id: fixture.grantId },
            data: { status: 'USED', usedOnDate: new Date(Date.UTC(2026, 11, 10)) },
          });

          await expect(payroll.approveRun(fixture.tenantId, fixture.runIds[0], 'user-1')).rejects.toThrow(
            `grant(s) that changed since it was processed: ${fixture.grantId} (used)`,
          );
          expect(
            (await prisma.payrollRun.findUniqueOrThrow({ where: { id: fixture.runIds[0] } })).status,
          ).toBe('REVIEW');
        },
      );
    });

    it.each(['CANCELLED', 'EXPIRED'] as const)(
      '5b. refuses to lock an APPROVED run paying a grant since marked %s',
      async (status) => {
        await withFixture([{ grantIds: ['SELF'], status: 'APPROVED' }], async (fixture) => {
          await prisma.compOffGrant.update({ where: { id: fixture.grantId }, data: { status } });

          await expect(payroll.lockRun(fixture.tenantId, fixture.runIds[0], 'user-1')).rejects.toThrow(
            `${fixture.grantId} (${status.toLowerCase()})`,
          );
          expect(
            (await prisma.payrollRun.findUniqueOrThrow({ where: { id: fixture.runIds[0] } })).status,
          ).toBe('APPROVED');
        });
      },
    );

    it('5c. names the grant in the second array position too', async () => {
      // The gate reads the same JSONB array the attendance guard does, so containment has to
      // hold here as well - not just equality against the first element.
      await withFixture(
        [{ grantIds: ['grant-someone-else', 'SELF'], status: 'APPROVED' }],
        async (fixture) => {
          await prisma.compOffGrant.update({
            where: { id: fixture.grantId },
            data: { status: 'CANCELLED' },
          });

          await expect(payroll.lockRun(fixture.tenantId, fixture.runIds[0], 'user-1')).rejects.toThrow(
            `${fixture.grantId} (cancelled)`,
          );
        },
      );
    });

    it('6a. approves and locks normally while the paid grant is still AVAILABLE', async () => {
      await withFixture(
        [{ grantIds: ['SELF'], status: 'REVIEW', withEntry: true }],
        async (fixture) => {
          const [runId] = fixture.runIds;

          await expect(payroll.approveRun(fixture.tenantId, runId, 'user-1')).resolves.toMatchObject({
            status: 'APPROVED',
          });
          await expect(payroll.lockRun(fixture.tenantId, runId, 'user-1')).resolves.toMatchObject({
            status: 'LOCKED',
          });
          // And from LOCKED the existing attendance guard takes over, so the grant is frozen
          // for good rather than merely until someone remembers to reprocess.
          await expect(cancel(fixture)).rejects.toThrow('which is locked');
          expect(await statusOf(fixture.grantId)).toBe('AVAILABLE');
        },
      );
    });

    it('6b. approves a run whose payout names only grants from another tenant', async () => {
      // The revalidation is tenant-scoped: a foreign id resolves to no grant of ours. It is
      // reported as a mismatch rather than ignored, because this run cannot show what it pays.
      await withFixture(
        [{ grantIds: ['grant-from-elsewhere'], status: 'REVIEW', withEntry: true }],
        async (fixture) => {
          await expect(
            payroll.approveRun(fixture.tenantId, fixture.runIds[0], 'user-1'),
          ).rejects.toThrow('grant-from-elsewhere (missing)');
        },
      );
    });

    it('7. a run carrying no comp-off payout at all is unaffected', async () => {
      await withFixture([], async (fixture) => {
        const run = await prisma.payrollRun.create({
          data: { tenantId: fixture.tenantId, month: 12, year: 2026, status: 'REVIEW' },
        });
        try {
          await prisma.payrollRunEmployee.create({
            data: {
              payrollRunId: run.id,
              employeeId: fixture.employeeId,
              components: [],
              errors: [],
              warnings: [],
            },
          });

          await expect(payroll.approveRun(fixture.tenantId, run.id, 'user-1')).resolves.toMatchObject({
            status: 'APPROVED',
          });
        } finally {
          await prisma.payrollRun.deleteMany({ where: { id: run.id } });
        }
      });
    });
  });

  it('6. refuses a grant named second in a multi-element grantIds array', async () => {
    // Containment, not first-element equality: a filter comparing only `grantIds[0]` would
    // pass every test above and fail this one.
    await withFixture(
      [{ grantIds: ['grant-someone-else', 'SELF', 'grant-another'], status: 'PUBLISHED' }],
      async (fixture) => {
        await expect(cancel(fixture)).rejects.toThrow('already paid out in 2026-12 payroll');
        expect(await statusOf(fixture.grantId)).toBe('AVAILABLE');
      },
    );
  });
});
