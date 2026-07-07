import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { AuthUser } from '../../common/types/auth-user';
import {
  CreateClientDto,
  CreateProjectDto,
  CreateProjectTaskDto,
  ListTimesheetsDto,
  UpsertTimesheetDto,
} from './dto/timesheets.dto';

type TimesheetEntry = {
  date: string;
  hours: number;
  task?: string;
  taskId?: string;
  billable?: boolean;
};

@Injectable()
export class TimesheetsService {
  constructor(private readonly prisma: PrismaService) {}

  private requireEmployee(user: AuthUser): string {
    if (!user.employeeId) throw new ForbiddenException('No employee profile linked to this user');
    return user.employeeId;
  }

  private async ensureProject(tenantId: string, projectId?: string | null) {
    if (!projectId) return null;
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, tenantId },
      select: { id: true, name: true, billingRate: true, clientId: true, clientName: true },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  private async ensureTasks(tenantId: string, taskIds: string[]) {
    if (!taskIds.length) return new Map<string, { id: string; name: string; isBillable: boolean; rateOverride: number | null }>();
    const tasks = await this.prisma.projectTask.findMany({
      where: { tenantId, id: { in: taskIds } },
      select: { id: true, name: true, isBillable: true, rateOverride: true },
    });
    if (tasks.length !== new Set(taskIds).size) throw new NotFoundException('One or more tasks were not found');
    return new Map(tasks.map((task) => [task.id, task]));
  }

  private normalizeEntries(entries: TimesheetEntry[], taskMap: Map<string, { id: string; name: string; isBillable: boolean; rateOverride: number | null }>) {
    return entries.map((entry) => {
      const task = entry.taskId ? taskMap.get(entry.taskId) : null;
      const billable = entry.billable !== false && (task ? task.isBillable !== false : true);
      return {
        date: entry.date,
        hours: entry.hours,
        taskId: entry.taskId ?? null,
        task: entry.task ?? task?.name ?? null,
        billable,
      };
    });
  }

