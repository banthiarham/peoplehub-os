import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { AuthService, TENANT_OWNER_SCOPES } from './auth.service';
import { catalogRoleScopes, SYSTEM_ROLE_CATALOG } from '../rbac/role-catalog';

describe('AuthService', () => {
  it('creates a trial tenant and owner account during signup', async () => {
    const tx = {
      tenant: {
        create: jest.fn().mockResolvedValue({ id: 'tenant-1', slug: 'acme-india', name: 'Acme India' }),
      },
      role: {
        create: jest.fn().mockResolvedValue({ id: 'role-owner' }),
        // signup also seeds the remaining system role catalog and tops the owner up
        findMany: jest.fn().mockResolvedValue([{ id: 'role-owner', name: 'Tenant Owner', permissions: [] }]),
        upsert: jest.fn(async ({ create }: any) => ({ id: `role-${create.name}`, ...create })),
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
    const catalogNames = tx.role.upsert.mock.calls.map(([args]: any) => args.create.name);
    expect(catalogNames).toEqual(expect.arrayContaining(['HR Admin', 'Recruiter', 'Manager', 'Employee']));
    // the Tenant Owner role created above must not be re-created or modified
    expect(catalogNames).not.toContain('Tenant Owner');
    expect(result).toEqual(
      expect.objectContaining({
        accessToken: 'signed-signup-token',
        next: '/setup',
        user: expect.objectContaining({
          email: 'owner@acme.example',
          roles: ['Tenant Owner'],
          scopes: expect.arrayContaining(['employees:read', 'employees:write', 'payroll:write', 'workflow:approve']),
          tenant: { id: 'tenant-1', slug: 'acme-india', name: 'Acme India' },
        }),
      }),
    );
    expect(jwt.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        roles: ['Tenant Owner'],
        scopes: expect.arrayContaining(['employees:read', 'payroll:write', 'workflow:approve']),
      }),
    );
  });

  it('queues a password reset email without revealing account existence', async () => {
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'user-1',
          tenantId: 'tenant-1',
          email: 'owner@acme.example',
          name: 'Owner User',
          tenant: { name: 'Acme India' },
        }),
      },
      passwordResetToken: {
        create: jest.fn().mockResolvedValue({ id: 'reset-1' }),
      },
    };
    const jwt = { signAsync: jest.fn() } as unknown as JwtService;
    const emailService = {
      sendTransactional: jest.fn().mockResolvedValue('queue-1'),
    };
    const config = {
      get: jest.fn((key: string) => (key === 'APP_URL' ? 'https://viohr.example' : undefined)),
    };
    const service = new AuthService(prisma as any, jwt, config as any, emailService as any);

    const result = await service.forgotPassword({ email: 'OWNER@ACME.EXAMPLE' });

    expect(result.message).toContain('If an active account exists');
    expect(prisma.passwordResetToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        userId: 'user-1',
        tokenHash: expect.any(String),
        expiresAt: expect.any(Date),
      }),
    });
    expect(emailService.sendTransactional).toHaveBeenCalledWith(
      'tenant-1',
      'password_reset',
      'owner@acme.example',
      expect.objectContaining({
        login_link: expect.stringContaining('/reset-password?token='),
      }),
      expect.objectContaining({ module: 'auth' }),
    );
  });

  it('does not create reset tokens for unknown emails', async () => {
    const prisma = {
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      passwordResetToken: { create: jest.fn() },
    };
    const jwt = { signAsync: jest.fn() } as unknown as JwtService;
    const service = new AuthService(prisma as any, jwt);

    await expect(service.forgotPassword({ email: 'missing@example.com' })).resolves.toEqual(
      expect.objectContaining({ message: expect.stringContaining('If an active account exists') }),
    );
    expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
  });

  it('resets password with a valid unused token', async () => {
    const prisma = {
      passwordResetToken: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'reset-1',
          userId: 'user-1',
          usedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      user: {
        update: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    const jwt = { signAsync: jest.fn() } as unknown as JwtService;
    const service = new AuthService(prisma as any, jwt);

    await expect(service.resetPassword({ token: 'valid-token', newPassword: 'NewPass@123' })).resolves.toEqual({ success: true });

    expect(prisma.passwordResetToken.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: expect.any(String) },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { passwordHash: expect.any(String) },
    });
    expect(prisma.passwordResetToken.update).toHaveBeenCalledWith({
      where: { id: 'reset-1' },
      data: { usedAt: expect.any(Date) },
    });
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('derives JWT scopes from assigned role permissions during login', async () => {
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'user-1',
          tenantId: 'tenant-1',
          email: 'hr@example.com',
          name: 'HR User',
          avatarUrl: null,
          passwordHash: bcrypt.hashSync('Password@123', 4),
          isSuperAdmin: false,
          tenant: { id: 'tenant-1', slug: 'acme', name: 'Acme' },
          employee: null,
          userRoles: [
            {
              role: {
                name: 'HR Admin',
                permissions: [
                  { module: 'employees', permissionType: 'VIEW' },
                  { module: 'employees', permissionType: 'CREATE' },
                  { module: 'workflows', permissionType: 'APPROVE' },
                ],
              },
            },
          ],
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const jwt = {
      signAsync: jest.fn().mockResolvedValue('signed-login-token'),
    } as unknown as JwtService;
    const service = new AuthService(prisma as any, jwt);

    const result = await service.login({ email: 'hr@example.com', password: 'Password@123' });

    expect(result.user).toEqual(
      expect.objectContaining({
        roles: ['HR Admin'],
        scopes: ['employees:read', 'employees:write', 'workflow:approve'],
      }),
    );
    expect(jwt.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        roles: ['HR Admin'],
        scopes: ['employees:read', 'employees:write', 'workflow:approve'],
      }),
    );
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

describe('Tenant Owner scopes', () => {
  it('covers every module the catalog grants the owner', () => {
    for (const scope of catalogRoleScopes('Tenant Owner')) {
      expect(TENANT_OWNER_SCOPES).toContain(scope);
    }
    expect(TENANT_OWNER_SCOPES).toEqual(
      expect.arrayContaining([
        'recruitment:read', 'recruitment:write', 'recruitment:approve',
        'onboarding:write', 'timesheets:write', 'assets:write', 'engagement:write',
        'performance:write', 'reports:export', 'settings:write', 'roles:write', 'tax:write',
        'developer:read', 'developer:api_keys', 'developer:integrations',
        'payroll:run', 'payroll:lock', 'payroll:unlock',
      ]),
    );
  });

  it('keeps every legacy owner scope so no existing owner loses access', () => {
    for (const scope of [
      'attendance:approve', 'attendance:import', 'attendance:read', 'attendance:write',
      'documents:read', 'documents:write', 'employees:approve', 'employees:read', 'employees:write',
      'helpdesk:approve', 'helpdesk:read', 'helpdesk:write', 'leave:approve', 'leave:read', 'leave:write',
      'notifications:read', 'notifications:write', 'organization:read', 'organization:write',
      'payroll:approve', 'payroll:read', 'payroll:write',
      'workflow:approve', 'workflow:read', 'workflow:write',
    ]) {
      expect(TENANT_OWNER_SCOPES).toContain(scope);
    }
  });

  it('is sorted and de-duplicated', () => {
    expect(TENANT_OWNER_SCOPES).toEqual([...new Set(TENANT_OWNER_SCOPES)].sort());
  });
});

describe('login scope derivation for the final catalog', () => {
  const loginAs = async (roleName: string) => {
    const permissions = SYSTEM_ROLE_CATALOG.find((r) => r.name === roleName)!.grants.flatMap((g) =>
      g.permissionTypes.map((permissionType) => ({ module: g.module, permissionType })),
    );
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'user-1',
          tenantId: 'tenant-1',
          email: 'user@example.com',
          name: roleName,
          avatarUrl: null,
          passwordHash: bcrypt.hashSync('Password@123', 4),
          isSuperAdmin: false,
          tenant: { id: 'tenant-1', slug: 'acme', name: 'Acme' },
          employee: null,
          userRoles: [{ role: { name: roleName, permissions } }],
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const jwt = { signAsync: jest.fn().mockResolvedValue('token') } as unknown as JwtService;
    const service = new AuthService(prisma as any, jwt);
    const result = await service.login({ email: 'user@example.com', password: 'Password@123' });
    return result.user.scopes;
  };

  it('gives Payroll Admin the payroll lifecycle scopes', async () => {
    const scopes = await loginAs('Payroll Admin');
    expect(scopes).toEqual(expect.arrayContaining(['payroll:run', 'payroll:lock', 'payroll:unlock']));
  });

  it.each(['HR Admin', 'Finance Admin', 'Manager'])(
    'never derives a payroll lifecycle scope for %s',
    async (roleName) => {
      const scopes = await loginAs(roleName);
      expect(scopes).not.toContain('payroll:run');
      expect(scopes).not.toContain('payroll:lock');
      expect(scopes).not.toContain('payroll:unlock');
    },
  );

  it('gives Developer usable API-key and integration scopes', async () => {
    const scopes = await loginAs('Developer');
    expect(scopes).toEqual(expect.arrayContaining(['developer:api_keys', 'developer:integrations']));
  });

  it('gives Integration Admin integration scopes but not API-key scopes', async () => {
    const scopes = await loginAs('Integration Admin');
    expect(scopes).toContain('developer:integrations');
    expect(scopes).not.toContain('developer:api_keys');
  });
});
