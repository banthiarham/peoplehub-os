import {
  PayrollPolicyInputs,
  buildPolicySnapshot,
  hashPolicySnapshot,
  snapshotLocationKeys,
} from './payroll-policy-snapshot';

const inputs = (overrides: Partial<PayrollPolicyInputs> = {}): PayrollPolicyInputs => ({
  salaryBasis: 'CALENDAR_DAYS',
  fixedDays: null,
  overtimePaymentEnabled: false,
  compOffUnusedTreatment: 'UNPAID',
  compOffUsagePeriod: 'MONTHLY',
  compOffCarryForwardEnabled: false,
  ...overrides,
});

describe('payroll policy snapshot', () => {
  it('hashes the same inputs to the same value regardless of location or field order', () => {
    const a = buildPolicySnapshot({ 'loc-1': inputs(), '': inputs({ overtimePaymentEnabled: true }) });
    const b = buildPolicySnapshot({ '': inputs({ overtimePaymentEnabled: true }), 'loc-1': inputs() });

    expect(hashPolicySnapshot(a)).toBe(hashPolicySnapshot(b));
  });

  it.each([
    { salaryBasis: 'FIXED_DAYS', fixedDays: 26 },
    { overtimePaymentEnabled: true },
    { compOffUnusedTreatment: 'PAY' },
    { compOffUsagePeriod: 'ANNUAL' },
    { compOffCarryForwardEnabled: true },
  ])('hashes differently when %p changes', (change) => {
    const base = buildPolicySnapshot({ '': inputs() });
    const changed = buildPolicySnapshot({ '': inputs(change) });

    expect(hashPolicySnapshot(changed)).not.toBe(hashPolicySnapshot(base));
  });

  it('hashes differently when a location resolves differently', () => {
    const base = buildPolicySnapshot({ 'loc-1': inputs() });
    const changed = buildPolicySnapshot({ 'loc-1': inputs({ overtimePaymentEnabled: true }) });

    expect(hashPolicySnapshot(changed)).not.toBe(hashPolicySnapshot(base));
  });

  it('reads the location keys back from a stored snapshot', () => {
    const stored = JSON.parse(JSON.stringify(buildPolicySnapshot({ 'loc-1': inputs(), '': inputs() })));

    expect(snapshotLocationKeys(stored)?.sort()).toEqual(['', 'loc-1']);
  });

  it.each([null, undefined, 'x', 4, [], {}, { locations: null }, { locations: [] }])(
    'treats %p as no snapshot',
    (stored) => {
      expect(snapshotLocationKeys(stored)).toBeNull();
    },
  );
});
