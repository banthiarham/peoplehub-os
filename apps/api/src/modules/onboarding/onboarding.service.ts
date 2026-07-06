import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import {
  CreateExitRequestDto,
  CreateOnboardingTemplateDto,
  StartOnboardingDto,
  UpdateExitRequestDto,
  UpdateExitTaskDto,
  UpdateOnboardingTaskDto,
} from './dto/onboarding.dto';

interface TemplateTaskDef {
  title: string;
  description?: string;
  assignedTo?: string;
  category?: string;
  isMandatory?: boolean;
  requiresUpload?: boolean;
  dueInDays?: number;
}

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  async listActive(tenantId: string) {
    const since = new Date();
    since.setDate(since.getDate() - 90);

    const employees = await this.prisma.employee.findMany({
      where: {
        tenantId,
        OR: [
          { joiningDate: { gte: since } },
          { onboardingTasks: { some: { completedAt: null, isWaived: false } } },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeCode: true,
        joiningDate: true,
        status: true,
        department: { select: { name: true } },
        designation: { select: { name: true } },
        onboardingTasks: {
          orderBy: { dueDate: 'asc' },
          select: {
            id: true,
            title: true,
            description: true,
            assignedTo: true,
            category: true,
            isMandatory: true,
            requiresUpload: true,
            documentKey: true,
            acknowledgedAt: true,
            dueDate: true,
            completedAt: true,
            isWaived: true,
          },
        },
      },
      orderBy: { joiningDate: 'desc' },
    });

    return employees.map((e) => {
      const tasks = e.onboardingTasks.filter((t) => !t.isWaived);
      const done = tasks.filter((t) => t.completedAt !== null).length;
      return { ...e, progress: { done, total: tasks.length } };
    });
  }

  async listTemplates(tenantId: string) {
    return this.prisma.onboardingTemplate.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
  }

  async createTemplate(tenantId: string, dto: CreateOnboardingTemplateDto) {
    if (!dto.tasks.length) throw new BadRequestException('Template requires at least one task');
    return this.prisma.onboardingTemplate.create({
      data: {
        tenantId,
        name: dto.name,
        description: dto.description,
        departmentId: dto.departmentId,
        locationId: dto.locationId,
        employmentType: dto.employmentType,
        roleScope: dto.roleScope ?? [],
        tasks: dto.tasks as unknown as Prisma.InputJsonValue,
        documentChecklist: (dto.documentChecklist ?? []) as Prisma.InputJsonValue,
        joiningForms: (dto.joiningForms ?? []) as Prisma.InputJsonValue,
        policyChecklist: (dto.policyChecklist ?? []) as Prisma.InputJsonValue,
        welcomeEmail: (dto.welcomeEmail ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  private async bestTemplateForEmployee(tenantId: string, employee: {
    departmentId: string | null;
    locationId: string | null;
    employmentType: string;
  }) {
    const templates = await this.prisma.onboardingTemplate.findMany({
      where: { tenantId, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    return templates.find((template) =>
      (!template.departmentId || template.departmentId === employee.departmentId) &&
      (!template.locationId || template.locationId === employee.locationId) &&
      (!template.employmentType || template.employmentType === employee.employmentType),
    ) ?? templates[0];
  }

  private checklistTasks(
    items: unknown,
    category: string,
    assignedTo: string,
    requiresUpload = false,
  ): TemplateTaskDef[] {
    if (!Array.isArray(items)) return [];
    return items.map((item) => {
      const rec = typeof item === 'object' && item !== null ? item as Record<string, unknown> : {};
      return {
        title: String(rec.title ?? rec.name ?? item),
        description: typeof rec.description === 'string' ? rec.description : undefined,
        assignedTo: typeof rec.assignedTo === 'string' ? rec.assignedTo : assignedTo,
        category,
        isMandatory: typeof rec.isMandatory === 'boolean' ? rec.isMandatory : true,
        requiresUpload,
        dueInDays: typeof rec.dueInDays === 'number' ? rec.dueInDays : undefined,
      };
    });
  }

  async start(tenantId: string, dto: StartOnboardingDto) {
    const [employee, template] = await Promise.all([
      this.prisma.employee.findFirst({ where: { id: dto.employeeId, tenantId } }),
      dto.templateId
        ? this.prisma.onboardingTemplate.findFirst({ where: { id: dto.templateId, tenantId } })
        : Promise.resolve(null),
    ]);
    if (!employee) throw new NotFoundException('Employee not found');
    const selectedTemplate = template ?? await this.bestTemplateForEmployee(tenantId, employee);
    if (!selectedTemplate) throw new NotFoundException('Onboarding template not found');

    const defs = [
      ...((selectedTemplate.tasks as unknown as TemplateTaskDef[]) ?? []),
      ...this.checklistTasks(selectedTemplate.documentChecklist, 'DOCUMENT', 'EMPLOYEE', true),
      ...this.checklistTasks(selectedTemplate.joiningForms, 'FORM', 'EMPLOYEE'),
      ...this.checklistTasks(selectedTemplate.policyChecklist, 'POLICY', 'EMPLOYEE'),
      ...(dto.buddyEmployeeId
        ? [{
            title: 'Meet assigned buddy',
            description: 'Buddy introduction and first-week support plan',
            assignedTo: 'MANAGER',
            category: 'BUDDY',
            isMandatory: true,
            dueInDays: 1,
          }]
        : []),
      ...(Object.keys((selectedTemplate.welcomeEmail as Record<string, unknown>) ?? {}).length
        ? [{
            title: 'Send welcome email',
            description: 'Send configured welcome note before joining',
            assignedTo: 'HR',
            category: 'HR',
            isMandatory: true,
            dueInDays: -1,
          }]
        : []),
    ];
    if (!Array.isArray(defs) || defs.length === 0) {
      throw new BadRequestException('Template has no tasks defined');
    }
    const base = employee.joiningDate ?? new Date();
    const existing = await this.prisma.onboardingTask.count({
      where: { employeeId: employee.id, onboardingTemplateId: selectedTemplate.id },
    });
    if (existing > 0) throw new BadRequestException('Onboarding already started with this template');
    const tasks = await this.prisma.onboardingTask.createMany({
      data: defs.map((d) => ({
        tenantId,
        employeeId: employee.id,
        onboardingTemplateId: selectedTemplate.id,
        title: d.title,
        description: d.description,
        assignedTo: d.assignedTo ?? 'HR',
        category: d.category ?? 'GENERAL',
        isMandatory: d.isMandatory ?? true,
        requiresUpload: d.requiresUpload ?? false,
        buddyEmployeeId: d.category === 'BUDDY' ? dto.buddyEmployeeId : undefined,
        dueDate: d.dueInDays !== undefined
          ? new Date(base.getTime() + d.dueInDays * 24 * 60 * 60 * 1000)
          : undefined,
      })),
    });
    return { created: tasks.count, templateId: selectedTemplate.id };
  }

  async updateTask(tenantId: string, taskId: string, dto: UpdateOnboardingTaskDto) {
    const task = await this.prisma.onboardingTask.findFirst({ where: { id: taskId, tenantId } });
    if (!task) throw new NotFoundException('Task not found');
    return this.prisma.onboardingTask.update({
      where: { id: taskId },
      data: {
        ...(dto.completed !== undefined && { completedAt: dto.completed ? new Date() : null }),
        ...(dto.isWaived !== undefined && { isWaived: dto.isWaived }),
        ...(dto.assignedTo !== undefined && { assignedTo: dto.assignedTo }),
        ...(dto.dueDate !== undefined && { dueDate: new Date(dto.dueDate) }),
        ...(dto.documentKey !== undefined && { documentKey: dto.documentKey }),
        ...(dto.formResponse !== undefined && { formResponse: dto.formResponse as Prisma.InputJsonValue }),
        ...(dto.acknowledged !== undefined && { acknowledgedAt: dto.acknowledged ? new Date() : null }),
      },
    });
  }

  async preboardingPortal(tenantId: string, employeeId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeCode: true,
        joiningDate: true,
        status: true,
        department: { select: { name: true } },
        designation: { select: { name: true } },
        onboardingTasks: { orderBy: { dueDate: 'asc' } },
      },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    return {
      employee,
      documents: employee.onboardingTasks.filter((task) => task.category === 'DOCUMENT'),
      forms: employee.onboardingTasks.filter((task) => task.category === 'FORM'),
      policies: employee.onboardingTasks.filter((task) => task.category === 'POLICY'),
      checklists: employee.onboardingTasks.filter((task) => !['DOCUMENT', 'FORM', 'POLICY'].includes(task.category)),
    };
  }

  async listExits(tenantId: string) {
    return this.prisma.exitRequest.findMany({
      where: { tenantId },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeCode: true,
            department: { select: { name: true } },
            designation: { select: { name: true } },
          },
        },
        tasks: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createExit(tenantId: string, dto: CreateExitRequestDto, actorUserId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, tenantId },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    const exit = await this.prisma.exitRequest.create({
      data: {
        tenantId,
        employeeId: dto.employeeId,
        resignationDate: new Date(dto.resignationDate),
        lastWorkingDate: new Date(dto.lastWorkingDate),
        noticePeriodDays: employee.noticePeriodDays,
        reason: dto.reason,
      },
    });
    const clearanceTasks = [
      { title: 'Manager approval', assignedTo: 'MANAGER', category: 'HR' },
      { title: 'Recover assigned assets', assignedTo: 'ADMIN', category: 'ASSET' },
      { title: 'Complete knowledge transfer', assignedTo: 'MANAGER', category: 'KT' },
      { title: 'Conduct exit interview', assignedTo: 'HR', category: 'EXIT_INTERVIEW' },
      { title: 'Process final settlement', assignedTo: 'FINANCE', category: 'FINANCE' },
      { title: 'Generate experience and relieving letters', assignedTo: 'HR', category: 'DOCUMENT' },
    ];
    await Promise.all([
      this.prisma.employee.update({
        where: { id: dto.employeeId },
        data: { status: 'ON_NOTICE', exitDate: new Date(dto.lastWorkingDate) },
      }),
      this.prisma.exitTask.createMany({
        data: clearanceTasks.map((task) => ({
          tenantId,
          employeeId: dto.employeeId,
          exitRequestId: exit.id,
          title: task.title,
          assignedTo: task.assignedTo,
          category: task.category,
          isMandatory: true,
          dueDate: new Date(dto.lastWorkingDate),
        })),
      }),
      this.prisma.employeeLifecycleEvent.create({
        data: {
          employeeId: dto.employeeId,
          eventType: 'RESIGNATION',
          fromStatus: employee.status,
          toStatus: 'ON_NOTICE',
          effectiveDate: new Date(dto.resignationDate),
          remarks: dto.reason,
          createdById: actorUserId,
        },
      }),
    ]);
    return exit;
  }

  async updateExit(tenantId: string, id: string, dto: UpdateExitRequestDto, actorUserId: string) {
    const exit = await this.prisma.exitRequest.findFirst({ where: { id, tenantId } });
    if (!exit) throw new NotFoundException('Exit request not found');

    if (dto.status === 'COMPLETED') {
      const pendingTasks = await this.prisma.exitTask.findMany({
        where: {
          tenantId,
          exitRequestId: id,
          isMandatory: true,
          completedAt: null,
          isWaived: false,
        },
      });
      const managerStatus = dto.managerApprovalStatus ?? exit.managerApprovalStatus;
      const hrStatus = dto.hrApprovalStatus ?? exit.hrApprovalStatus;
      if (managerStatus !== 'APPROVED' || hrStatus !== 'APPROVED') {
        throw new BadRequestException('Manager and HR approvals are required before completing exit');
      }
      if (pendingTasks.length) {
        throw new BadRequestException(`Cannot complete exit. Pending mandatory tasks: ${pendingTasks.map((task) => task.title).join(', ')}`);
      }
    }

    const updated = await this.prisma.exitRequest.update({
      where: { id },
      data: {
        ...(dto.status && { status: dto.status }),
        ...(dto.lastWorkingDate && { lastWorkingDate: new Date(dto.lastWorkingDate) }),
        ...(dto.reason !== undefined && { reason: dto.reason }),
        ...(dto.managerApprovalStatus !== undefined && { managerApprovalStatus: dto.managerApprovalStatus }),
        ...(dto.hrApprovalStatus !== undefined && { hrApprovalStatus: dto.hrApprovalStatus }),
        ...(dto.assetRecoveryStatus !== undefined && { assetRecoveryStatus: dto.assetRecoveryStatus }),
        ...(dto.knowledgeTransferStatus !== undefined && { knowledgeTransferStatus: dto.knowledgeTransferStatus }),
        ...(dto.exitInterviewStatus !== undefined && { exitInterviewStatus: dto.exitInterviewStatus }),
        ...(dto.finalSettlementStatus !== undefined && { finalSettlementStatus: dto.finalSettlementStatus }),
        ...(dto.experienceLetterKey !== undefined && { experienceLetterKey: dto.experienceLetterKey }),
        ...(dto.relievingLetterKey !== undefined && { relievingLetterKey: dto.relievingLetterKey }),
        ...(dto.status === 'COMPLETED' && { completedAt: new Date() }),
      },
    });

    if (dto.status === 'COMPLETED') {
      await Promise.all([
        this.prisma.employee.update({
          where: { id: exit.employeeId },
          data: { status: 'EXITED' },
        }),
        this.prisma.employeeLifecycleEvent.create({
          data: {
            employeeId: exit.employeeId,
            eventType: 'EXIT_COMPLETED',
            toStatus: 'EXITED',
            effectiveDate: updated.lastWorkingDate,
            createdById: actorUserId,
          },
        }),
      ]);
    }
    return updated;
  }

  async updateExitTask(tenantId: string, taskId: string, dto: UpdateExitTaskDto) {
    const task = await this.prisma.exitTask.findFirst({ where: { id: taskId, tenantId } });
    if (!task) throw new NotFoundException('Exit task not found');
    return this.prisma.exitTask.update({
      where: { id: taskId },
      data: {
        ...(dto.completed !== undefined && { completedAt: dto.completed ? new Date() : null }),
        ...(dto.isWaived !== undefined && { isWaived: dto.isWaived }),
        ...(dto.assignedTo !== undefined && { assignedTo: dto.assignedTo }),
        ...(dto.documentKey !== undefined && { documentKey: dto.documentKey }),
      },
    });
  }
}
