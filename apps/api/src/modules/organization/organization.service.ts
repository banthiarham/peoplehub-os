import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TenantStatus } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import {
  CreateLegalEntityDto,
  CreateOrgUnitDto,
  CreateTenantDto,
  UpdateLegalEntityDto,
  UpdateOrgUnitDto,
  UpdateTenantDto,
} from './dto/organization.dto';

type OrgUnitKind = 'departments' | 'designations' | 'cost-centers' | 'business-units';

@Injectable()
export class OrganizationService {
  constructor(private readonly prisma: PrismaService) {}

  async currentTenant(tenantId: string) {
    const [tenant, primaryAdmin, counts] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: tenantId } }),
      this.prisma.user.findFirst({
        where: {
          tenantId,
          OR: [
            { isSuperAdmin: true },
            { userRoles: { some: { role: { name: { in: ['Tenant Owner', 'Super Admin'] } } } } },
          ],
        },
        select: { id: true, email: true, name: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.organizationCounts(tenantId),
    ]);
    if (!tenant) throw new NotFoundException('Tenant not found');
    return { ...tenant, primaryAdmin, counts };
  }

  async createTenant(dto: CreateTenantDto, actorUserId: string) {
    const existing = await this.prisma.tenant.findUnique({ where: { slug: dto.slug } });
    if (existing) throw new BadRequestException('Tenant slug already exists');

    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: dto.name,
          slug: dto.slug,
          legalName: dto.legalName,
          country: dto.country ?? 'IN',
          industry: dto.industry,
          companySize: dto.companySize,
          billingPlan: dto.billingPlan ?? 'trial',
          status: dto.status ?? TenantStatus.TRIAL,
          timezone: dto.timezone ?? 'Asia/Kolkata',
          currency: dto.currency ?? 'INR',
          logoUrl: dto.logoUrl,
          brandColor: dto.brandColor,
        },
      });

      const tenantOwner = await tx.role.create({
        data: { tenantId: tenant.id, name: 'Tenant Owner', isSystem: true },
      });
      await tx.permission.createMany({
        data: ['organization', 'employees', 'roles', 'settings'].flatMap((module) =>
          ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'CONFIGURE'].map((permissionType) => ({
            roleId: tenantOwner.id,
            module,
            permissionType: permissionType as Prisma.PermissionCreateManyInput['permissionType'],
            scopeType: 'ENTIRE_TENANT' as const,
          })),
        ),
        skipDuplicates: true,
      });

      if (dto.primaryAdminEmail) {
        const user = await tx.user.create({
          data: {
            tenantId: tenant.id,
            email: dto.primaryAdminEmail.toLowerCase(),
            name: dto.primaryAdminEmail,
            isActive: true,
          },
        });
        await tx.userRole.create({ data: { userId: user.id, roleId: tenantOwner.id } });
      }

      await tx.auditLog.create({
        data: {
          tenantId: tenant.id,
          actorId: actorUserId,
          action: 'tenant.created',
          objectType: 'Tenant',
          objectId: tenant.id,
          newValue: tenant as unknown as Prisma.InputJsonValue,
        },
      });

      return tenant;
    });
  }

  async updateTenant(tenantId: string, dto: UpdateTenantDto, actorUserId: string) {
    const existing = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!existing) throw new NotFoundException('Tenant not found');
    const { primaryAdminEmail: _primaryAdminEmail, slug: _slug, ...data } = dto;
    const updated = await this.prisma.tenant.update({ where: { id: tenantId }, data });
    await this.audit(tenantId, actorUserId, 'tenant.updated', 'Tenant', tenantId, existing, updated);
    return updated;
  }

  async legalEntities(tenantId: string) {
    const rows = await this.prisma.legalEntity.findMany({
      where: { tenantId },
      include: { _count: { select: { employees: true } } },
      orderBy: { name: 'asc' },
    });
    return rows.map(({ _count, ...row }) => ({ ...row, employees: _count.employees }));
  }

  async createLegalEntity(tenantId: string, dto: CreateLegalEntityDto, actorUserId: string) {
    const created = await this.prisma.legalEntity.create({
      data: {
        ...dto,
        tenantId,
        country: dto.country ?? 'IN',
        payrollSettings: dto.payrollSettings as Prisma.InputJsonValue | undefined,
        bankDetails: dto.bankDetails as Prisma.InputJsonValue | undefined,
      },
    });
    await this.audit(tenantId, actorUserId, 'legal_entity.created', 'LegalEntity', created.id, null, created);
    return created;
  }

  async updateLegalEntity(tenantId: string, id: string, dto: UpdateLegalEntityDto, actorUserId: string) {
    const existing = await this.prisma.legalEntity.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Legal entity not found');
    const updated = await this.prisma.legalEntity.update({
      where: { id },
      data: {
        ...dto,
        payrollSettings: dto.payrollSettings as Prisma.InputJsonValue | undefined,
        bankDetails: dto.bankDetails as Prisma.InputJsonValue | undefined,
      },
    });
    await this.audit(tenantId, actorUserId, 'legal_entity.updated', 'LegalEntity', id, existing, updated);
    return updated;
  }

  async listOrgUnits(tenantId: string, kind: OrgUnitKind) {
    if (kind === 'departments') {
      const rows = await this.prisma.department.findMany({
        where: { tenantId },
        include: { _count: { select: { employees: true } } },
        orderBy: { name: 'asc' },
      });
      return rows.map(({ _count, ...row }) => ({ ...row, employees: _count.employees }));
    }
    if (kind === 'designations') {
      const rows = await this.prisma.designation.findMany({
        where: { tenantId },
        include: { _count: { select: { employees: true } } },
        orderBy: { name: 'asc' },
      });
      return rows.map(({ _count, ...row }) => ({ ...row, employees: _count.employees }));
    }
    if (kind === 'cost-centers') {
      const rows = await this.prisma.costCenter.findMany({
        where: { tenantId },
        include: { _count: { select: { employees: true } } },
        orderBy: { name: 'asc' },
      });
      return rows.map(({ _count, ...row }) => ({ ...row, employees: _count.employees }));
    }
    const rows = await this.prisma.businessUnit.findMany({
      where: { tenantId },
      include: { _count: { select: { employees: true } } },
      orderBy: { name: 'asc' },
    });
    return rows.map(({ _count, ...row }) => ({ ...row, employees: _count.employees }));
  }

  async createOrgUnit(tenantId: string, kind: OrgUnitKind, dto: CreateOrgUnitDto, actorUserId: string) {
    const data = { tenantId, name: dto.name, code: dto.code, isActive: dto.isActive ?? true };
    const created =
      kind === 'departments'
        ? await this.prisma.department.create({
            data: { ...data, parentId: dto.parentId, headId: dto.headId },
          })
        : kind === 'designations'
          ? await this.prisma.designation.create({
              data: { ...data, grade: dto.grade, level: dto.level },
            })
          : kind === 'cost-centers'
            ? await this.prisma.costCenter.create({ data })
            : await this.prisma.businessUnit.create({ data });
    await this.audit(tenantId, actorUserId, `${kind}.created`, this.objectType(kind), created.id, null, created);
    return created;
  }

  async updateOrgUnit(
    tenantId: string,
    kind: OrgUnitKind,
    id: string,
    dto: UpdateOrgUnitDto,
    actorUserId: string,
  ) {
    const existing = await this.findOrgUnit(tenantId, kind, id);
    const base = {
      name: dto.name,
      code: dto.code,
      isActive: dto.isActive,
    };
    const updated =
      kind === 'departments'
        ? await this.prisma.department.update({
            where: { id },
            data: { ...base, parentId: dto.parentId, headId: dto.headId },
          })
        : kind === 'designations'
          ? await this.prisma.designation.update({
              where: { id },
              data: { ...base, grade: dto.grade, level: dto.level },
            })
          : kind === 'cost-centers'
            ? await this.prisma.costCenter.update({ where: { id }, data: base })
            : await this.prisma.businessUnit.update({ where: { id }, data: base });
    await this.audit(tenantId, actorUserId, `${kind}.updated`, this.objectType(kind), id, existing, updated);
    return updated;
  }

  async orgChart(tenantId: string, q?: string, departmentId?: string) {
    const employees = await this.prisma.employee.findMany({
      where: {
        tenantId,
        status: { notIn: ['EXITED', 'INACTIVE'] },
        ...(departmentId && { departmentId }),
        ...(q && {
          OR: [
            { firstName: { contains: q, mode: 'insensitive' } },
            { lastName: { contains: q, mode: 'insensitive' } },
            { workEmail: { contains: q, mode: 'insensitive' } },
            { employeeCode: { contains: q, mode: 'insensitive' } },
          ],
        }),
      },
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        workEmail: true,
        managerId: true,
        department: { select: { id: true, name: true } },
        designation: { select: { id: true, name: true, grade: true } },
        location: { select: { id: true, name: true } },
        directReports: { select: { id: true } },
      },
      orderBy: [{ department: { name: 'asc' } }, { firstName: 'asc' }],
    });
    const nodes = employees.map((e) => ({
      ...e,
      name: `${e.firstName} ${e.lastName}`,
      directReportCount: e.directReports.length,
    }));
    const byDepartment = new Map<string, { id: string; name: string; employees: typeof nodes }>();
    for (const node of nodes) {
      const key = node.department?.id ?? 'unassigned';
      if (!byDepartment.has(key)) {
        byDepartment.set(key, {
          id: key,
          name: node.department?.name ?? 'Unassigned',
          employees: [],
        });
      }
      byDepartment.get(key)!.employees.push(node);
    }
    return {
      nodes,
      roots: nodes.filter((e) => !e.managerId || !nodes.some((n) => n.id === e.managerId)),
      byDepartment: [...byDepartment.values()],
    };
  }

  private async findOrgUnit(tenantId: string, kind: OrgUnitKind, id: string) {
    const row =
      kind === 'departments'
        ? await this.prisma.department.findFirst({ where: { id, tenantId } })
        : kind === 'designations'
          ? await this.prisma.designation.findFirst({ where: { id, tenantId } })
          : kind === 'cost-centers'
            ? await this.prisma.costCenter.findFirst({ where: { id, tenantId } })
            : await this.prisma.businessUnit.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException(`${this.objectType(kind)} not found`);
    return row;
  }

  private objectType(kind: OrgUnitKind) {
    return kind === 'departments'
      ? 'Department'
      : kind === 'designations'
        ? 'Designation'
        : kind === 'cost-centers'
          ? 'CostCenter'
          : 'BusinessUnit';
  }

  private async organizationCounts(tenantId: string) {
    const [legalEntities, locations, departments, designations, costCenters, businessUnits] =
      await Promise.all([
        this.prisma.legalEntity.count({ where: { tenantId } }),
        this.prisma.location.count({ where: { tenantId } }),
        this.prisma.department.count({ where: { tenantId } }),
        this.prisma.designation.count({ where: { tenantId } }),
        this.prisma.costCenter.count({ where: { tenantId } }),
        this.prisma.businessUnit.count({ where: { tenantId } }),
      ]);
    return { legalEntities, locations, departments, designations, costCenters, businessUnits };
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
