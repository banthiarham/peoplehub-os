import { asArray, employeeLabel, employeeOptionsFrom } from './options';

const managers = [
  { id: 'emp-1', firstName: 'Rohan', lastName: 'Kapoor', employeeCode: 'EMP-0008' },
  { id: 'emp-2', firstName: 'Asha', lastName: 'Nair', employeeCode: 'EMP-0009' },
];

describe('employeeOptionsFrom', () => {
  it('extracts the employee array from the full meta/options object', () => {
    // What every other page caches under ['employees', 'options'].
    const cached = {
      departments: [{ id: 'dep-1', name: 'Engineering' }],
      locations: [{ id: 'loc-1', name: 'Bengaluru Office' }],
      managers,
      roles: [],
    };
    expect(employeeOptionsFrom(cached)).toEqual(managers);
  });

  it('accepts a bare managers array', () => {
    expect(employeeOptionsFrom(managers)).toEqual(managers);
  });

  it('returns an array for every non-list cache state', () => {
    // Loading, an errored query, a session-expired body, and an options object
    // whose managers key is missing all used to reach `.map()` unguarded.
    for (const value of [undefined, null, {}, { managers: null }, { managers: 'none' }, 'oops', 0]) {
      expect(employeeOptionsFrom(value)).toEqual([]);
    }
  });
});

describe('asArray', () => {
  it('passes arrays through and flattens every other shape to empty', () => {
    expect(asArray([1, 2])).toEqual([1, 2]);
    expect(asArray(undefined)).toEqual([]);
    expect(asArray({ data: [1] })).toEqual([]);
  });
});

describe('employeeLabel', () => {
  it('names the employee with their code so a lookup is never anonymous', () => {
    expect(employeeLabel(managers[0])).toBe('Rohan Kapoor (EMP-0008)');
  });

  it('falls back to the name when no code is set', () => {
    expect(employeeLabel({ id: 'emp-3', firstName: 'Ira', lastName: 'Bose' })).toBe('Ira Bose');
  });
});
