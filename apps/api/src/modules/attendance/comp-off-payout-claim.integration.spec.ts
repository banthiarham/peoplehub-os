import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../../common/database/prisma.service';
import { AuthUser } from '../../common/types/auth-user';
import { PayrollService } from '../payroll/payroll.service';
import { AttendanceService } from './attendance.service';

/**
 * The race `CompOffGrant.paidInPayrollRunId` exists to settle, exercised against PostgreSQL.
 *
 * `decideCompOff` and `lockRun` both used to check a grant and then write in separate
 * autocommit statements under Read Committed, so either could commit inside the other's gap
 * and leave one grant both paid and consumed. Both now contend for the same row with a
 * conditional update - attendance on `paidInPayrollRunId: null`, payroll on `status:
 * AVAILABLE AND paidInPayrollRunId IS NULL` - so the database picks exactly one winner.
 *
 * None of that is observable through a mock. The tests below use two independent clients on
 * two connections, and the ones that need an interleaving hold a real open transaction over a
 * barrier so the loser genuinely blocks on a row lock rather than merely running second.
 * Where a test can only sequence operations, it says so rather than claiming concurrency.
 *
 * Safety is identical to the sibling guard suite: an explicit `TEST_DATABASE_URL` naming
 * `peoplehub_os_test`, passed straight to each client, and no `.env` fallback.
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
    `[comp-off payout claim] skipped: set TEST_DATABASE_URL to a ${REQUIRED_DATABASE} database to run it.`,
  );
}

class TestPrismaService extends PrismaService {
  constructor(url: string) {
    super({ datasources: { db: { url } } });
  }
}

/** A promise a test resolves by hand, so one side waits for the other rather than for a clock. */
function barrier(): { wait: Promise<void>; release: () => void } {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { wait, release };
}

