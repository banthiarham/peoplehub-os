import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DecideCompOffDto, UpdateShiftDto } from './attendance.dto';

/**
 * Validation contracts the attendance controllers rely on. Both DTOs are checked the way
 * the global pipe in `main.ts` checks them — `whitelist` plus `forbidNonWhitelisted` — so a
 * field silently becoming accepted (or a required one becoming optional) fails here.
 */
async function validateDto<T extends object>(cls: new () => T, payload: unknown) {
  const dto = plainToInstance(cls, payload);
  return validate(dto, { whitelist: true, forbidNonWhitelisted: true });
}

const failedProperties = (errors: Array<{ property: string }>) =>
  errors.map((error) => error.property).sort();

describe('DecideCompOffDto', () => {
  it('accepts USED with the working date the comp-off is spent on', async () => {
    await expect(
      validateDto(DecideCompOffDto, { status: 'USED', usedOnDate: '2026-08-17' }),
    ).resolves.toEqual([]);
  });

  it('requires usedOnDate when the decision is USED', async () => {
    const errors = await validateDto(DecideCompOffDto, { status: 'USED' });
    expect(failedProperties(errors)).toEqual(['usedOnDate']);
  });

  it.each(['CANCELLED', 'EXPIRED'])('accepts %s without a date', async (status) => {
    await expect(validateDto(DecideCompOffDto, { status })).resolves.toEqual([]);
  });

  it('rejects AVAILABLE: it is the grant\'s starting state, not a decision', async () => {
    const errors = await validateDto(DecideCompOffDto, { status: 'AVAILABLE' });
    expect(failedProperties(errors)).toEqual(['status']);
  });

  it('rejects an unknown status', async () => {
    const errors = await validateDto(DecideCompOffDto, { status: 'PAID_OUT' });
    expect(failedProperties(errors)).toEqual(['status']);
  });
});

describe('UpdateShiftDto', () => {
  it('accepts a comp-off eligibility flip on its own', async () => {
    await expect(validateDto(UpdateShiftDto, { compOffEligible: true })).resolves.toEqual([]);
  });

  it('accepts an empty payload: every field is optional', async () => {
    await expect(validateDto(UpdateShiftDto, {})).resolves.toEqual([]);
  });

  it('still validates the fields it does accept', async () => {
    const errors = await validateDto(UpdateShiftDto, { startTime: '9am', compOffEligible: 'yes' });
    expect(failedProperties(errors)).toEqual(['compOffEligible', 'startTime']);
  });

  it.each(['weeklyOffDays', 'isDefault'])(
    'refuses %s, which has its own endpoint and invariants',
    async (field) => {
      const errors = await validateDto(UpdateShiftDto, {
        compOffEligible: true,
        [field]: field === 'isDefault' ? true : [0],
      });
      expect(failedProperties(errors)).toEqual([field]);
    },
  );
});
