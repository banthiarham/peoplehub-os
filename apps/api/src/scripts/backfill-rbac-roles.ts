/**
 * Idempotent backfill: gives every existing tenant the system roles it is missing.
 *
 * Production-safety properties:
 *  - purely additive. No role, permission, or user-role assignment is ever updated or deleted.
 *  - roles that already exist keep their current permissions untouched.
 *  - re-running performs zero writes.
 *
 * Usage (from apps/api):
 *   npm run rbac:backfill                    # dry run, reports what would change
 *   npm run rbac:backfill -- --apply         # writes
 *   npm run rbac:backfill -- --apply --tenant=<tenantId>
 *   npm run rbac:backfill -- --apply --batch=25
 */
import { PrismaClient } from '@prisma/client';
import { ensureTenantRoles, missingCatalogRoleNames, SYSTEM_ROLE_NAMES } from '../modules/rbac/role-catalog';

const argv = process.argv.slice(2);
const hasFlag = (name: string) => argv.includes(`--${name}`);
const flagValue = (name: string) => argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];

const APPLY = hasFlag('apply');
const TENANT_ID = flagValue('tenant');
const BATCH = Math.max(Number(flagValue('batch') ?? 50) || 50, 1);

async function main() {
  const prisma = new PrismaClient();
  const mode = APPLY ? 'APPLY' : 'DRY RUN';
  console.log(`[rbac-backfill] mode=${mode} catalog=${SYSTEM_ROLE_NAMES.length} roles${TENANT_ID ? ` tenant=${TENANT_ID}` : ''}`);

  let scanned = 0;
  let changedTenants = 0;
  let createdRoles = 0;
  let cursor: string | undefined;

  try {
    if (TENANT_ID) {
      const target = await prisma.tenant.findUnique({ where: { id: TENANT_ID }, select: { id: true } });
      if (!target) {
        throw new Error(`Tenant not found: ${TENANT_ID}. No tenant was scanned and nothing was written.`);
      }
    }

    for (;;) {
      const tenants = await prisma.tenant.findMany({
        where: TENANT_ID ? { id: TENANT_ID } : undefined,
        select: { id: true, slug: true },
        orderBy: { id: 'asc' },
        take: BATCH,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (!tenants.length) break;
      cursor = tenants[tenants.length - 1].id;

      for (const tenant of tenants) {
        scanned += 1;
        const missing = await missingCatalogRoleNames(prisma, tenant.id);
        if (!missing.length) continue;

        changedTenants += 1;
        createdRoles += missing.length;
        console.log(`[rbac-backfill] ${tenant.slug} (${tenant.id}): +${missing.length} -> ${missing.join(', ')}`);

        if (!APPLY) continue;

        await prisma.$transaction(async (tx) => {
          const { created } = await ensureTenantRoles(tx, tenant.id);
          if (created.length) {
            await tx.auditLog.create({
              data: {
                tenantId: tenant.id,
                actorEmail: 'system:rbac-backfill',
                action: 'rbac.backfill.roles_created',
                objectType: 'Tenant',
                objectId: tenant.id,
                newValue: { createdRoles: created },
                reason: 'Idempotent system role catalog backfill',
              },
            });
          }
        });
      }

      if (TENANT_ID) break;
    }

    console.log(
      `[rbac-backfill] done. tenants scanned=${scanned} tenants ${APPLY ? 'updated' : 'needing update'}=${changedTenants} roles ${APPLY ? 'created' : 'to create'}=${createdRoles}`,
    );
    if (!APPLY && changedTenants > 0) {
      console.log('[rbac-backfill] no changes written. Re-run with --apply to persist.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[rbac-backfill] failed:', err);
  process.exit(1);
});
