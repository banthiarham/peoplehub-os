import { ArgumentMetadata, BadRequestException, ValidationPipe } from '@nestjs/common';
import { EmployeeSummaryQueryDto } from './employee-summary.dto';

describe('EmployeeSummaryQueryDto month validation', () => {
  // Mirrors the global pipe configured in main.ts.
  const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });
  const metadata: ArgumentMetadata = { type: 'query', metatype: EmployeeSummaryQueryDto };
  const validate = (query: Record<string, unknown>) => pipe.transform(query, metadata);

  it('accepts a well-formed past month', async () => {
    await expect(validate({ month: '2025-07' })).resolves.toMatchObject({ month: '2025-07' });
  });

  it('accepts an omitted month so the endpoint can default to the current one', async () => {
    await expect(validate({})).resolves.not.toHaveProperty('month');
  });

  it('rejects a month outside 01-12', async () => {
    await expect(validate({ month: '2026-13' })).rejects.toThrow(BadRequestException);
    await expect(validate({ month: '2026-00' })).rejects.toThrow(BadRequestException);
  });

  it('rejects malformed year and month segments', async () => {
    await expect(validate({ month: '26-07' })).rejects.toThrow(BadRequestException);
    await expect(validate({ month: '2026-7' })).rejects.toThrow(BadRequestException);
    await expect(validate({ month: '2026/07' })).rejects.toThrow(BadRequestException);
  });

  it('rejects a month in the future', async () => {
    const now = new Date();
    const future = `${now.getFullYear() + 1}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    await expect(validate({ month: future })).rejects.toThrow(BadRequestException);
  });
});
