import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { AuthUser } from '../../common/types/auth-user';
import { CreateProjectDto, ListTimesheetsDto, UpsertTimesheetDto } from './dto/timesheets.dto';

@Injectable()
export class TimesheetsService {
  constructor(private readonly prisma: PrismaService) {}

  private requireEmployee(user: AuthUser): string {
    if (!user.employeeId) throw new ForbiddenException('No employee profile linked to this user');
    return user.employeeId;
  }

  async listProjects(tenantId: string) {
    return this.prisma.project.findMany({
      where: { tenantId },
      include: { _count: { select: { timesheets: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async createProject(tenantId: string, dto: CreateProjectDto) {
    return this.prisma.project.create({ data: { ...dto, tenantId } });
  }

  async updateProject(tenantId: string, id: string, dto: CreateProjectDto) {
    const project = await this.prisma.project.findFirst({ where: { id, tenantId } });
    if (!project) throw new NotFoundException('Project not found');
    return this.prisma.project.update({ where: { id }, data: dto });
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
          employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
          project: { select: { id: true, name: true, code: true } },
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
      include: { project: { select: { id: true, name: true } } },
      orderBy: { weekStart: 'desc' },
      take: 20,
    });
  }

  async upsert(user: AuthUser, dto: UpsertTimesheetDto) {
    const employeeId = this.requireEmployee(user);
    const weekStart = new Date(dto.weekStart);
    const totalHours = dto.entries.reduce((s, e) => s + e.hours, 0);
    const billableHours = dto.entries
      .filter((e) => e.billable !== false)
      .reduce((s, e) => s + e.hours, 0);
    const entriesJson = dto.entries as unknown as Prisma.InputJsonValue;

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
        projectId: dto.projectId,
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
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const sheets = await this.prisma.timesheet.findMany({
      where: { tenantId, weekStart: { gte: monthStart } },
      include: { project: { select: { name: true } } },
    });
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
    };
  }
}
