import {
  compOffDecisionPayload,
  compOffDisplayState,
  compOffDurationLabel,
  compOffIsActionable,
  compOffStateLabel,
} from './comp-off';

describe('compOffDecisionPayload', () => {
  it('sends usedOnDate alongside USED', () => {
    expect(compOffDecisionPayload('USED', '2026-08-17')).toEqual({
      status: 'USED',
      usedOnDate: '2026-08-17',
    });
  });

  it.each(['', '   ', undefined, '17/08/2026', '2026-08'])(
    'refuses to submit USED with %p as the date',
    (value) => {
      expect(compOffDecisionPayload('USED', value as string | undefined)).toBeNull();
    },
  );

  it.each(['CANCELLED', 'EXPIRED'] as const)('sends %s with no date', (status) => {
    expect(compOffDecisionPayload(status)).toEqual({ status });
  });

  it('never attaches a date to a non-USED decision, even if one was typed', () => {
    expect(compOffDecisionPayload('CANCELLED', '2026-08-17')).toEqual({ status: 'CANCELLED' });
  });
});

describe('compOffDurationLabel', () => {
  it('names a half day rather than printing a bare 0.5', () => {
    expect(compOffDurationLabel(0.5)).toBe('Half day (0.5)');
  });

  it('names a full day rather than printing a bare 1', () => {
    expect(compOffDurationLabel(1)).toBe('Full day (1)');
  });

  it('shows a historical out-of-range duration as-is instead of mislabelling it', () => {
    // 0.75 is no longer creatable, but a grant credited before the form was narrowed must not
    // be presented as either a half or a full day.
    expect(compOffDurationLabel(0.75)).toBe('0.75 days');
  });
});

describe('compOffDisplayState', () => {
  const NOT_ENFORCED = { expiryEnforced: false };
  const ENFORCED = { expiryEnforced: true };
  const today = new Date('2026-09-15T10:00:00.000Z');

  it('shows an untouched grant as available', () => {
    expect(
      compOffDisplayState({ status: 'AVAILABLE', expiresAt: null }, NOT_ENFORCED, today),
    ).toBe('AVAILABLE');
  });

  it('shows a paid grant as paid even though its stored status is still AVAILABLE', () => {
    // This is the case the stored column cannot express: payroll records the claim in
    // `paidInPayrollRunId` at lock time and never writes `status`.
    expect(
      compOffDisplayState(
        { status: 'AVAILABLE', expiresAt: null, paidInPayrollRunId: 'run-9' },
        NOT_ENFORCED,
        today,
      ),
    ).toBe('PAID');
  });

  it('prefers paid over a decided status, so the money is never hidden', () => {
    expect(
      compOffDisplayState(
        { status: 'USED', expiresAt: null, paidInPayrollRunId: 'run-9' },
        NOT_ENFORCED,
        today,
      ),
    ).toBe('PAID');
  });

  it.each(['USED', 'CANCELLED', 'EXPIRED'] as const)('passes %s through unchanged', (status) => {
    expect(compOffDisplayState({ status, expiresAt: null }, NOT_ENFORCED, today)).toBe(status);
  });

  it('shows a lapsed grant as expired when the policy enforces the date', () => {
    expect(
      compOffDisplayState({ status: 'AVAILABLE', expiresAt: '2026-09-01' }, ENFORCED, today),
    ).toBe('EXPIRED');
  });

  it('leaves a lapsed grant available when the policy does not enforce the date', () => {
    // Under NOT_ENFORCED the date is advisory: the grant stays usable to the end of its usage
    // period, so calling it expired would misstate the balance in the other direction.
    expect(
      compOffDisplayState({ status: 'AVAILABLE', expiresAt: '2026-09-01' }, NOT_ENFORCED, today),
    ).toBe('AVAILABLE');
  });

  it('treats the expiry date itself as still available, matching the API', () => {
    expect(
      compOffDisplayState({ status: 'AVAILABLE', expiresAt: '2026-09-15' }, ENFORCED, today),
    ).toBe('AVAILABLE');
  });

  it('ignores the time of day on either side of the comparison', () => {
    expect(
      compOffDisplayState(
        { status: 'AVAILABLE', expiresAt: '2026-09-15T23:59:59.000Z' },
        ENFORCED,
        new Date('2026-09-15T00:00:01.000Z'),
      ),
    ).toBe('AVAILABLE');
  });

  it('cannot expire a grant that carries no expiry date', () => {
    expect(
      compOffDisplayState({ status: 'AVAILABLE', expiresAt: null }, ENFORCED, today),
    ).toBe('AVAILABLE');
  });
});

describe('compOffStateLabel', () => {
  it('says where the money went for a paid grant', () => {
    expect(compOffStateLabel('PAID')).toBe('Paid in payroll');
  });

  it.each([
    ['AVAILABLE', 'Available'],
    ['USED', 'Used'],
    ['EXPIRED', 'Expired'],
    ['CANCELLED', 'Cancelled'],
  ] as const)('labels %s as %s', (state, label) => {
    expect(compOffStateLabel(state)).toBe(label);
  });
});

describe('compOffIsActionable', () => {
  it('allows decisions only on a genuinely available grant', () => {
    expect(compOffIsActionable('AVAILABLE')).toBe(true);
  });

  it.each(['PAID', 'USED', 'EXPIRED', 'CANCELLED'] as const)(
    'offers no action on %s',
    (state) => {
      // A paid grant is the case that matters: its stored status is still AVAILABLE, so without
      // this the ledger offered "Mark used" on money that had already gone out - an action the
      // API refuses. The button and the API have to agree.
      expect(compOffIsActionable(state)).toBe(false);
    },
  );
});
