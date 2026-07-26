import { ArgumentMetadata, BadRequestException, ValidationPipe } from '@nestjs/common';
import { UpdateTenantDto } from './organization.dto';

describe('UpdateTenantDto optional field validation', () => {
  // Mirrors the global pipe configured in main.ts.
  const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });
  const metadata: ArgumentMetadata = { type: 'body', metatype: UpdateTenantDto };
  const validate = (body: Record<string, unknown>) => pipe.transform(body, metadata);

  it('accepts valid company size, brand color, and logo URL', async () => {
    await expect(
      validate({ companySize: '51-200', brandColor: '#2F6D5C', logoUrl: 'https://cdn.example.com/logo.png' }),
    ).resolves.toMatchObject({
      companySize: '51-200',
      brandColor: '#2F6D5C',
      logoUrl: 'https://cdn.example.com/logo.png',
    });
  });

  it('accepts empty values so optional fields can be cleared', async () => {
    await expect(validate({ brandColor: '', logoUrl: '' })).resolves.toMatchObject({
      brandColor: '',
      logoUrl: '',
    });
  });

  it('rejects a company size longer than 50 characters', async () => {
    await expect(validate({ companySize: 'x'.repeat(51) })).rejects.toThrow(BadRequestException);
  });

  it('rejects an empty company size so it cannot be cleared', async () => {
    await expect(validate({ companySize: '' })).rejects.toThrow(BadRequestException);
    await expect(validate({ companySize: '   ' })).rejects.toThrow(BadRequestException);
  });

  it('still allows a partial update that omits company size', async () => {
    await expect(validate({ name: 'Acme India' })).resolves.not.toHaveProperty('companySize');
  });

  it('rejects a brand color that is not a 6-digit hex color', async () => {
    await expect(validate({ brandColor: 'green' })).rejects.toThrow(BadRequestException);
    await expect(validate({ brandColor: '#2F6D5' })).rejects.toThrow(BadRequestException);
  });

  it('rejects a logo URL that is not an http(s) URL', async () => {
    await expect(validate({ logoUrl: 'cdn.example.com/logo.png' })).rejects.toThrow(BadRequestException);
    await expect(validate({ logoUrl: 'not a url' })).rejects.toThrow(BadRequestException);
  });

  it('rejects a whitespace-only company name', async () => {
    await expect(validate({ name: '   ' })).rejects.toThrow(BadRequestException);
  });
});
