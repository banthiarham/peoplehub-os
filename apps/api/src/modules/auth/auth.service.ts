import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PermissionType, Prisma, ScopeType, TenantStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { PrismaService } from '../../common/database/prisma.service';
import { AuthUser } from '../../common/types/auth-user';
import { ChangePasswordDto, LoginDto, OAuthTokenDto, SignupDto } from './dto/login.dto';
import { JwtPayload } from './jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        email: dto.email.toLowerCase(),
        isActive: true,
        ...(dto.tenantSlug ? { tenant: { slug: dto.tenantSlug } } : {}),
      },
      include: {
        tenant: { select: { id: true, slug: true, name: true } },
        employee: { select: { id: true, employeeCode: true } },
        userRoles: { include: { role: { select: { name: true } } } },
      },
    });

    if (!user?.passwordHash || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const payload: JwtPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      name: user.name,
      isSuperAdmin: user.isSuperAdmin,
      employeeId: user.employee?.id ?? null,
      roles: user.userRoles.map((ur) => ur.role.name),
      authType: 'jwt',
      scopes: [],
    };

    return {
      accessToken: await this.jwt.signAsync(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        isSuperAdmin: user.isSuperAdmin,
        employeeId: user.employee?.id ?? null,
        employeeCode: user.employee?.employeeCode ?? null,
        roles: payload.roles,
        tenant: user.tenant,
      },
    };
  }

  async signup(dto: SignupDto) {
    const ownerEmail = dto.ownerEmail.trim().toLowerCase();
    const companyName = dto.companyName.trim();
    const ownerName = dto.ownerName.trim();
    const tenantSlug = this.normalizeSlug(dto.tenantSlug || companyName);

    if (!companyName) throw new BadRequestException('Company name is required');
    if (!ownerName) throw new BadRequestException('Owner name is required');
    if (!tenantSlug) throw new BadRequestException('Workspace URL is required');

    const [existingTenant, existingOwnerEmail] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true } }),
      this.prisma.user.findFirst({ where: { email: ownerEmail }, select: { id: true } }),
    ]);
    if (existingTenant) throw new ConflictException('Workspace URL is already taken');
    if (existingOwnerEmail) throw new ConflictException('A workspace already exists for this email. Sign in instead.');

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const created = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: companyName,
          slug: tenantSlug,
          legalName: dto.legalName?.trim() || companyName,
          country: dto.country?.trim() || 'IN',
          industry: dto.industry?.trim(),
          companySize: dto.companySize?.trim(),
          billingPlan: 'trial',
          status: TenantStatus.TRIAL,
          timezone: 'Asia/Kolkata',
          currency: 'INR',
          brandColor: '#2F6D5C',
        },
        select: { id: true, slug: true, name: true },
      });

      const tenantOwner = await tx.role.create({
        data: {
          tenantId: tenant.id,
          name: 'Tenant Owner',
          description: 'Primary workspace administrator created during signup',
          isSystem: true,
        },
      });
      await tx.permission.createMany({
        data: this.ownerPermissions(tenantOwner.id),
        skipDuplicates: true,
      });

      const owner = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: ownerEmail,
          name: ownerName,
          passwordHash,
          isActive: true,
        },
        select: { id: true, email: true, name: true, avatarUrl: true, isSuperAdmin: true },
      });
      await tx.userRole.create({ data: { userId: owner.id, roleId: tenantOwner.id } });

      await tx.legalEntity.create({
        data: {
          tenantId: tenant.id,
          name: dto.legalName?.trim() || companyName,
          legalName: dto.legalName?.trim() || companyName,
          city: dto.city?.trim(),
          state: dto.state?.trim(),
          country: dto.country?.trim() || 'IN',
        },
      });
      await tx.location.create({
        data: {
          tenantId: tenant.id,
          name: dto.city?.trim() ? `${dto.city.trim()} Office` : 'Head Office',
          city: dto.city?.trim(),
          state: dto.state?.trim(),
          country: dto.country?.trim() || 'IN',
          timezone: 'Asia/Kolkata',
          isActive: true,
        },
      });
      await tx.department.createMany({
        data: [
          { tenantId: tenant.id, name: 'Management', code: 'MGMT' },
          { tenantId: tenant.id, name: 'People Operations', code: 'HR' },
        ],
        skipDuplicates: true,
      });

      await tx.auditLog.create({
        data: {
          tenantId: tenant.id,
          actorId: owner.id,
          action: 'auth.signup_completed',
          objectType: 'Tenant',
          objectId: tenant.id,
          newValue: {
            tenantSlug: tenant.slug,
            ownerEmail,
            primaryGoal: dto.primaryGoal ?? null,
          } as Prisma.InputJsonValue,
        },
      });

      return { tenant, owner };
    });

    const roles = ['Tenant Owner'];
    const payload: JwtPayload = {
      sub: created.owner.id,
      tenantId: created.tenant.id,
      email: created.owner.email,
      name: created.owner.name,
      isSuperAdmin: created.owner.isSuperAdmin,
      employeeId: null,
      roles,
      authType: 'jwt',
      scopes: [],
    };

    return {
      accessToken: await this.jwt.signAsync(payload),
      user: {
        id: created.owner.id,
        email: created.owner.email,
        name: created.owner.name,
        avatarUrl: created.owner.avatarUrl,
        isSuperAdmin: created.owner.isSuperAdmin,
        employeeId: null,
        employeeCode: null,
        roles,
        tenant: created.tenant,
      },
      next: '/setup',
    };
  }

  async me(auth: AuthUser) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: auth.userId },
      include: {
        tenant: { select: { id: true, slug: true, name: true } },
        employee: { select: { id: true, employeeCode: true } },
        userRoles: { include: { role: { select: { name: true } } } },
      },
    });
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      isSuperAdmin: user.isSuperAdmin,
      employeeId: user.employee?.id ?? null,
      employeeCode: user.employee?.employeeCode ?? null,
      roles: user.userRoles.map((ur) => ur.role.name),
      tenant: user.tenant,
    };
  }

  async oauthToken(dto: OAuthTokenDto) {
    if (dto.grant_type !== 'client_credentials') {
      throw new UnauthorizedException('Unsupported grant type');
    }

    const client = await this.prisma.oAuthClient.findFirst({
      where: {
        clientId: dto.client_id,
        isActive: true,
      },
      include: {
        tenant: { select: { id: true, slug: true, name: true } },
      },
    });

    if (!client || client.clientSecretHash !== createHash('sha256').update(dto.client_secret).digest('hex')) {
      throw new UnauthorizedException('Invalid client credentials');
    }

    const requestedScopes = dto.scope
      ? dto.scope.split(/\s+/).map((scope) => scope.trim()).filter(Boolean)
      : client.scopes ?? [];
    const tokenScopes = requestedScopes.filter((scope) => client.scopes.includes(scope));
    if (requestedScopes.length && tokenScopes.length === 0) {
      throw new UnauthorizedException('Requested scopes are not allowed');
    }

    const payload: JwtPayload = {
      sub: `oauth-client:${client.id}`,
      tenantId: client.tenantId,
      email: `${client.clientId}@oauth.peoplehub.internal`,
      name: client.name,
      isSuperAdmin: false,
      employeeId: null,
      roles: [],
      authType: 'oauth',
      scopes: tokenScopes.length ? tokenScopes : client.scopes,
    };

    return {
      access_token: await this.jwt.signAsync(payload),
      token_type: 'Bearer',
      expires_in: 24 * 60 * 60,
      scope: (payload.scopes ?? []).join(' '),
      tenant: client.tenant,
      client: {
        id: client.id,
        clientId: client.clientId,
        name: client.name,
      },
    };
  }

  async changePassword(auth: AuthUser, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
    if (!user.passwordHash || !(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(dto.newPassword, 10) },
    });
    return { success: true };
  }

  private normalizeSlug(value: string) {
    return value
      .toLowerCase()
      .trim()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);
  }

  private ownerPermissions(roleId: string): Prisma.PermissionCreateManyInput[] {
    const modules = [
      'organization',
      'employees',
      'roles',
      'settings',
      'attendance',
      'leave',
      'payroll',
      'reports',
      'documents',
      'notifications',
      'workflows',
    ];
    return modules.flatMap((module) =>
      [PermissionType.VIEW, PermissionType.CREATE, PermissionType.EDIT, PermissionType.DELETE, PermissionType.CONFIGURE].map((permissionType) => ({
        roleId,
        module,
        permissionType,
        scopeType: ScopeType.ENTIRE_TENANT,
      })),
    );
  }
}
