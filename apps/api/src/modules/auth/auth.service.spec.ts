import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  it('issues an OAuth2 client credentials access token with allowed scopes only', async () => {
    const prisma = {
      oAuthClient: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'oauth-1',
          tenantId: 'tenant-1',
          name: 'Internal App',
          clientId: 'phc_123',
          clientSecretHash: createHash('sha256').update('phs_abc').digest('hex'),
          scopes: ['employees.read', 'attendance.read', 'leave.read'],
          tenant: { id: 'tenant-1', slug: 'demo-corp', name: 'Demo Corp' },
        }),
      },
    };
    const jwt = {
      signAsync: jest.fn().mockResolvedValue('signed-oauth-token'),
    } as unknown as JwtService;
    const service = new AuthService(prisma as any, jwt);

    const result = await service.oauthToken({
      grant_type: 'client_credentials',
      client_id: 'phc_123',
      client_secret: 'phs_abc',
      scope: 'employees.read attendance.read payroll.read',
    });

    expect(result).toEqual(
      expect.objectContaining({
        access_token: 'signed-oauth-token',
        token_type: 'Bearer',
        scope: 'employees.read attendance.read',
      }),
    );
    expect(jwt.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        authType: 'oauth',
        scopes: ['employees.read', 'attendance.read'],
        sub: 'oauth-client:oauth-1',
      }),
    );
  });
});
