import { compOffDecisionPayload } from './comp-off';

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
