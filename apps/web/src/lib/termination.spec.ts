import {
  canSubmitTermination,
  confirmationMatches,
  employeeFullName,
  isEffectiveDateAllowed,
  isTerminalStatus,
} from './termination';

const today = new Date('2026-08-17T09:30:00.000Z');
const employee = { firstName: 'Asha', lastName: 'Ramachandran', status: 'ACTIVE' };
const validForm = {
  effectiveDate: '2026-08-17',
  reason: 'Gross misconduct',
  confirmName: 'Asha Ramachandran',
};

describe('confirmationMatches', () => {
  it('accepts the full name, tolerating stray and repeated whitespace and casing', () => {
    expect(confirmationMatches('Asha Ramachandran', 'Asha Ramachandran')).toBe(true);
    expect(confirmationMatches('  Asha   Ramachandran  ', 'Asha Ramachandran')).toBe(true);
    expect(confirmationMatches('asha ramachandran', 'Asha Ramachandran')).toBe(true);
  });

  it('rejects a partial, misspelled or empty name', () => {
    expect(confirmationMatches('Asha', 'Asha Ramachandran')).toBe(false);
    expect(confirmationMatches('Asha Ramachandra', 'Asha Ramachandran')).toBe(false);
    expect(confirmationMatches('', 'Asha Ramachandran')).toBe(false);
  });

  it('is not satisfiable when the employee has no name on record', () => {
    expect(confirmationMatches('', '')).toBe(false);
    expect(confirmationMatches('   ', '   ')).toBe(false);
  });
});

describe('isEffectiveDateAllowed', () => {
  it('allows today and earlier', () => {
    expect(isEffectiveDateAllowed('2026-08-17', today)).toBe(true);
    expect(isEffectiveDateAllowed('2026-01-04', today)).toBe(true);
  });

  it('rejects a future date, because termination is immediate', () => {
    expect(isEffectiveDateAllowed('2026-08-18', today)).toBe(false);
  });

  it('rejects an empty or malformed value', () => {
    expect(isEffectiveDateAllowed('', today)).toBe(false);
    expect(isEffectiveDateAllowed('17-08-2026', today)).toBe(false);
  });
});

describe('canSubmitTermination', () => {
  it('enables only once the date, reason and typed name are all good', () => {
    expect(canSubmitTermination(validForm, employee, { today })).toBe(true);
  });

  it('stays disabled until the typed name matches exactly', () => {
    expect(canSubmitTermination({ ...validForm, confirmName: '' }, employee, { today })).toBe(false);
    expect(canSubmitTermination({ ...validForm, confirmName: 'Asha' }, employee, { today })).toBe(false);
  });

  it('stays disabled without a reason', () => {
    expect(canSubmitTermination({ ...validForm, reason: '   ' }, employee, { today })).toBe(false);
  });

  it('stays disabled for a future effective date', () => {
    expect(canSubmitTermination({ ...validForm, effectiveDate: '2026-09-01' }, employee, { today })).toBe(false);
  });

  it('stays disabled for an already exited or deactivated employee', () => {
    for (const status of ['EXITED', 'INACTIVE']) {
      expect(canSubmitTermination(validForm, { ...employee, status }, { today })).toBe(false);
      expect(isTerminalStatus(status)).toBe(true);
    }
    expect(isTerminalStatus('ON_NOTICE')).toBe(false);
  });

  it('stays disabled while a request is in flight, so it cannot double-submit', () => {
    expect(canSubmitTermination(validForm, employee, { today, pending: true })).toBe(false);
  });
});

describe('employeeFullName', () => {
  it('matches the name rendered in the profile header', () => {
    expect(employeeFullName(employee)).toBe('Asha Ramachandran');
    expect(employeeFullName({ firstName: 'Asha', lastName: null })).toBe('Asha');
  });
});
