/**
 * Single, final RBAC backfill: brings every tenant to the system role catalog.
 *
 * It does two things in one pass, so no second reconciliation run is needed:
 *   1. creates system roles the tenant is missing, with their full catalog permissions;
 *   2. adds catalog permission rows that an ALREADY EXISTING system role is missing.
 *
 * Production-safety properties:
 *  - purely additive. No role, permission or user-role assignment is ever updated or deleted.
 *  - existing role ids, user assignments, custom roles and manually added permissions survive.
 *  - a `(module, permissionType)` the tenant already holds at a different scope is reported
 *    as a scope conflict and left alone - the backfill never narrows or widens an existing scope.
 *  - user-role assignments are never created or replaced (see ASSIGNMENTS below).
 *  - re-running after --apply performs zero writes.
 *
 * ASSIGNMENTS: this script deliberately does not create `UserRole` rows. There is no safe
 * way to infer which user should receive a role, so assignment stays with the existing
 * product flows (signup creates the Tenant Owner assignment, employee creation creates the
 * Employee assignment). The run reports assignment counts so you can prove nothing moved,
 * and flags any tenant left without an active Tenant Owner for manual follow-up.
 *
 * Usage (from apps/api):
 *   npm run rbac:backfill                                  # dry run, reports what would change
 *   npm run rbac:backfill -- --apply                       # writes
 *   npm run rbac:backfill -- --tenant=<tenantId>           # dry run for one tenant
 *   npm run rbac:backfill -- --apply --tenant=<tenantId>
 *   npm run rbac:backfill -- --apply --batch=25
 */
import { PrismaClient } from '@prisma/client';
import { planTenantRbac, ensureTenantRoles, SYSTEM_ROLE_NAMES, TENANT_OWNER_ROLE } from '../modules/rbac/role-catalog';

const argv = process.argv.slice(2);
const hasFlag = (name: string) => argv.includes(`--${name}`);
const flagValue = (name: string) => argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];

const APPLY = hasFlag('apply');
const TENANT_ID = flagValue('tenant');
const BATCH = Math.max(Number(flagValue('batch') ?? 50) || 50, 1);

