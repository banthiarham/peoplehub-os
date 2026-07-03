import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import {
  CreateExitRequestDto,
  StartOnboardingDto,
  UpdateExitRequestDto,
  UpdateOnboardingTaskDto,
} from './dto/onboarding.dto';

interface TemplateTaskDef {
  title: string;
  description?: string;
  assignedTo?: string;
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
          select: { id: true, title: true, assignedTo: true, dueDate: true, completedAt: true, isWaived: true },
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

  async start(tenantId: string, dto: StartOnboardingDto) {
    const [employee, template] = await Promise.all([
      this.prisma.employee.findFirst({ where: { id: dto.employeeId, tenantId } }),
      this.prisma.onboardingTemplate.findFirst({ where: { id: dto.templateId, tenantId } }),
    ]);
    if (!employee) throw new NotFoundException('Employee not found');
    if (!template) throw new NotFoundException('Template not found');

    const defs = (template.tasks as unknown as TemplateTaskDef[]) ?? [];
    if (!Array.isArray(defs) || defs.length === 0) {
      throw new BadRequestException('Template has no tasks defined');
    }
    const base = employee.joiningDate ?? new Date();
    const tasks = await this.prisma.onboardingTask.createMany({
      data: defs.map((d) => ({
        tenantId,
        employeeId: employee.id,
        onboardingTemplateId: template.id,
        title: d.title,
        description: d.description,
        assignedTo: d.assignedTo ?? 'HR',
        dueDate: d.dueInDays
          ? new Date(base.getTime() + d.dueInDays * 24 * 60 * 60 * 1000)
          : undefined,
      })),
    });
    return { created: tasks.count };
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
      },
    });
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
        reason: dto.reason,
      },
    });
    await Promise.all([
      this.prisma.employee.update({
        where: { id: dto.employeeId },
        data: { status: 'ON_NOTICE', exitDate: new Date(dto.lastWorkingDate) },
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

    const updated = await this.prisma.exitRequest.update({
      where: { id },
      data: {
        ...(dto.status && { status: dto.status }),
        ...(dto.lastWorkingDate && { lastWorkingDate: new Date(dto.lastWorkingDate) }),
        ...(dto.reason !== undefined && { reason: dto.reason }),
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
}
