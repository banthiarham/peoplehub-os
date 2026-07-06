import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TicketPriority, TicketStatus } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { AuthUser } from '../../common/types/auth-user';

@Injectable()
export class HelpdeskService {
  constructor(private readonly prisma: PrismaService) {}

  private slaHours(priority: TicketPriority): number {
    return { URGENT: 4, HIGH: 8, MEDIUM: 24, LOW: 72 }[priority] ?? 24;
  }

  private routeFor(category: string): string {
    const normalized = category.trim().toUpperCase();
    if (['PAYROLL', 'BENEFITS', 'EXPENSES'].includes(normalized)) return 'Payroll Admin';
    if (['IT', 'ASSETS'].includes(normalized)) return 'IT/Admin';
    if (['ATTENDANCE', 'LEAVE'].includes(normalized)) return 'HR Operations';
    if (['GRIEVANCE'].includes(normalized)) return 'HR Admin';
    return 'HR Helpdesk';
  }

  private withSla<T extends { createdAt: Date; priority: TicketPriority; status: TicketStatus; slaBreached: boolean }>(
    ticket: T,
  ) {
    const dueAt = new Date(ticket.createdAt.getTime() + this.slaHours(ticket.priority) * 3600000);
    const isOpen = !['RESOLVED', 'CLOSED'].includes(ticket.status);
    const breached = ticket.slaBreached || (isOpen && Date.now() > dueAt.getTime());
    return { ...ticket, sla: { dueAt, hours: this.slaHours(ticket.priority), breached } };
  }

  async list(
    tenantId: string,
    user: AuthUser,
    q: { page?: number; pageSize?: number; status?: TicketStatus; priority?: TicketPriority; category?: string; search?: string },
  ) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const where: Prisma.TicketWhereInput = {
      tenantId,
      ...(user.roles.length === 1 && user.roles.includes('Employee') && user.employeeId
        ? { employeeId: user.employeeId }
        : {}),
      ...(q.status && { status: q.status }),
      ...(q.priority && { priority: q.priority }),
      ...(q.category && { category: q.category }),
      ...(q.search && { subject: { contains: q.search, mode: 'insensitive' as const } }),
    };
    const [data, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where,
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
          _count: { select: { comments: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.ticket.count({ where }),
    ]);
    return {
      data: data.map((ticket) => this.withSla(ticket)),
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async myTickets(user: AuthUser) {
    if (!user.employeeId) throw new ForbiddenException('No employee profile linked');
    const tickets = await this.prisma.ticket.findMany({
      where: { tenantId: user.tenantId, employeeId: user.employeeId },
      include: { _count: { select: { comments: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return tickets.map((ticket) => this.withSla(ticket));
  }

  async get(tenantId: string, id: string) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id, tenantId },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
        comments: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return this.withSla(ticket);
  }

  async create(
    user: AuthUser,
    data: { category: string; subject: string; description: string; priority?: TicketPriority },
  ) {
    if (!user.employeeId) throw new ForbiddenException('No employee profile linked');
    const category = data.category.trim().toUpperCase();
    const priority = data.priority ?? (category === 'PAYROLL' ? 'HIGH' : 'MEDIUM');
    return this.prisma.ticket.create({
      data: {
        ...data,
        category,
        priority,
        assignedTo: this.routeFor(category),
        tenantId: user.tenantId,
        employeeId: user.employeeId,
      },
    });
  }

  async update(
    tenantId: string,
    id: string,
    data: { status?: TicketStatus; priority?: TicketPriority; assignedTo?: string },
  ) {
    await this.get(tenantId, id);
    const priority = data.priority;
    return this.prisma.ticket.update({
      where: { id },
      data: {
        ...data,
        ...(priority && { slaBreached: false }),
        ...(data.status === 'RESOLVED' && { resolvedAt: new Date() }),
        ...(data.status === 'CLOSED' && { closedAt: new Date() }),
      },
    });
  }

  async comment(user: AuthUser, id: string, message: string) {
    await this.get(user.tenantId, id);
    return this.prisma.ticketComment.create({
      data: { ticketId: id, authorId: user.userId, message },
    });
  }

  async stats(tenantId: string) {
    const now = new Date();
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const [byStatus, byCategory, resolvedThisWeek, resolved, openTickets] = await Promise.all([
      this.prisma.ticket.groupBy({ by: ['status'], where: { tenantId }, _count: true }),
      this.prisma.ticket.groupBy({ by: ['category'], where: { tenantId }, _count: true }),
      this.prisma.ticket.count({ where: { tenantId, resolvedAt: { gte: weekAgo, lte: now } } }),
      this.prisma.ticket.findMany({
        where: { tenantId, resolvedAt: { not: null, lte: now } },
        select: { createdAt: true, resolvedAt: true },
        take: 100,
        orderBy: { resolvedAt: 'desc' },
      }),
      this.prisma.ticket.findMany({
        where: { tenantId, status: { notIn: ['RESOLVED', 'CLOSED'] } },
        select: { createdAt: true, priority: true, status: true, slaBreached: true },
      }),
    ]);
    const slaOpen = openTickets.map((ticket) => this.withSla(ticket));
    const count = (s: string) => byStatus.find((b) => b.status === s)?._count ?? 0;
    return {
      open: count('OPEN'),
      inProgress: count('IN_PROGRESS'),
      waiting: count('WAITING'),
      slaBreached: slaOpen.filter((ticket) => ticket.sla.breached).length,
      dueSoon: slaOpen.filter((ticket) => {
        const hoursLeft = (ticket.sla.dueAt.getTime() - Date.now()) / 3600000;
        return hoursLeft >= 0 && hoursLeft <= 4;
      }).length,
      resolvedThisWeek,
      avgResolutionHours: resolved.length
        ? Math.round(
            resolved.reduce(
              (s, t) =>
                s +
                Math.max(0, ((t.resolvedAt as Date).getTime() - t.createdAt.getTime()) / 3600000),
              0,
            ) / resolved.length,
          )
        : null,
      byCategory: byCategory.map((c) => ({ category: c.category, count: c._count })),
    };
  }
}
