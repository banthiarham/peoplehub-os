import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PermissionType, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { AuthUser } from '../../common/types/auth-user';
import {
  AssignUserRolesDto,
  CreateRoleDto,
  SetFieldPermissionDto,
  SetRolePermissionsDto,
  UpdateRoleDto,
} from './dto/rbac.dto';

export const SENSITIVE_EMPLOYEE_FIELDS = [
  { key: 'salary', label: 'Salary and CTC', module: 'employee.field.salary' },
  { key: 'bankDetails', label: 'Bank details', module: 'employee.field.bankDetails' },
  { key: 'taxIds', label: 'Tax IDs: PAN, Aadhaar, UAN, ESIC', module: 'employee.field.taxIds' },
  { key: 'documents', label: 'Employee documents', module: 'employee.field.documents' },
  { key: 'personal', label: 'Personal contact and identity details', module: 'employee.field.personal' },
] as const;

@Injectable()
export class RbacService {
  constructor(private readonly prisma: PrismaService) {}

  async roles(tenantId: string) {
    return this.prisma.role.findMany({
      where: { tenantId },
      include: {
        permissions: { orderBy: [{ module: 'asc' }, { permissionType: 'asc' }] },
        _count: { select: { userRoles: true } },
      },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
  }

  async createRole(tenantId: string, dto: CreateRoleDto, actorUserId: string) {
    const role = await this.prisma.role.create({
      data: { tenantId, name: dto.name, description: dto.description, isSystem: false },
    });
    await this.audit(tenantId, actorUserId, 'role.created', 'Role', role.id, null, role);
    return role;
  }

  async updateRole(tenantId: string, id: string, dto: UpdateRoleDto, actorUserId: string) {
    const existing = await this.prisma.role.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Role not found');
    if (existing.isSystem && dto.name && dto.name !== existing.name) {
      throw new BadRequestException('System role names cannot be changed');
    }
    const updated = await this.prisma.role.update({
      where: { id },
      data: { name: dto.name, description: dto.description, isSystem: dto.isSystem },
    });
    await this.audit(tenantId, actorUserId, 'role.updated', 'Role', id, existing, updated);
    return updated;
  }

  async setPermissions(tenantId: string, roleId: string, dto: SetRolePermissionsDto, actorUserId: string) {
    const role = await this.prisma.role.findFirst({ where: { id: roleId, tenantId } });
    if (!role) throw new NotFoundException('Role not found');
    const before = await this.prisma.permission.findMany({ where: { roleId } });
    await this.prisma.$transaction(async (tx) => {
      await tx.permission.deleteMany({ where: { roleId, module: { not: { startsWith: 'employee.field.' } } } });
      if (dto.permissions.length) {
        await tx.permission.createMany({
          data: dto.permissions.map((p) => ({
            roleId,
            module: p.module,
            permissionType: p.permissionType,
            scopeType: p.scopeType,
            scopeValue: p.scopeValue,
          })),
          skipDuplicates: true,
        });
      }
    });
    const after = await this.prisma.permission.findMany({ where: { roleId } });
    await this.audit(tenantId, actorUserId, 'role.permissions_updated', 'Role', roleId, before, after);
    return after;
  }

  async users(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenantId },
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
        isSuperAdmin: true,
        employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
        userRoles: { include: { role: { select: { id: true, name: true } } } },
      },
      orderBy: { email: 'asc' },
    });
  }

  async assignUserRoles(tenantId: string, userId: string, dto: AssignUserRolesDto, actorUserId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, tenantId } });
    if (!user) throw new NotFoundException('User not found');
    const roles = await this.prisma.role.findMany({ where: { tenantId, id: { in: dto.roleIds } } });
    if (roles.length !== dto.roleIds.length) throw new BadRequestException('One or more roles do not exist');
    const before = await this.prisma.userRole.findMany({ where: { userId }, include: { role: true } });
    await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId } });
      if (dto.roleIds.length) {
        await tx.userRole.createMany({
          data: dto.roleIds.map((roleId) => ({ userId, roleId })),
          skipDuplicates: true,
        });
      }
    });
    const after = await this.prisma.userRole.findMany({ where: { userId }, include: { role: true } });
    await this.audit(tenantId, actorUserId, 'user.roles_updated', 'User', userId, before, after);
    return after;
  }

  async fieldPermissions(tenantId: string) {
    const roles = await this.prisma.role.findMany({
      where: { tenantId },
      include: {
        permissions: {
          where: {
            module: { startsWith: 'employee.field.' },
            permissionType: PermissionType.VIEW_SENSITIVE,
          },
        },
      },
      orderBy: { name: 'asc' },
    });
    return SENSITIVE_EMPLOYEE_FIELDS.map((field) => ({
      ...field,
      roleIds: roles.filter((r) => r.permissions.some((p) => p.module === field.module)).map((r) => r.id),
      roles: roles
        .filter((r) => r.permissions.some((p) => p.module === field.module))
        .map((r) => ({ id: r.id, name: r.name })),
    }));
  }

  async setFieldPermission(tenantId: string, dto: SetFieldPermissionDto, actorUserId: string) {
    const field = SENSITIVE_EMPLOYEE_FIELDS.find((f) => f.key === dto.fieldKey);
    if (!field) throw new BadRequestException('Unknown sensitive field');
    const roles = await this.prisma.role.findMany({ where: { tenantId, id: { in: dto.roleIds } } });
    if (roles.length !== dto.roleIds.length) throw new BadRequestException('One or more roles do not exist');
    const before = await this.fieldPermissions(tenantId);
    await this.prisma.$transaction(async (tx) => {
      await tx.permission.deleteMany({ where: { module: field.module, role: { tenantId } } });
      if (dto.roleIds.length) {
        await tx.permission.createMany({
          data: dto.roleIds.map((roleId) => ({
            roleId,
            module: field.module,
            permissionType: PermissionType.VIEW_SENSITIVE,
            scopeType: 'ENTIRE_TENANT',
          })),
          skipDuplicates: true,
        });
      }
    });
    const after = await this.fieldPermissions(tenantId);
    await this.audit(tenantId, actorUserId, 'field_permissions.updated', 'FieldPermission', field.key, before, after);
    return after;
  }

  async canViewSensitive(user: AuthUser, fieldKey: (typeof SENSITIVE_EMPLOYEE_FIELDS)[number]['key']) {
    if (user.isSuperAdmin) return true;
    if (user.roles.some((r) => ['Tenant Owner', 'HR Admin', 'Payroll Admin', 'Finance Admin', 'Auditor'].includes(r))) {
      return true;
    }
    const field = SENSITIVE_EMPLOYEE_FIELDS.find((f) => f.key === fieldKey);
    if (!field) return false;
    const count = await this.prisma.permission.count({
      where: {
        module: field.module,
        permissionType: PermissionType.VIEW_SENSITIVE,
        role: { tenantId: user.tenantId, userRoles: { some: { userId: user.userId } } },
      },
    });
    return count > 0;
  }

  private async audit(
    tenantId: string,
    actorId: string,
    action: string,
    objectType: string,
    objectId: string,
    oldValue: unknown,
    newValue: unknown,
  ) {
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId,
        action,
        objectType,
        objectId,
        oldValue: oldValue as Prisma.InputJsonValue | undefined,
        newValue: newValue as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
