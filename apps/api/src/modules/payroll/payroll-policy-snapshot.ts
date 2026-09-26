import { createHash } from 'crypto';

/** Bump when the shape of a snapshot changes; it is part of the hash, so old runs read as stale. */
export const POLICY_SNAPSHOT_VERSION = 1;

/**
 * The `PayrollPolicy` fields that directly drive what a payroll run computes: the salary
 * denominator, whether approved overtime pays out, and when/if unused comp-off is paid.
 * `compOffEnabled` is deliberately absent - it only gates grant creation in attendance, so
 * flipping it cannot change a run that has already been processed.
 */
export interface PayrollPolicyInputs {
  salaryBasis: string;
  fixedDays: number | null;
  overtimePaymentEnabled: boolean;
  compOffUnusedTreatment: string;
  compOffUsagePeriod: string;
  compOffCarryForwardEnabled: boolean;
}

/** Resolved inputs per employee location; the key is the location id, or '' for no location. */
export interface PayrollPolicySnapshot {
  version: number;
  locations: Record<string, PayrollPolicyInputs>;
}

export function pickPolicyInputs(policy: PayrollPolicyInputs): PayrollPolicyInputs {
  // Field order is fixed here so the hash never depends on the order a caller built it in.
  return {
    salaryBasis: policy.salaryBasis,
    fixedDays: policy.fixedDays ?? null,
    overtimePaymentEnabled: policy.overtimePaymentEnabled,
    compOffUnusedTreatment: policy.compOffUnusedTreatment,
    compOffUsagePeriod: policy.compOffUsagePeriod,
    compOffCarryForwardEnabled: policy.compOffCarryForwardEnabled,
  };
}

export function buildPolicySnapshot(locations: Record<string, PayrollPolicyInputs>): PayrollPolicySnapshot {
  const sorted: Record<string, PayrollPolicyInputs> = {};
  for (const key of Object.keys(locations).sort()) sorted[key] = pickPolicyInputs(locations[key]);
  return { version: POLICY_SNAPSHOT_VERSION, locations: sorted };
}

export function hashPolicySnapshot(snapshot: PayrollPolicySnapshot): string {
  return createHash('sha256').update(JSON.stringify(buildPolicySnapshot(snapshot.locations))).digest('hex');
}

/**
 * The location keys a stored snapshot covers, or null when the stored JSON is not a snapshot
 * (a run processed before snapshots existed, or a malformed value).
 */
export function snapshotLocationKeys(stored: unknown): string[] | null {
  if (!stored || typeof stored !== 'object') return null;
  const locations = (stored as { locations?: unknown }).locations;
  if (!locations || typeof locations !== 'object' || Array.isArray(locations)) return null;
  return Object.keys(locations);
}