async function main() {
  const prisma = new PrismaClient();
  const mode = APPLY ? 'APPLY' : 'DRY RUN';
  console.log(
    `[rbac-backfill] mode=${mode} catalog=${SYSTEM_ROLE_NAMES.length} roles${TENANT_ID ? ` tenant=${TENANT_ID}` : ''}`,
  );

  let scanned = 0;
  let changedTenants = 0;
  let createdRoles = 0;
  let rolesAlreadyPresent = 0;
  let permissionRows = 0;
  // Never incremented: this script does not create assignments (see the header note).
  const assignmentsCreated = 0;
  let assignmentsPresent = 0;
  let scopeConflicts = 0;
  let failures = 0;
  const tenantsWithoutOwner: string[] = [];
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
        try {
          const plan = await planTenantRbac(prisma, tenant.id);
          rolesAlreadyPresent += plan.rolesPresent.length;
          scopeConflicts += plan.scopeConflicts.length;

          // Assignments are read-only here: counted so the run can prove nothing moved.
          assignmentsPresent += await prisma.userRole.count({ where: { user: { tenantId: tenant.id } } });
          const owners = await prisma.userRole.count({
            where: {
              user: { tenantId: tenant.id, isActive: true },
              role: { tenantId: tenant.id, name: TENANT_OWNER_ROLE },
            },
          });
          if (owners === 0) tenantsWithoutOwner.push(`${tenant.slug} (${tenant.id})`);

          for (const conflict of plan.scopeConflicts) {
            console.log(
              `[rbac-backfill] ${tenant.slug}: scope conflict on ${conflict.roleName} ${conflict.module}/${conflict.permissionType} ` +
                `existing=${conflict.existingScope} catalog=${conflict.catalogScope} ` +
                `(${conflict.existingIsWider ? 'existing is wider' : 'existing is narrower'}) - left unchanged`,
            );
          }

          const hasWork = plan.rolesToCreate.length > 0 || plan.permissionRowCount > 0;
          if (!hasWork) continue;

          changedTenants += 1;
          createdRoles += plan.rolesToCreate.length;
          permissionRows += plan.permissionRowCount;

          if (plan.rolesToCreate.length) {
            console.log(
              `[rbac-backfill] ${tenant.slug} (${tenant.id}): +${plan.rolesToCreate.length} roles -> ${plan.rolesToCreate.join(', ')}`,
            );
          }
          for (const entry of plan.permissionsToAdd) {
            console.log(`[rbac-backfill] ${tenant.slug} (${tenant.id}): +${entry.rows.length} permissions -> ${entry.roleName}`);
          }

          if (!APPLY) continue;

          await prisma.$transaction(async (tx) => {
            const result = await ensureTenantRoles(tx, tenant.id);
            if (result.created.length) {
              await tx.auditLog.create({
                data: {
                  tenantId: tenant.id,
                  actorEmail: 'system:rbac-backfill',
                  action: 'rbac.backfill.roles_created',
                  objectType: 'Tenant',
                  objectId: tenant.id,
                  newValue: { createdRoles: result.created },
                  reason: 'Idempotent system role catalog backfill',
                },
              });
            }
            if (result.permissionRowsAdded) {
              await tx.auditLog.create({
                data: {
                  tenantId: tenant.id,
                  actorEmail: 'system:rbac-backfill',
                  action: 'rbac.backfill.permissions_added',
                  objectType: 'Tenant',
                  objectId: tenant.id,
                  newValue: {
                    permissionRowsAdded: result.permissionRowsAdded,
                    roles: result.permissionsAdded,
                    scopeConflicts: result.scopeConflicts.map((c) => ({
                      roleName: c.roleName,
                      module: c.module,
                      permissionType: c.permissionType,
                      catalogScope: c.catalogScope,
                      existingScope: c.existingScope,
                      existingIsWider: c.existingIsWider,
                    })),
                  },
                  reason: 'Additive permission reconciliation against the system role catalog',
                },
              });
            }
          });
        } catch (err) {
          failures += 1;
          console.error(
            `[rbac-backfill] ${tenant.slug} (${tenant.id}) FAILED: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      if (TENANT_ID) break;
    }

    const verb = APPLY ? '' : ' (would be)';
    console.log('[rbac-backfill] ------------------------------------------------');
    console.log(`[rbac-backfill] tenants scanned              = ${scanned}`);
    console.log(`[rbac-backfill] tenants changed${verb}       = ${changedTenants}`);
    console.log(`[rbac-backfill] roles created${verb}         = ${createdRoles}`);
    console.log(`[rbac-backfill] roles already present        = ${rolesAlreadyPresent}`);
    console.log(`[rbac-backfill] permission rows added${verb} = ${permissionRows}`);
    console.log(`[rbac-backfill] assignments created          = ${assignmentsCreated} (never created by design)`);
    console.log(`[rbac-backfill] assignments already present  = ${assignmentsPresent} (untouched)`);
    console.log(`[rbac-backfill] scope conflicts reported     = ${scopeConflicts} (left unchanged)`);
    console.log(`[rbac-backfill] failures                     = ${failures}`);
    if (tenantsWithoutOwner.length) {
      console.log(
        `[rbac-backfill] WARNING: ${tenantsWithoutOwner.length} tenant(s) have no active ${TENANT_OWNER_ROLE}: ${tenantsWithoutOwner.join(', ')}`,
      );
      console.log('[rbac-backfill] assign one manually - this script never creates assignments.');
    }
    if (!APPLY && changedTenants > 0) {
      console.log('[rbac-backfill] no changes written. Re-run with --apply to persist.');
    }
    if (failures > 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[rbac-backfill] failed:', err);
  process.exit(1);
});
