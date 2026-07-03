import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import {
  CreateDocumentDto,
  CreateEmployeeDto,
  CreateLifecycleEventDto,
  UpdateEmployeeDto,
} from './dto/create-employee.dto';
import { ListEmployeesDto } from './dto/list-employees.dto';

const employeeListInclude = {
  department: { select: { id: true, name: true } },
  designation: { select: { id: true, name: true } },
  location: { select: { id: true, name: true } },
  manager: { select: { id: true, firstName: true, lastName: true } },
  user: { select: { email: true, avatarUrl: true } },
} satisfies Prisma.EmployeeInclude;

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, q: ListEmployeesDto) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const where: Prisma.EmployeeWhereInput = {
      tenantId,
      ...(q.departmentId && { departmentId: q.departmentId }),
      ...(q.designationId && { designationId: q.designationId }),
      ...(q.locationId && { locationId: q.locationId }),
      ...(q.status && { status: q.status }),
      ...(q.employmentType && { employmentType: q.employmentType }),
      ...(q.search && {
        OR: [
          { firstName: { contains: q.search, mode: 'insensitive' as const } },
          { lastName: { contains: q.search, mode: 'insensitive' as const } },
          { workEmail: { contains: q.search, mode: 'insensitive' as const } },
          { employeeCode: { contains: q.search, mode: 'insensitive' as const } },
        ],
      }),
    };
    const orderBy: Prisma.EmployeeOrderByWithRelationInput =
      q.sortBy === 'joiningDate'
        ? { joiningDate: q.sortOrder ?? 'desc' }
        : q.sortBy === 'employeeCode'
          ? { employeeCode: q.sortOrder ?? 'asc' }
          : { firstName: q.sortOrder ?? 'asc' };

    const [data, total] = await Promise.all([
      this.prisma.employee.findMany({
        where,
        include: employeeListInclude,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.employee.count({ where }),
    ]);
    return {
      data,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async stats(tenantId: string) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [total, byStatus, newThisMonth, byDept, byType, byGender, departments] =
      await Promise.all([
        this.prisma.employee.count({ where: { tenantId } }),
        this.prisma.employee.groupBy({ by: ['status'], where: { tenantId }, _count: true }),
        this.prisma.employee.count({ where: { tenantId, joiningDate: { gte: startOfMonth } } }),
        this.prisma.employee.groupBy({
          by: ['departmentId'],
          where: { tenantId, status: { notIn: ['EXITED', 'INACTIVE'] } },
          _count: true,
        }),
        this.prisma.employee.groupBy({ by: ['employmentType'], where: { tenantId }, _count: true }),
        this.prisma.employee.groupBy({ by: ['gender'], where: { tenantId }, _count: true }),
        this.prisma.department.findMany({ where: { tenantId }, select: { id: true, name: true } }),
      ]);

    const deptNames = new Map(departments.map((d) => [d.id, d.name]));
    const statusCount = (s: string) => byStatus.find((b) => b.status === s)?._count ?? 0;

    return {
      total,
      active: byStatus
        .filter((b) => ['ACTIVE', 'ON_PROBATION', 'CONFIRMED'].includes(b.status))
        .reduce((sum, b) => sum + b._count, 0),
      onNotice: statusCount('ON_NOTICE'),
      exited: statusCount('EXITED'),
      newThisMonth,
      byDepartment: byDept.map((d) => ({
        department: (d.departmentId && deptNames.get(d.departmentId)) ?? 'Unassigned',
        count: d._count,
      })),
      byEmploymentType: byType.map((t) => ({ type: t.employmentType, count: t._count })),
      byGender: byGender.map((g) => ({ gender: g.gender ?? 'UNSPECIFIED', count: g._count })),
    };
  }

  async options(tenantId: string) {
    const [departments, designations, locations, legalEntities, managers] = await Promise.all([
      this.prisma.department.findMany({ where: { tenantId, isActive: true }, select: { id: true, name: true } }),
      this.prisma.designation.findMany({ where: { tenantId, isActive: true }, select: { id: true, name: true } }),
      this.prisma.location.findMany({ where: { tenantId, isActive: true }, select: { id: true, name: true } }),
      this.prisma.legalEntity.findMany({ where: { tenantId }, select: { id: true, name: true } }),
      this.prisma.employee.findMany({
        where: { tenantId, status: { notIn: ['EXITED', 'INACTIVE'] } },
        select: { id: true, firstName: true, lastName: true },
        orderBy: { firstName: 'asc' },
      }),
    ]);
    return { departments, designations, locations, legalEntities, managers };
  }

  async get(tenantId: string, id: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, tenantId },
      include: {
        ...employeeListInclude,
        legalEntity: { select: { id: true, name: true } },
        directReports: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            designation: { select: { name: true } },
          },
        },
        documents: { orderBy: { createdAt: 'desc' }, take: 20 },
        lifecycleEvents: { orderBy: { effectiveDate: 'desc' }, take: 20 },
      },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    return employee;
  }

  async create(tenantId: string, dto: CreateEmployeeDto, actorUserId: string) {
    const employeeCode = dto.employeeCode ?? (await this.nextEmployeeCode(tenantId));
    const { createUser: _createUser, ...rest } = dto;
    const employee = await this.prisma.employee.create({
      data: {
        ...rest,
        tenantId,
        employeeCode,
        status: dto.status ?? 'ACTIVE',
      },
    });
    await this.prisma.employeeLifecycleEvent.create({
      data: {
        employeeId: employee.id,
        eventType: 'JOINED',
        toStatus: employee.status,
        effectiveDate: employee.joiningDate ?? new Date(),
        createdById: actorUserId,
      },
    });
    return employee;
  }

  async update(tenantId: string, id: string, dto: UpdateEmployeeDto, actorUserId: string) {
    const existing = await this.get(tenantId, id);
    const { createUser: _createUser, ...rest } = dto;

    const changes = Object.entries(rest).filter(([key, value]) => {
      const old = (existing as Record<string, unknown>)[key];
      const oldStr = old instanceof Date ? old.toISOString() : (old?.toString() ?? null);
      return value !== undefined && oldStr !== (value?.toString() ?? null);
    });

    const updated = await this.prisma.employee.update({ where: { id }, data: rest });

    if (changes.length > 0) {
      await this.prisma.employeeProfileChange.createMany({
        data: changes.map(([fieldName, newValue]) => {
          const old = (existing as Record<string, unknown>)[fieldName];
          return {
            employeeId: id,
            fieldName,
            oldValue: old instanceof Date ? old.toISOString() : (old?.toString() ?? null),
            newValue: newValue?.toString() ?? null,
            changedById: actorUserId,
          };
        }),
      });
    }
    return updated;
  }

  async deactivate(tenantId: string, id: string, actorUserId: string) {
    const existing = await this.get(tenantId, id);
    const updated = await this.prisma.employee.update({
      where: { id },
      data: { status: 'INACTIVE' },
    });
    await this.prisma.employeeLifecycleEvent.create({
      data: {
        employeeId: id,
        eventType: 'DEACTIVATED',
        fromStatus: existing.status,
        toStatus: 'INACTIVE',
        effectiveDate: new Date(),
        createdById: actorUserId,
      },
    });
    return updated;
  }

  async listDocuments(tenantId: string, employeeId: string) {
    await this.get(tenantId, employeeId);
    return this.prisma.employeeDocument.findMany({
      where: { employeeId, tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addDocument(tenantId: string, employeeId: string, dto: CreateDocumentDto, actorUserId: string) {
    await this.get(tenantId, employeeId);
    return this.prisma.employeeDocument.create({
      data: { ...dto, employeeId, tenantId, uploadedById: actorUserId },
    });
  }

  async removeDocument(tenantId: string, docId: string) {
    const doc = await this.prisma.employeeDocument.findFirst({ where: { id: docId, tenantId } });
    if (!doc) throw new NotFoundException('Document not found');
    await this.prisma.employeeDocument.delete({ where: { id: docId } });
    return { success: true };
  }

  async lifecycle(tenantId: string, employeeId: string) {
    await this.get(tenantId, employeeId);
    return this.prisma.employeeLifecycleEvent.findMany({
      where: { employeeId },
      orderBy: { effectiveDate: 'desc' },
    });
  }

  async addLifecycleEvent(
    tenantId: string,
    employeeId: string,
    dto: CreateLifecycleEventDto,
    actorUserId: string,
  ) {
    await this.get(tenantId, employeeId);
    return this.prisma.employeeLifecycleEvent.create({
      data: { ...dto, employeeId, createdById: actorUserId },
    });
  }

  private async nextEmployeeCode(tenantId: string): Promise<string> {
    const count = await this.prisma.employee.count({ where: { tenantId } });
    for (let i = count + 1; ; i++) {
      const code = `EMP-${String(i).padStart(4, '0')}`;
      const exists = await this.prisma.employee.findFirst({
        where: { tenantId, employeeCode: code },
        select: { id: true },
      });
      if (!exists) return code;
    }
  }
}
