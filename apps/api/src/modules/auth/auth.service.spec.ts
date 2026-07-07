import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  it('creates a trial tenant and owner account during signup', async () => {
    const tx = {
      tenant: {
        create: jest.fn().mockResolvedValue({ id: 'tenant-1', slug: 'acme-india', name: 'Acme India' }),
      },
      role: {
        create: jest.fn().mockResolvedValue({ id: 'role-owner' }),
      },
      permission: {
        createMany: jest.fn().mockResolvedValue({ count: 55 }),
      },
      user: {
        create: jest.fn().mockResolvedValue({
          id: 'user-1',
          email: 'owner@acme.example',
          name: 'Owner User',
          avatarUrl: null,
          isSuperAdmin: false,
        }),
      },
      userRole: {
        create: jest.fn().mockResolvedValue({ id: 'user-role-1' }),
      },
      legalEntity: {
        create: jest.fn().mockResolvedValue({ id: 'entity-1' }),
      },
      location: {
        create: jest.fn().mockResolvedValue({ id: 'location-1' }),
      },
      department: {
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    };
    const prisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue(null) },
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const jwt = {
      signAsync: jest.fn().mockResolvedValue('signed-signup-token'),
    } as unknown as JwtService;
    const service = new AuthService(prisma as any, jwt);

    const result = await service.signup({
      companyName: 'Acme India',
      ownerName: 'Owner User',
      ownerEmail: 'OWNER@ACME.EXAMPLE',
      password: 'Password@123',
      companySize: '51-200',
      city: 'Bengaluru',
      state: 'Karnataka',
      primaryGoal: 'payroll',
    });

    expect(prisma.tenant.findUnique).toHaveBeenCalledWith({ where: { slug: 'acme-india' }, select: { id: true } });
    expect(tx.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'owner@acme.example',
          name: 'Owner User',
          passwordHash: expect.any(String),
        }),
      }),
    );
    expect(tx.userRole.create).toHaveBeenCalledWith({ data: { userId: 'user-1', roleId: 'role-owner' } });
    expect(result).toEqual(
      expect.objectContaining({
        accessToken: 'signed-signup-token',
        next: '/setup',
        user: expect.objectContaining({
          email: 'owner@acme.example',
          roles: ['Tenant Owner'],
          tenant: { id: 'tenant-1', slug: 'acme-india', name: 'Acme India' },
        }),
      }),
    );
    expect(jwt.signAsync).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant-1', roles: ['Tenant Owner'] }));
  });

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