describeIntegration('comp-off payout claims under concurrency (PostgreSQL)', () => {
  // Two clients, so two connections: a transaction open on one genuinely blocks the other,
  // which is the whole point. One client cannot block itself.
  let primary: TestPrismaService;
  let secondary: TestPrismaService;
  /** Third connection, used only to ask PostgreSQL whether anyone is actually blocked. */
  let observer: TestPrismaService;
  let attendance: AttendanceService;
  let payroll: PayrollService;

  const unusedDependency = () =>
    new Proxy(
      {},
      {
        get(_target, property) {
          throw new Error(`Unexpected dependency call: ${String(property)}`);
        },
      },
    ) as never;

  beforeAll(async () => {
    primary = new TestPrismaService(testDatabaseUrl as string);
    secondary = new TestPrismaService(testDatabaseUrl as string);
    observer = new TestPrismaService(testDatabaseUrl as string);
    await Promise.all([primary.$connect(), secondary.$connect(), observer.$connect()]);

    attendance = new AttendanceService(
      primary,
      unusedDependency(),
      unusedDependency(),
      unusedDependency(),
      unusedDependency(),
    );
    payroll = new PayrollService(
      primary,
      unusedDependency(),
      unusedDependency(),
      unusedDependency(),
      { isSnapshotStale: async () => false } as never,
    );
  }, 30_000);

  afterAll(async () => {
    await Promise.all([primary?.$disconnect(), secondary?.$disconnect(), observer?.$disconnect()]);
  });

  interface GrantSpec {
    /** Defaults to AVAILABLE. */
    status?: 'AVAILABLE' | 'USED' | 'CANCELLED' | 'EXPIRED';
    paidInPayrollRunId?: string | null;
  }

  interface RunSpec {
    status: 'DRAFT' | 'REVIEW' | 'APPROVED' | 'LOCKED' | 'PUBLISHED' | 'CLOSED';
    /** Indexes into the fixture's grants; `'FOREIGN'` injects an id belonging to nobody. */
    pays?: Array<number | 'FOREIGN'>;
    /** Written verbatim into `metadata.grantIds`, bypassing `pays` - for duplicate-id cases. */
    rawGrantIds?: string[];
  }

  interface Fixture {
    tenantId: string;
    employeeId: string;
    grantIds: string[];
    runIds: string[];
    user: AuthUser;
  }

  async function withFixture(
    spec: { grants?: GrantSpec[]; runs?: RunSpec[] },
    body: (fixture: Fixture) => Promise<void>,
  ): Promise<void> {
    const suffix = randomUUID();
    const tenantIds: string[] = [];
    const employeeIds: string[] = [];
    const runIds: string[] = [];
    const grantIds: string[] = [];

    try {
      const tenant = await primary.tenant.create({
        data: { name: `Claim ${suffix}`, slug: `claim-${suffix}` },
      });
      tenantIds.push(tenant.id);

      const employee = await primary.employee.create({
        data: {
          tenantId: tenant.id,
          employeeCode: `CL-${suffix.slice(0, 8)}`,
          firstName: 'Asha',
          lastName: 'Shah',
          status: 'ACTIVE',
        },
      });
      employeeIds.push(employee.id);

      for (const grantSpec of spec.grants ?? [{}]) {
        const grant = await primary.compOffGrant.create({
          data: {
            tenantId: tenant.id,
            employeeId: employee.id,
            earnedDate: new Date(Date.UTC(2026, 6, 5)),
            days: 1,
            status: grantSpec.status ?? 'AVAILABLE',
            paidInPayrollRunId: grantSpec.paidInPayrollRunId ?? null,
          },
        });
        grantIds.push(grant.id);
      }

      for (const runSpec of spec.runs ?? []) {
        const run = await primary.payrollRun.create({
          data: { tenantId: tenant.id, month: 12, year: 2026, status: runSpec.status },
        });
        runIds.push(run.id);
        await primary.payrollRunEmployee.create({
          data: {
            payrollRunId: run.id,
            employeeId: employee.id,
            components: [],
            errors: [],
            warnings: [],
          },
        });

        const paid =
          runSpec.rawGrantIds ??
          (runSpec.pays ?? []).map((index) =>
            index === 'FOREIGN' ? `grant-from-elsewhere-${suffix}` : grantIds[index],
          );
        if (paid.length) {
          await primary.payrollVariableInput.create({
            data: {
              tenantId: tenant.id,
              employeeId: employee.id,
              payrollRunId: run.id,
              month: 12,
              year: 2026,
              type: 'COMP_OFF_PAYOUT',
              label: `Unused comp-off payout (${paid.length} day(s))`,
              amount: 838.71 * paid.length,
              taxable: true,
              status: 'APPROVED',
              source: 'COMP_OFF',
              metadata: { grantIds: paid, days: paid.length, dailyRate: 838.71 },
            },
          });
        }
      }

      await body({
        tenantId: tenant.id,
        employeeId: employee.id,
        grantIds,
        runIds,
        user: {
          userId: `user-${suffix}`,
          tenantId: tenant.id,
          email: 'hr@example.test',
          name: 'HR Admin',
          isSuperAdmin: false,
          employeeId: null,
          roles: ['HR Admin'],
        },
      });
    } finally {
      await primary.payrollVariableInput.deleteMany({ where: { payrollRunId: { in: runIds } } });
      await primary.compOffGrant.deleteMany({ where: { id: { in: grantIds } } });
      await primary.payrollRun.deleteMany({ where: { id: { in: runIds } } });
      await primary.employee.deleteMany({ where: { id: { in: employeeIds } } });
      await primary.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    }
  }

  const grantRow = (id: string) => primary.compOffGrant.findUniqueOrThrow({ where: { id } });

  /**
   * Blocks until PostgreSQL itself reports a session waiting on a lock, so the handshake is
   * driven by observed database state rather than by a guessed delay. Returns false if none
   * appears in time, which leaves the assertions to decide - a test must never hang here.
   */
  async function waitForLockWaiter(timeoutMs = 10_000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const [{ waiting }] = await observer.$queryRaw<Array<{ waiting: bigint }>>`
        SELECT count(*) AS waiting
          FROM pg_stat_activity
         WHERE datname = current_database()
           AND wait_event_type = 'Lock'
      `;
      if (Number(waiting) > 0) return true;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return false;
  }

  const cancel = (fixture: Fixture, grantId: string) =>
    attendance.decideCompOff(fixture.user, grantId, { status: 'CANCELLED' as never });

  /**
   * Holds the production claim statement open in a transaction on the secondary connection,
   * runs `while Held`, then commits. The row lock is real, so anything `whileHeld` does to
   * that grant blocks until the release.
   */
  async function holdingClaim<T>(
    tenantId: string,
    grantId: string,
    runId: string,
    whileHeld: () => Promise<T>,
  ): Promise<{ claimed: number; held: T; blocked: boolean }> {
    const taken = barrier();
    const release = barrier();
    let claimed = 0;

    const transaction = secondary.$transaction(
      async (tx) => {
        const result = await tx.compOffGrant.updateMany({
          where: { id: { in: [grantId] }, tenantId, status: 'AVAILABLE', paidInPayrollRunId: null },
          data: { paidInPayrollRunId: runId },
        });
        claimed = result.count;
        // Announce the row lock is held, then hold it until the test says otherwise.
        taken.release();
        await release.wait;
        return result.count;
      },
      { timeout: 30_000 },
    );

    // Ordering established by the work itself, not by a sleep: nothing else starts until the
    // claim statement has returned inside the still-open transaction.
    await taken.wait;

    // Started, not awaited: it is expected to block on the row lock the transaction holds,
    // and awaiting it here would deadlock the test against its own release.
    const pending = whileHeld();
    let blocked = false;
    try {
      blocked = await waitForLockWaiter();
    } finally {
      // Always released, even if the wait threw: an unreleased barrier would hang the holding
      // transaction to its own timeout and bury the real failure under a timeout error.
      release.release();
      await transaction.catch(() => undefined);
    }
    // Reported rather than asserted here, so each caller fails with its own name attached.
    // A false here means PostgreSQL never saw anyone waiting on a lock, which would make the
    // test a sequential one wearing a concurrency label - it must fail, never pass quietly.
    return { claimed, held: await pending, blocked };
  }

  it('1. a decision committed first makes the lock fail rather than pay a consumed grant', async () => {
    await withFixture(
      { grants: [{}], runs: [{ status: 'APPROVED', pays: [0] }] },
      async (fixture) => {
        const [grantId] = fixture.grantIds;
        const [runId] = fixture.runIds;

        await cancel(fixture, grantId);

        await expect(payroll.lockRun(fixture.tenantId, runId, 'user-1')).rejects.toThrow(
          `${grantId} (cancelled)`,
        );
        const run = await primary.payrollRun.findUniqueOrThrow({ where: { id: runId } });
        expect(run.status).toBe('APPROVED');
        expect((await grantRow(grantId)).paidInPayrollRunId).toBeNull();
      },
    );
  });

  it('2. a claim held open blocks a concurrent decision, which then loses cleanly', async () => {
    await withFixture(
      { grants: [{}], runs: [{ status: 'APPROVED', pays: [0] }] },
      async (fixture) => {
        const [grantId] = fixture.grantIds;
        const [runId] = fixture.runIds;

        // The decision runs on the primary connection while the secondary holds the claim, so
        // its own conditional update waits on the row lock instead of racing a clock.
        const { claimed, held, blocked } = await holdingClaim(fixture.tenantId, grantId, runId, async () =>
          cancel(fixture, grantId).then(
            () => 'resolved' as const,
            (error: Error) => error.message,
          ),
        );

        // PostgreSQL actually reported the decision waiting on the claim's row lock. Without
        // this the two could have run one after the other and the test would still be green.
        expect(blocked).toBe(true);
        expect(claimed).toBe(1);
        expect(held).toContain(`paid out by payroll run ${runId}`);
        const grant = await grantRow(grantId);
        expect(grant.status).toBe('AVAILABLE');
        expect(grant.paidInPayrollRunId).toBe(runId);
      },
      );
  }, 30_000);

  it('3. two runs racing for one grant: exactly one claim survives', async () => {
    await withFixture(
      { grants: [{}], runs: [{ status: 'APPROVED', pays: [0] }, { status: 'APPROVED', pays: [0] }] },
      async (fixture) => {
        const [grantId] = fixture.grantIds;
        const [firstRun, secondRun] = fixture.runIds;

        // The second run's real `lockRun` runs while the first run's claim is held open.
        const { claimed, held, blocked } = await holdingClaim(fixture.tenantId, grantId, firstRun, async () =>
          payroll.lockRun(fixture.tenantId, secondRun, 'user-1').then(
            () => 'locked' as const,
            (error: Error) => error.message,
          ),
        );

        expect(blocked).toBe(true);
        expect(claimed).toBe(1);
        expect(held).toContain(`already paid by run ${firstRun}`);
        expect((await grantRow(grantId)).paidInPayrollRunId).toBe(firstRun);
        const loser = await primary.payrollRun.findUniqueOrThrow({ where: { id: secondRun } });
        expect(loser.status).toBe('APPROVED');
      },
    );
  }, 30_000);

  it('4. a failure after claiming rolls every claim back', async () => {
    await withFixture({ grants: [{}, {}] }, async (fixture) => {
      const runId = `run-rollback-${randomUUID()}`;

      await expect(
        primary.$transaction(async (tx) => {
          const claimed = await tx.compOffGrant.updateMany({
            where: {
              id: { in: fixture.grantIds },
              tenantId: fixture.tenantId,
              status: 'AVAILABLE',
              paidInPayrollRunId: null,
            },
            data: { paidInPayrollRunId: runId },
          });
          expect(claimed.count).toBe(2);
          throw new Error('status transition failed');
        }),
      ).rejects.toThrow('status transition failed');

      for (const grantId of fixture.grantIds) {
        expect((await grantRow(grantId)).paidInPayrollRunId).toBeNull();
      }
    });
  });

  it('5. a successful lock finalizes ownership and blocks every later decision', async () => {
    await withFixture(
      { grants: [{}], runs: [{ status: 'APPROVED', pays: [0] }] },
      async (fixture) => {
        const [grantId] = fixture.grantIds;
        const [runId] = fixture.runIds;

        await expect(payroll.lockRun(fixture.tenantId, runId, 'user-1')).resolves.toMatchObject({
          status: 'LOCKED',
        });
        expect((await grantRow(grantId)).paidInPayrollRunId).toBe(runId);

        // Refused by the Phase 4E guard first, which reports the frozen run by name.
        await expect(cancel(fixture, grantId)).rejects.toThrow('which is locked');
        expect((await grantRow(grantId)).status).toBe('AVAILABLE');
      },
    );
  });

  it('6. a REVIEW run holds no claim, so the grant stays decidable and nothing strands', async () => {
    await withFixture(
      { grants: [{}], runs: [{ status: 'REVIEW', pays: [0] }] },
      async (fixture) => {
        const [grantId] = fixture.grantIds;

        expect((await grantRow(grantId)).paidInPayrollRunId).toBeNull();
        await expect(cancel(fixture, grantId)).resolves.toMatchObject({ status: 'CANCELLED' });
        expect((await grantRow(grantId)).paidInPayrollRunId).toBeNull();
      },
    );
  });

  it('9. a payout naming another tenant\'s grant claims nothing', async () => {
    await withFixture(
      { grants: [{}], runs: [{ status: 'APPROVED', pays: ['FOREIGN'] }] },
      async (fixture) => {
        await expect(payroll.lockRun(fixture.tenantId, fixture.runIds[0], 'user-1')).rejects.toThrow(
          '(missing)',
        );
        expect((await grantRow(fixture.grantIds[0])).paidInPayrollRunId).toBeNull();
      },
    );
  });

  it('10. one ineligible grant prevents partial ownership of the rest', async () => {
    await withFixture(
      { grants: [{}, { status: 'USED' }, {}], runs: [{ status: 'APPROVED', pays: [0, 1, 2] }] },
      async (fixture) => {
        await expect(payroll.lockRun(fixture.tenantId, fixture.runIds[0], 'user-1')).rejects.toThrow(
          `${fixture.grantIds[1]} (used)`,
        );

        // All three, not just the two that were claimable: the transaction took them back.
        for (const grantId of fixture.grantIds) {
          expect((await grantRow(grantId)).paidInPayrollRunId).toBeNull();
        }
      },
    );
  });

  it('11. a grant id repeated in the payout metadata still locks', async () => {
    await withFixture({ grants: [{}] }, async (fixture) => {
      const [grantId] = fixture.grantIds;
      const run = await primary.payrollRun.create({
        data: { tenantId: fixture.tenantId, month: 12, year: 2026, status: 'APPROVED' },
      });
      try {
        await primary.payrollRunEmployee.create({
          data: {
            payrollRunId: run.id,
            employeeId: fixture.employeeId,
            components: [],
            errors: [],
            warnings: [],
          },
        });
        // Two inputs naming the same grant, and one of them naming it twice: three mentions,
        // one row. A naive count would expect three claims and refuse to lock.
        for (const grantIds of [[grantId, grantId], [grantId]]) {
          await primary.payrollVariableInput.create({
            data: {
              tenantId: fixture.tenantId,
              employeeId: fixture.employeeId,
              payrollRunId: run.id,
              month: 12,
              year: 2026,
              type: 'COMP_OFF_PAYOUT',
              label: 'Unused comp-off payout (1 day)',
              amount: 838.71,
              taxable: true,
              status: 'APPROVED',
              source: 'COMP_OFF',
              metadata: { grantIds, days: 1, dailyRate: 838.71 },
            },
          });
        }

        await expect(payroll.lockRun(fixture.tenantId, run.id, 'user-1')).resolves.toMatchObject({
          status: 'LOCKED',
        });
        expect((await grantRow(grantId)).paidInPayrollRunId).toBe(run.id);
      } finally {
        await primary.payrollVariableInput.deleteMany({ where: { payrollRunId: run.id } });
        await primary.payrollRun.deleteMany({ where: { id: run.id } });
      }
    });
  });

  /**
   * The migration's backfill, run as the migration actually wrote it rather than as a
   * paraphrase: the `DO $$ ... $$` block is read out of the migration file and executed
   * against seeded rows. It only ever writes `paidInPayrollRunId`, so replaying it is safe.
   */
  describe('historical backfill', () => {
    const backfillSql = (() => {
      const file = join(
        __dirname,
        '../../../../../packages/database/prisma/migrations/20261024120000_comp_off_paid_in_payroll_run/migration.sql',
      );
      const sql = readFileSync(file, 'utf8');
      const start = sql.indexOf('DO $$');
      if (start < 0) throw new Error('backfill block not found in migration');
      return sql.slice(start);
    })();

    const runBackfill = () => primary.$executeRawUnsafe(backfillSql);

    it('7. adopts ownership from a finalized run and ignores an unfinalized one', async () => {
      await withFixture(
        {
          grants: [{}, {}],
          runs: [
            { status: 'PUBLISHED', pays: [0] },
            { status: 'REVIEW', pays: [1] },
          ],
        },
        async (fixture) => {
          await runBackfill();

          // Paid by a published run: ownership is now recorded.
          expect((await grantRow(fixture.grantIds[0])).paidInPayrollRunId).toBe(fixture.runIds[0]);
          // Only generated by a REVIEW run, which reprocessing can still withdraw.
          expect((await grantRow(fixture.grantIds[1])).paidInPayrollRunId).toBeNull();
        },
      );
    });

    it('8. refuses to choose when two finalized runs claim the same grant', async () => {
      await withFixture(
        {
          grants: [{}],
          runs: [
            { status: 'LOCKED', pays: [0] },
            { status: 'CLOSED', pays: [0] },
          ],
        },
        async (fixture) => {
          await expect(runBackfill()).rejects.toThrow(
            /paid by more than one finalized payroll run/,
          );
          // Nothing was assigned on the way to failing.
          expect((await grantRow(fixture.grantIds[0])).paidInPayrollRunId).toBeNull();
        },
      );
    });
  });
});
