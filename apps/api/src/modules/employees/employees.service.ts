import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PermissionType, Prisma, ScopeType } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { AuthUser } from '../../common/types/auth-user';
import { RbacService } from '../rbac/rbac.service';
import { LeaveBalanceInitializationService } from '../leave/leave-balance-initialization.service';
import {
  BulkDocumentDto,
  BulkImportEmployeesDto,
  BulkManagerChangeDto,
  BulkSalaryAssignmentDto,
  BulkUpdateEmployeesDto,
  CreateDocumentDto,
  CreateEmployeeDto,
  CreateLifecycleEventDto,
  UpdateEmployeeDto,
} from './dto/create-employee.dto';
import { ListEmployeesDto } from './dto/list-employees.dto';

const employeeListInclude = {
  department: { select: { id: true, name: true } },
  designation: { select: { id: true, name: true, grade: true } },
  location: { select: { id: true, name: true } },
  legalEntity: { select: { id: true, name: true } },
  costCenter: { select: { id: true, name: true } },
  businessUnit: { select: { id: true, name: true } },
  manager: { select: { id: true, firstName: true, lastName: true } },
  user: { select: { email: true, avatarUrl: true, userRoles: { include: { role: true } } } },
} satisfies Prisma.EmployeeInclude;

const sensitiveFields = new Set([
  'bankDetails',
  'pan',
  'aadhaar',
  'uan',
  'esicNumber',
  'taxRegime',
  'legalEntityId',
  'costCenterId',
  'businessUnitId',
]);

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly balanceInitialization: LeaveBalanceInitializationService,
  ) {}

  async list(user: AuthUser, q: ListEmployeesDto) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const where: Prisma.EmployeeWhereInput = {
      tenantId: user.tenantId,
      ...(q.departmentId && { departmentId: q.departmentId }),
      ...(q.designationId && { designationId: q.designationId }),
      ...(q.locationId && { locationId: q.locationId }),
      ...(q.legalEntityId && { legalEntityId: q.legalEntityId }),
      ...(q.managerId && { managerId: q.managerId }),
      ...(q.role && { user: { userRoles: { some: { role: { name: q.role } } } } }),
      ...(q.status && { status: q.status }),
      ...(q.employmentType && { employmentType: q.employmentType }),
      ...(q.search && {
        OR: [
          { firstName: { contains: q.search, mode: 'insensitive' as const } },
          { lastName: { contains: q.search, mode: 'insensitive' as const } },
          { preferredName: { contains: q.search, mode: 'insensitive' as const } },
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
      data: data.map((employee) => this.decorateListRow(employee)),
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
    const [
      departments,
      designations,
      locations,
      legalEntities,
      costCenters,
      businessUnits,
      managers,
      roles,
      salaryStructures,
    ] = await Promise.all([
      this.prisma.department.findMany({ where: { tenantId, isActive: true }, select: { id: true, name: true } }),
      this.prisma.designation.findMany({ where: { tenantId, isActive: true }, select: { id: true, name: true, grade: true } }),
      this.prisma.location.findMany({ where: { tenantId, isActive: true }, select: { id: true, name: true } }),
      this.prisma.legalEntity.findMany({ where: { tenantId }, select: { id: true, name: true } }),
      this.prisma.costCenter.findMany({ where: { tenantId, isActive: true }, select: { id: true, name: true } }),
      this.prisma.businessUnit.findMany({ where: { tenantId, isActive: true }, select: { id: true, name: true } }),
      this.prisma.employee.findMany({
        where: { tenantId, status: { notIn: ['EXITED', 'INACTIVE'] } },
        select: { id: true, firstName: true, lastName: true },
        orderBy: { firstName: 'asc' },
      }),
      this.prisma.role.findMany({ where: { tenantId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      this.prisma.salaryStructure.findMany({ where: { tenantId, isActive: true }, select: { id: true, name: true } }),
    ]);
    return { departments, designations, locations, legalEntities, costCenters, businessUnits, managers, roles, salaryStructures };
  }

  async get(user: AuthUser, id: string) {
    const employee = await this.getRaw(user.tenantId, id);
    return this.maskSensitive(employee, user);
  }

  async manager(user: AuthUser, id: string) {
    const employee = await this.getRaw(user.tenantId, id);
    return employee.manager ?? null;
  }

  async team(user: AuthUser, id: string) {
    await this.getRaw(user.tenantId, id);
    return this.prisma.employee.findMany({
      where: { tenantId: user.tenantId, managerId: id },
      include: employeeListInclude,
      orderBy: { firstName: 'asc' },
    });
  }

  async create(tenantId: string, dto: CreateEmployeeDto, actorUserId: string) {
    if (dto.createUser && !dto.workEmail?.trim()) {
      throw new BadRequestException('Work email is required when creating a login user');
    }
    const employeeCode = dto.employeeCode ?? (await this.nextEmployeeCode(tenantId));
    const { createUser, ...rest } = dto;
    const data = this.toEmployeeData(rest);
    let onboardingCredentials: { email: string; temporaryPassword: string } | undefined;
    const employee = await this.prisma.$transaction(async (tx) => {
      const created = await tx.employee.create({
        data: {
          ...data,
          tenantId,
          employeeCode,
          status: dto.status ?? 'ACTIVE',
        },
      });
      if (createUser && dto.workEmail) {
        const temporaryPassword = this.temporaryPassword();
        const user = await tx.user.create({
          data: {
            tenantId,
            email: dto.workEmail.toLowerCase(),
            name: `${dto.firstName} ${dto.lastName}`,
            passwordHash: await bcrypt.hash(temporaryPassword, 10),
            isActive: true,
          },
        });
        const employeeRole = await this.ensureEmployeeRole(tx, tenantId);
        await tx.userRole.create({ data: { userId: user.id, roleId: employeeRole.id } });
        await tx.employee.update({ where: { id: created.id }, data: { userId: user.id } });
        onboardingCredentials = { email: user.email, temporaryPassword };
      }
      await tx.employeeLifecycleEvent.create({
        data: {
          employeeId: created.id,
          eventType: 'JOINED',
          toStatus: created.status,
          effectiveDate: created.joiningDate ?? new Date(),
          createdById: actorUserId,
        },
      });
      await this.balanceInitialization.initializeForEmployee(tenantId, created.id, tx);
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: actorUserId,
          action: 'employee.created',
          objectType: 'Employee',
          objectId: created.id,
          newValue: created as unknown as Prisma.InputJsonValue,
        },
      });
      return created;
    });
    return onboardingCredentials ? { ...employee, onboardingCredentials } : employee;
  }

  async update(user: AuthUser, id: string, dto: UpdateEmployeeDto) {
    const existing = await this.getRaw(user.tenantId, id);
    const { createUser: _createUser, ...rest } = dto;
    const entries = Object.entries(rest).filter(([, value]) => value !== undefined);
    const sensitive = entries.filter(([key]) => sensitiveFields.has(key));
    const normal = Object.fromEntries(entries.filter(([key]) => !sensitiveFields.has(key))) as UpdateEmployeeDto;
    const canUpdateLegalEntity = user.roles.includes('Tenant Owner');
    const pendingSensitive = user.isSuperAdmin
      ? []
      : sensitive.filter(([key]) => key !== 'legalEntityId' || !canUpdateLegalEntity);
    const directSensitive = user.isSuperAdmin
      ? sensitive
      : sensitive.filter(([key]) => key === 'legalEntityId' && canUpdateLegalEntity);

    if (pendingSensitive.length) {
      await this.createPendingSensitiveChanges(user, existing, pendingSensitive);
    }

    const directUpdates = Object.fromEntries(directSensitive);
    const payload = this.toEmployeeData({ ...normal, ...directUpdates });
    const changedEntries = Object.entries({ ...normal, ...directUpdates }).filter(([key, value]) =>
      this.changed(existing as Record<string, unknown>, key, value),
    );

    const updated = changedEntries.length
      ? await this.prisma.employee.update({ where: { id }, data: payload })
      : existing;

    if (changedEntries.length > 0) {
      await this.createProfileChanges(user.tenantId, id, user.userId, existing, changedEntries, true);
      await this.audit(user.tenantId, user.userId, 'employee.updated', 'Employee', id, existing, updated);
    }

    return {
      employee: updated,
      pendingSensitiveChanges: pendingSensitive.length,
    };
  }

  async approveProfileChange(user: AuthUser, changeId: string) {
    if (!user.isSuperAdmin && !user.roles.some((r) => ['Tenant Owner', 'HR Admin'].includes(r))) {
      throw new ForbiddenException('Not allowed to approve profile changes');
    }
    const change = await this.prisma.employeeProfileChange.findFirst({
      where: { id: changeId, approvedAt: null, employee: { tenantId: user.tenantId } },
      include: { employee: true },
    });
    if (!change) throw new NotFoundException('Pending profile change not found');
    if (change.changedById === user.userId) throw new BadRequestException('Maker cannot approve their own change');
    const value = this.parseChangeValue(change.fieldName, change.newValue);
    const updated = await this.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.update({
        where: { id: change.employeeId },
        data: { [change.fieldName]: value },
      });
      await tx.employeeProfileChange.update({
        where: { id: change.id },
        data: { approvedById: user.userId, approvedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          actorId: user.userId,
          action: 'employee.profile_change.approved',
          objectType: 'EmployeeProfileChange',
          objectId: change.id,
          oldValue: { [change.fieldName]: change.oldValue },
          newValue: { [change.fieldName]: change.newValue },
        },
      });
      return employee;
    });
    return updated;
  }

  async pendingProfileChanges(user: AuthUser) {
    return this.prisma.employeeProfileChange.findMany({
      where: { approvedAt: null, employee: { tenantId: user.tenantId } },
      include: { employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deactivate(user: AuthUser, id: string) {
    const existing = await this.getRaw(user.tenantId, id);
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
        createdById: user.userId,
      },
    });
    await this.audit(user.tenantId, user.userId, 'employee.deactivated', 'Employee', id, existing, updated);
    return updated;
  }

  async listDocuments(user: AuthUser, employeeId: string) {
    await this.getRaw(user.tenantId, employeeId);
    if (!(await this.rbac.canViewSensitive(user, 'documents'))) return [];
    return this.prisma.employeeDocument.findMany({
      where: { employeeId, tenantId: user.tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addDocument(user: AuthUser, employeeId: string, dto: CreateDocumentDto) {
    await this.getRaw(user.tenantId, employeeId);
    const document = await this.prisma.employeeDocument.create({
      data: { ...dto, employeeId, tenantId: user.tenantId, uploadedById: user.userId },
    });
    await this.audit(user.tenantId, user.userId, 'employee.document_uploaded', 'EmployeeDocument', document.id, null, document);
    return document;
  }

  async removeDocument(user: AuthUser, docId: string) {
    const doc = await this.prisma.employeeDocument.findFirst({ where: { id: docId, tenantId: user.tenantId } });
    if (!doc) throw new NotFoundException('Document not found');
    await this.prisma.employeeDocument.delete({ where: { id: docId } });
    await this.audit(user.tenantId, user.userId, 'employee.document_deleted', 'EmployeeDocument', docId, doc, null);
    return { success: true };
  }

  async lifecycle(user: AuthUser, employeeId: string) {
    await this.getRaw(user.tenantId, employeeId);
    return this.prisma.employeeLifecycleEvent.findMany({
      where: { employeeId },
      orderBy: { effectiveDate: 'desc' },
    });
  }

  async addLifecycleEvent(user: AuthUser, employeeId: string, dto: CreateLifecycleEventDto) {
    const existing = await this.getRaw(user.tenantId, employeeId);
    const event = await this.prisma.employeeLifecycleEvent.create({
      data: { ...dto, employeeId, createdById: user.userId },
    });
    await this.audit(user.tenantId, user.userId, 'employee.lifecycle_event_created', 'Employee', employeeId, existing, event);
    return event;
  }

  async bulkImport(user: AuthUser, dto: BulkImportEmployeesDto) {
    const created = [];
    for (const employee of dto.employees) {
      created.push(await this.create(user.tenantId, employee, user.userId));
    }
    return { imported: created.length, employees: created };
  }

  async bulkUpdate(user: AuthUser, dto: BulkUpdateEmployeesDto) {
    let updated = 0;
    for (const employeeId of dto.employeeIds) {
      await this.update(user, employeeId, dto.updates);
      updated++;
    }
    return { updated };
  }

  async bulkDocuments(user: AuthUser, dto: BulkDocumentDto) {
    const data = dto.employeeIds.map((employeeId) => ({
      tenantId: user.tenantId,
      employeeId,
      type: dto.type,
      name: dto.name,
      fileKey: dto.fileKey,
      uploadedById: user.userId,
    }));
    await this.prisma.employeeDocument.createMany({ data });
    await this.audit(user.tenantId, user.userId, 'employee.documents_bulk_uploaded', 'EmployeeDocument', 'bulk', null, data);
    return { uploaded: data.length };
  }

  async bulkManager(user: AuthUser, dto: BulkManagerChangeDto) {
    await this.getRaw(user.tenantId, dto.managerId);
    const result = await this.prisma.employee.updateMany({
      where: { tenantId: user.tenantId, id: { in: dto.employeeIds } },
      data: { managerId: dto.managerId },
    });
    await this.audit(user.tenantId, user.userId, 'employee.manager_bulk_changed', 'Employee', 'bulk', null, dto);
    return { updated: result.count };
  }

  async bulkSalary(user: AuthUser, dto: BulkSalaryAssignmentDto) {
    const structure = await this.prisma.salaryStructure.findFirst({
      where: { id: dto.salaryStructureId, tenantId: user.tenantId },
    });
    if (!structure) throw new NotFoundException('Salary structure not found');
    await this.prisma.employeeSalary.updateMany({
      where: { employeeId: { in: dto.employeeIds }, effectiveTo: null },
      data: { effectiveTo: new Date(dto.effectiveFrom) },
    });
    await this.prisma.employeeSalary.createMany({
      data: dto.employeeIds.map((employeeId) => ({
        employeeId,
        salaryStructureId: dto.salaryStructureId,
        ctc: dto.ctc,
        effectiveFrom: new Date(dto.effectiveFrom),
        components: [],
      })),
    });
    await this.audit(user.tenantId, user.userId, 'employee.salary_bulk_assigned', 'EmployeeSalary', 'bulk', null, dto);
    return { assigned: dto.employeeIds.length };
  }

  async bulkAssignPolicies(user: AuthUser, body: { employeeIds: string[]; policyType: string; policyId: string }) {
    await this.audit(user.tenantId, user.userId, 'employee.policy_bulk_assigned', 'Employee', 'bulk', null, body);
    return { assigned: body.employeeIds.length, policyType: body.policyType, policyId: body.policyId };
  }

  private async getRaw(tenantId: string, id: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, tenantId },
      include: {
        ...employeeListInclude,
        dottedManager: { select: { id: true, firstName: true, lastName: true } },
        directReports: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeCode: true,
            designation: { select: { name: true } },
          },
        },
        documents: { orderBy: { createdAt: 'desc' }, take: 20 },
        lifecycleEvents: { orderBy: { effectiveDate: 'desc' }, take: 20 },
        employeeSalaries: {
          orderBy: { effectiveFrom: 'desc' },
          take: 1,
          include: { salaryStructure: { select: { id: true, name: true } } },
        },
        assetAssignments: {
          where: { returnedAt: null },
          include: { asset: { select: { id: true, name: true, category: true, serialNumber: true } } },
        },
      },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    return employee;
  }

  private async maskSensitive<T extends Record<string, unknown>>(employee: T, user: AuthUser) {
    const result: Record<string, unknown> = { ...employee };
    const [taxIds, bankDetails, salary, documents, personal] = await Promise.all([
      this.rbac.canViewSensitive(user, 'taxIds'),
      this.rbac.canViewSensitive(user, 'bankDetails'),
      this.rbac.canViewSensitive(user, 'salary'),
      this.rbac.canViewSensitive(user, 'documents'),
      this.rbac.canViewSensitive(user, 'personal'),
    ]);
    if (!taxIds) {
      result.pan = this.maskId(result.pan);
      result.aadhaar = this.maskId(result.aadhaar);
      result.uan = this.maskId(result.uan);
      result.esicNumber = this.maskId(result.esicNumber);
    }
    if (!bankDetails) result.bankDetails = null;
    if (!salary) result.employeeSalaries = [];
    if (!documents) result.documents = [];
    if (!personal) {
      result.personalEmail = null;
      result.address = null;
      result.emergencyContact = null;
      result.dateOfBirth = null;
    }
    return result;
  }

  private decorateListRow<T extends { user?: { userRoles?: Array<{ role: { name: string } }> } | null }>(employee: T) {
    return {
      ...employee,
      roles: employee.user?.userRoles?.map((ur) => ur.role.name) ?? [],
    };
  }

  private async createPendingSensitiveChanges(
    user: AuthUser,
    existing: Record<string, unknown>,
    changes: Array<[string, unknown]>,
  ) {
    await this.createProfileChanges(user.tenantId, existing.id as string, user.userId, existing, changes, false);
    const requester = await this.prisma.employee.findFirst({ where: { userId: user.userId, tenantId: user.tenantId } });
    const approver = await this.prisma.employee.findFirst({
      where: {
        tenantId: user.tenantId,
        user: { userRoles: { some: { role: { name: { in: ['Tenant Owner', 'Super Admin'] } } } } },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (requester) {
      await this.prisma.approvalRequest.create({
        data: {
          tenantId: user.tenantId,
          requesterId: requester.id,
          approverId: approver?.id,
          module: 'employees',
          objectType: 'EmployeeProfileChange',
          objectId: existing.id as string,
          requestData: { fields: changes.map(([fieldName]) => fieldName) },
        },
      });
    }
  }

  private async createProfileChanges(
    tenantId: string,
    employeeId: string,
    actorUserId: string,
    existing: Record<string, unknown>,
    changes: Array<[string, unknown]>,
    approved: boolean,
  ) {
    await this.prisma.employeeProfileChange.createMany({
      data: changes
        .filter(([key, value]) => this.changed(existing, key, value))
        .map(([fieldName, newValue]) => ({
          employeeId,
          fieldName,
          oldValue: this.stringifyChangeValue(existing[fieldName]),
          newValue: this.stringifyChangeValue(newValue),
          changedById: actorUserId,
          approvedById: approved ? actorUserId : null,
          approvedAt: approved ? new Date() : null,
        })),
    });
    await this.audit(tenantId, actorUserId, approved ? 'employee.profile_changed' : 'employee.profile_change_pending', 'Employee', employeeId, null, changes);
  }

  private toEmployeeData(dto: Partial<CreateEmployeeDto | UpdateEmployeeDto>): Prisma.EmployeeUncheckedCreateInput {
    const data: Record<string, unknown> = { ...dto };
    for (const key of ['dateOfBirth', 'joiningDate', 'confirmationDate', 'probationEndDate', 'exitDate']) {
      if (typeof data[key] === 'string') data[key] = new Date(data[key] as string);
    }
    return data as Prisma.EmployeeUncheckedCreateInput;
  }

  private changed(existing: Record<string, unknown>, key: string, value: unknown) {
    return this.stringifyChangeValue(existing[key]) !== this.stringifyChangeValue(value);
  }

  private stringifyChangeValue(value: unknown) {
    if (value instanceof Date) return value.toISOString();
    if (value === undefined || value === null) return null;
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  private parseChangeValue(fieldName: string, value: string | null) {
    if (value === null) return null;
    if (['bankDetails', 'address', 'emergencyContact'].includes(fieldName)) return JSON.parse(value);
    if (['dateOfBirth', 'joiningDate', 'confirmationDate', 'probationEndDate', 'exitDate'].includes(fieldName)) return new Date(value);
    if (fieldName === 'noticePeriodDays') return Number(value);
    return value;
  }

  private maskId(value: unknown) {
    if (!value || typeof value !== 'string') return null;
    return value.length <= 4 ? '****' : `${'*'.repeat(Math.max(4, value.length - 4))}${value.slice(-4)}`;
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

  private temporaryPassword() {
    return `VioHr@${randomBytes(6).toString('base64url')}`;
  }

  private async ensureEmployeeRole(tx: Prisma.TransactionClient, tenantId: string) {
    const role = await tx.role.upsert({
      where: { tenantId_name: { tenantId, name: 'Employee' } },
      update: {},
      create: {
        tenantId,
        name: 'Employee',
        description: 'Employee self-service access for attendance, leave, documents, helpdesk and payslips',
        isSystem: true,
      },
    });
    await tx.permission.createMany({
      data: [
        { module: 'attendance', permissionType: PermissionType.VIEW },
        { module: 'attendance', permissionType: PermissionType.CREATE },
        { module: 'leave', permissionType: PermissionType.VIEW },
        { module: 'leave', permissionType: PermissionType.CREATE },
        { module: 'payroll', permissionType: PermissionType.VIEW },
        { module: 'documents', permissionType: PermissionType.VIEW },
        { module: 'helpdesk', permissionType: PermissionType.VIEW },
        { module: 'helpdesk', permissionType: PermissionType.CREATE },
        { module: 'notifications', permissionType: PermissionType.VIEW },
        { module: 'employees', permissionType: PermissionType.VIEW },
      ].map((permission) => ({
        roleId: role.id,
        module: permission.module,
        permissionType: permission.permissionType,
        scopeType: ScopeType.OWN_DATA,
      })),
      skipDuplicates: true,
    });
    return role;
  }
}