  async listClients(tenantId: string) {
    return this.prisma.client.findMany({
      where: { tenantId },
      include: {
        _count: { select: { projects: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async createClient(tenantId: string, dto: CreateClientDto) {
    return this.prisma.client.create({
      data: {
        ...dto,
        tenantId,
      },
    });
  }

  async updateClient(tenantId: string, id: string, dto: CreateClientDto) {
    const client = await this.prisma.client.findFirst({ where: { id, tenantId } });
    if (!client) throw new NotFoundException('Client not found');
    return this.prisma.client.update({
      where: { id },
      data: { ...dto },
    });
  }

  async listTasks(tenantId: string, projectId?: string) {
    return this.prisma.projectTask.findMany({
      where: { tenantId, ...(projectId && { projectId }) },
      include: {
        project: { select: { id: true, name: true, code: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createTask(tenantId: string, dto: CreateProjectTaskDto) {
    if (dto.projectId) await this.ensureProject(tenantId, dto.projectId);
    return this.prisma.projectTask.create({
      data: {
        tenantId,
        ...dto,
      },
    });
  }

  async updateTask(tenantId: string, id: string, dto: CreateProjectTaskDto) {
    const task = await this.prisma.projectTask.findFirst({ where: { id, tenantId } });
    if (!task) throw new NotFoundException('Task not found');
    if (dto.projectId) await this.ensureProject(tenantId, dto.projectId);
    return this.prisma.projectTask.update({
      where: { id },
      data: { ...dto },
    });
  }

  async listProjects(tenantId: string) {
    return this.prisma.project.findMany({
      where: { tenantId },
      include: {
        client: { select: { id: true, name: true, code: true } },
        _count: { select: { timesheets: true, tasks: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async createProject(tenantId: string, dto: CreateProjectDto) {
    if (dto.clientId) await this.ensureClient(tenantId, dto.clientId);
    return this.prisma.project.create({
      data: {
        ...dto,
        tenantId,
        ...(dto.startDate && { startDate: new Date(dto.startDate) }),
        ...(dto.endDate && { endDate: new Date(dto.endDate) }),
      },
    });
  }

  async updateProject(tenantId: string, id: string, dto: CreateProjectDto) {
    const project = await this.prisma.project.findFirst({ where: { id, tenantId } });
    if (!project) throw new NotFoundException('Project not found');
    if (dto.clientId) await this.ensureClient(tenantId, dto.clientId);
    return this.prisma.project.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.startDate && { startDate: new Date(dto.startDate) }),
        ...(dto.endDate && { endDate: new Date(dto.endDate) }),
      },
    });
  }

  private async ensureClient(tenantId: string, clientId: string) {
    const client = await this.prisma.client.findFirst({ where: { id: clientId, tenantId } });
    if (!client) throw new NotFoundException('Client not found');
    return client;
  }

  async list(tenantId: string, q: ListTimesheetsDto) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const where: Prisma.TimesheetWhereInput = {
      tenantId,
      ...(q.employeeId && { employeeId: q.employeeId }),
      ...(q.projectId && { projectId: q.projectId }),
      ...(q.status && { status: q.status }),
    };
    const [data, total] = await Promise.all([
      this.prisma.timesheet.findMany({
        where,
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true, employmentType: true } },
          project: {
            select: {
              id: true,
              name: true,
              code: true,
              clientName: true,
              client: { select: { id: true, name: true, code: true } },
            },
          },
        },
        orderBy: { weekStart: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.timesheet.count({ where }),
    ]);
    return { data, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }

  async mine(user: AuthUser) {
    const employeeId = this.requireEmployee(user);
    return this.prisma.timesheet.findMany({
      where: { employeeId },
      include: {
        project: {
          select: { id: true, name: true, clientName: true, client: { select: { id: true, name: true } } },
        },
      },
      orderBy: { weekStart: 'desc' },
      take: 20,
    });
  }

  async upsert(user: AuthUser, dto: UpsertTimesheetDto) {
    const employeeId = this.requireEmployee(user);
    const weekStart = new Date(dto.weekStart);
    const taskIds = dto.entries.map((entry) => entry.taskId).filter(Boolean) as string[];
    const taskMap = await this.ensureTasks(user.tenantId, taskIds);
    const normalized = this.normalizeEntries(dto.entries as TimesheetEntry[], taskMap);
    const totalHours = normalized.reduce((s, e) => s + e.hours, 0);
    const billableHours = normalized.filter((e) => e.billable !== false).reduce((s, e) => s + e.hours, 0);
    const entriesJson = normalized as unknown as Prisma.InputJsonValue;

    const project = await this.ensureProject(user.tenantId, dto.projectId);

    const existing = await this.prisma.timesheet.findFirst({
      where: { employeeId, weekStart, projectId: dto.projectId ?? null },
    });
    if (existing) {
      if (existing.status === 'APPROVED') {
        throw new BadRequestException('Approved timesheets cannot be edited');
      }
      return this.prisma.timesheet.update({
        where: { id: existing.id },
        data: { entries: entriesJson, totalHours, billableHours },
      });
    }
    return this.prisma.timesheet.create({
      data: {
        tenantId: user.tenantId,
        employeeId,
        projectId: project?.id ?? dto.projectId ?? null,
        weekStart,
        entries: entriesJson,
        totalHours,
        billableHours,
      },
    });
  }

  async submit(user: AuthUser, id: string) {
    const employeeId = this.requireEmployee(user);
    const ts = await this.prisma.timesheet.findFirst({ where: { id, employeeId } });
    if (!ts) throw new NotFoundException('Timesheet not found');
    return this.prisma.timesheet.update({
      where: { id },
      data: { status: 'SUBMITTED', submittedAt: new Date() },
    });
  }

  async decide(tenantId: string, id: string, decision: 'APPROVED' | 'REJECTED') {
    const ts = await this.prisma.timesheet.findFirst({ where: { id, tenantId } });
    if (!ts) throw new NotFoundException('Timesheet not found');
    return this.prisma.timesheet.update({ where: { id }, data: { status: decision } });
  }

  async summary(tenantId: string) {
    const periodStart = new Date(Date.now() - 35 * 24 * 3600 * 1000);
    periodStart.setHours(0, 0, 0, 0);
    const [sheets, activeEmployees] = await Promise.all([
      this.prisma.timesheet.findMany({
        where: { tenantId, weekStart: { gte: periodStart } },
        include: { project: { select: { name: true } } },
      }),
      this.prisma.employee.count({ where: { tenantId, status: { notIn: ['EXITED', 'INACTIVE'] } } }),
    ]);
    const byProject = new Map<string, { total: number; billable: number }>();
    for (const s of sheets) {
      const key = s.project?.name ?? 'No project';
      const v = byProject.get(key) ?? { total: 0, billable: 0 };
      v.total += s.totalHours;
      v.billable += s.billableHours;
      byProject.set(key, v);
    }
    return {
      byProject: [...byProject.entries()].map(([project, v]) => ({ project, ...v })),
      totalHours: sheets.reduce((s, t) => s + t.totalHours, 0),
      billableHours: sheets.reduce((s, t) => s + t.billableHours, 0),
      nonBillableHours: sheets.reduce((s, t) => s + Math.max(0, t.totalHours - t.billableHours), 0),
      overtimeHours: sheets.reduce((s, t) => s + Math.max(0, t.totalHours - 40), 0),
      billableRate: sheets.length
        ? Math.round(
            (sheets.reduce((s, t) => s + t.billableHours, 0) /
              Math.max(1, sheets.reduce((s, t) => s + t.totalHours, 0))) *
              100,
          )
        : 0,
      capacityHours: activeEmployees * 160,
      utilizationRate: activeEmployees
        ? Math.round((sheets.reduce((s, t) => s + t.totalHours, 0) / (activeEmployees * 160)) * 100)
        : 0,
    };
  }

  async utilization(tenantId: string) {
    const periodStart = new Date(Date.now() - 35 * 24 * 3600 * 1000);
    periodStart.setHours(0, 0, 0, 0);
    const sheets = await this.prisma.timesheet.findMany({
      where: { tenantId, weekStart: { gte: periodStart } },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true, employmentType: true } },
        project: {
          select: { id: true, name: true, code: true, budgetHours: true, billingRate: true, clientId: true },
        },
      },
      orderBy: { weekStart: 'desc' },
    });

    const employees = new Map<string, { employee: string; employeeCode: string; total: number; billable: number; overtime: number }>();
    const projects = new Map<
      string,
      { project: string; code: string | null; budgetHours: number | null; billingRate: number | null; total: number; billable: number; revenue: number }
    >();

    for (const sheet of sheets) {
      const employeeName = `${sheet.employee.firstName} ${sheet.employee.lastName}`;
      const employee = employees.get(sheet.employeeId) ?? {
        employee: employeeName,
        employeeCode: sheet.employee.employeeCode,
        total: 0,
        billable: 0,
        overtime: 0,
      };
      employee.total += sheet.totalHours;
      employee.billable += sheet.billableHours;
      employee.overtime += Math.max(0, sheet.totalHours - 40);
      employees.set(sheet.employeeId, employee);

      const projectKey = sheet.projectId ?? 'unassigned';
      const project = projects.get(projectKey) ?? {
        project: sheet.project?.name ?? 'No project',
        code: sheet.project?.code ?? null,
        budgetHours: sheet.project?.budgetHours ?? null,
        billingRate: sheet.project?.billingRate ?? null,
        total: 0,
        billable: 0,
        revenue: 0,
      };
      project.total += sheet.totalHours;
      project.billable += sheet.billableHours;
      project.revenue += sheet.billableHours * (sheet.project?.billingRate ?? 0);
      projects.set(projectKey, project);
    }

    return {
      employees: [...employees.values()].map((row) => ({
        ...row,
        nonBillable: Math.max(0, row.total - row.billable),
        utilizationRate: Math.round((row.total / 160) * 100),
        billableRate: Math.round((row.billable / Math.max(1, row.total)) * 100),
      })),
      projects: [...projects.values()].map((row) => ({
        ...row,
        nonBillable: Math.max(0, row.total - row.billable),
        budgetBurn: row.budgetHours ? Math.round((row.total / row.budgetHours) * 100) : null,
      })),
    };
  }

  async payrollSync(tenantId: string) {
    const periodStart = new Date();
    periodStart.setDate(1);
    periodStart.setHours(0, 0, 0, 0);
    const sheets = await this.prisma.timesheet.findMany({
      where: { tenantId, status: { in: ['SUBMITTED', 'APPROVED'] }, weekStart: { gte: periodStart } },
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true, employeeCode: true, employmentType: true },
        },
        project: { select: { billingRate: true, name: true } },
      },
      orderBy: [{ employeeId: 'asc' }, { weekStart: 'asc' }],
    });

    const byEmployee = new Map<
      string,
      {
        employeeId: string;
        employee: string;
        employeeCode: string;
        employmentType: string;
        totalHours: number;
        billableHours: number;
        overtimeHours: number;
        hourlyValue: number;
      }
    >();

    for (const sheet of sheets) {
      const current = byEmployee.get(sheet.employeeId) ?? {
        employeeId: sheet.employeeId,
        employee: `${sheet.employee.firstName} ${sheet.employee.lastName}`,
        employeeCode: sheet.employee.employeeCode,
        employmentType: sheet.employee.employmentType,
        totalHours: 0,
        billableHours: 0,
        overtimeHours: 0,
        hourlyValue: 0,
      };
      current.totalHours += sheet.totalHours;
      current.billableHours += sheet.billableHours;
      current.overtimeHours += Math.max(0, sheet.totalHours - 40);
      current.hourlyValue += sheet.billableHours * (sheet.project?.billingRate ?? 0);
      byEmployee.set(sheet.employeeId, current);
    }

    return {
      month: `${periodStart.getFullYear()}-${String(periodStart.getMonth() + 1).padStart(2, '0')}`,
      employees: [...byEmployee.values()],
      totalBillableHours: [...byEmployee.values()].reduce((sum, row) => sum + row.billableHours, 0),
      totalOvertimeHours: [...byEmployee.values()].reduce((sum, row) => sum + row.overtimeHours, 0),
      hourlyWorkerCount: [...byEmployee.values()].filter((row) => ['PART_TIME', 'CONTRACTOR'].includes(row.employmentType)).length,
    };
  }

  async billingCsv(tenantId: string) {
    const utilization = await this.utilization(tenantId);
    const rows = [
      ['Project', 'Code', 'Total Hours', 'Billable Hours', 'Non-billable Hours', 'Billing Rate', 'Estimated Revenue', 'Budget Hours', 'Budget Burn %'],
      ...utilization.projects.map((project) => [
        project.project,
        project.code ?? '',
        project.total,
        project.billable,
        project.nonBillable,
        project.billingRate ?? 0,
        project.revenue,
        project.budgetHours ?? '',
        project.budgetBurn ?? '',
      ]),
    ];
    return rows
      .map((row) =>
        row
          .map((value) => {
            const text = String(value ?? '');
            return text.includes(',') || text.includes('"') ? `"${text.replace(/"/g, '""')}"` : text;
          })
          .join(','),
      )
      .join('\n');
  }
}
