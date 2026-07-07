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

  private async routeFor(tenantId: string, category: string, priority?: TicketPriority): Promise<string> {
    const normalized = category.trim().toUpperCase();
    const rule = await this.prisma.helpdeskSlaRule.findFirst({
      where: {
        tenantId,
        category: normalized,
        isActive: true,
        ...(priority && { OR: [{ priority }, { priority: null }] }),
      },
      orderBy: [{ priority: 'desc' }, { resolutionHours: 'asc' }],
    });
    if (rule) return rule.assigneeQueue;
    if (['PAYROLL', 'BENEFITS', 'EXPENSES'].includes(normalized)) return 'Payroll Admin';
    if (['IT', 'ASSETS'].includes(normalized)) return 'IT/Admin';
    if (['ATTENDANCE', 'LEAVE'].includes(normalized)) return 'HR Operations';
    if (['GRIEVANCE'].includes(normalized)) return 'HR Admin';
    return 'HR Helpdesk';
  }

  private async slaFor(tenantId: string, category: string, priority: TicketPriority) {
    const rule = await this.prisma.helpdeskSlaRule.findFirst({
      where: {
        tenantId,
        category,
        isActive: true,
        ...(priority && { OR: [{ priority }, { priority: null }] }),
      },
      orderBy: [{ priority: 'desc' }, { resolutionHours: 'asc' }],
    });
    return {
      hours: rule?.resolutionHours ?? this.slaHours(priority),
      responseHours: rule?.responseHours ?? null,
      assigneeQueue: rule?.assigneeQueue ?? null,
    };
  }

  private async withSla<T extends { id: string; createdAt: Date; priority: TicketPriority; status: TicketStatus; slaBreached: boolean; category: string }>(
    tenantId: string,
    ticket: T,
  ) {
    const sla = await this.slaFor(tenantId, ticket.category, ticket.priority);
    const dueAt = new Date(ticket.createdAt.getTime() + sla.hours * 3600000);
    const isOpen = !['RESOLVED', 'CLOSED'].includes(ticket.status);
    const breached = ticket.slaBreached || (isOpen && Date.now() > dueAt.getTime());
    return { ...ticket, sla: { dueAt, hours: sla.hours, breached, responseHours: sla.responseHours, assigneeQueue: sla.assigneeQueue } };
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
      data: await Promise.all(data.map((ticket) => this.withSla(tenantId, ticket))),
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
    return Promise.all(tickets.map((ticket) => this.withSla(user.tenantId, ticket)));
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
    return this.withSla(tenantId, ticket);
  }

  async create(
    user: AuthUser,
    data: { category: string; subject: string; description: string; priority?: TicketPriority; attachments?: string[] },
  ) {
    if (!user.employeeId) throw new ForbiddenException('No employee profile linked');
    const category = data.category.trim().toUpperCase();
    const priority = data.priority ?? (category === 'PAYROLL' ? 'HIGH' : 'MEDIUM');
    const assignedTo = await this.routeFor(user.tenantId, category, priority);
    return this.prisma.ticket.create({
      data: {
        ...data,
        category,
        priority,
        attachments: data.attachments ?? [],
        assignedTo,
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

  async comment(user: AuthUser, id: string, message: string, isInternal = false) {
    await this.get(user.tenantId, id);
    return this.prisma.ticketComment.create({
      data: { ticketId: id, authorId: user.userId, message, isInternal },
    });
  }

  async escalate(user: AuthUser, id: string, assignedTo?: string, reason?: string) {
    const ticket = await this.get(user.tenantId, id);
    const queue = assignedTo ?? (await this.routeFor(user.tenantId, ticket.category, ticket.priority));
    await this.prisma.ticketComment.create({
      data: {
        ticketId: id,
        authorId: user.userId,
        message: reason ?? `Escalated to ${queue}`,
        isInternal: true,
      },
    });
    return this.prisma.ticket.update({
      where: { id },
      data: { status: 'ESCALATED' as TicketStatus, escalatedAt: new Date(), escalatedTo: queue, assignedTo: queue },
    });
  }

  async listSlaRules(tenantId: string) {
    return this.prisma.helpdeskSlaRule.findMany({
      where: { tenantId },
      orderBy: [{ category: 'asc' }, { resolutionHours: 'asc' }],
    });
  }

  async createSlaRule(
    tenantId: string,
    data: { category: string; priority?: TicketPriority; responseHours?: number; resolutionHours: number; assigneeQueue: string; isActive?: boolean },
  ) {
    return this.prisma.helpdeskSlaRule.create({
      data: {
        tenantId,
        category: data.category.trim().toUpperCase(),
        priority: data.priority,
        responseHours: data.responseHours,
        resolutionHours: data.resolutionHours,
        assigneeQueue: data.assigneeQueue,
        isActive: data.isActive ?? true,
      },
    });
  }

  async updateSlaRule(
    tenantId: string,
    id: string,
    data: { category?: string; priority?: TicketPriority | null; responseHours?: number | null; resolutionHours?: number; assigneeQueue?: string; isActive?: boolean },
  ) {
    const rule = await this.prisma.helpdeskSlaRule.findFirst({ where: { id, tenantId } });
    if (!rule) throw new NotFoundException('SLA rule not found');
    return this.prisma.helpdeskSlaRule.update({
      where: { id },
      data: {
        ...(data.category && { category: data.category.trim().toUpperCase() }),
        ...(data.priority !== undefined && { priority: data.priority ?? null }),
        ...(data.responseHours !== undefined && { responseHours: data.responseHours ?? null }),
        ...(data.resolutionHours !== undefined && { resolutionHours: data.resolutionHours }),
        ...(data.assigneeQueue && { assigneeQueue: data.assigneeQueue }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });
  }

  async listKnowledgeBase(tenantId: string, q?: { category?: string; search?: string }) {
    return this.prisma.knowledgeBaseArticle.findMany({
      where: {
        tenantId,
        ...(q?.category && { category: q.category }),
        ...(q?.search && {
          OR: [
            { title: { contains: q.search, mode: 'insensitive' } },
            { summary: { contains: q.search, mode: 'insensitive' } },
            { body: { contains: q.search, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: [{ status: 'desc' }, { updatedAt: 'desc' }],
      take: 100,
    });
  }

  async createKnowledgeBaseArticle(
    tenantId: string,
    data: { title: string; summary?: string; body: string; category?: string; tags?: string[]; status?: string; sourceType?: string },
  ) {
    return this.prisma.knowledgeBaseArticle.create({
      data: {
        tenantId,
        title: data.title,
        summary: data.summary,
        body: data.body,
        category: data.category?.trim().toUpperCase() ?? 'GENERAL',
        tags: (data.tags ?? []) as Prisma.InputJsonValue,
        status: data.status ?? 'PUBLISHED',
        sourceType: data.sourceType ?? 'ARTICLE',
      },
    });
  }

  async updateKnowledgeBaseArticle(
    tenantId: string,
    id: string,
    data: { title?: string; summary?: string; body?: string; category?: string; tags?: string[]; status?: string; sourceType?: string },
  ) {
    const article = await this.prisma.knowledgeBaseArticle.findFirst({ where: { id, tenantId } });
    if (!article) throw new NotFoundException('Knowledge base article not found');
    return this.prisma.knowledgeBaseArticle.update({
      where: { id },
      data: {
        ...(data.title && { title: data.title }),
        ...(data.summary !== undefined && { summary: data.summary }),
        ...(data.body && { body: data.body }),
        ...(data.category && { category: data.category.trim().toUpperCase() }),
        ...(data.tags !== undefined && { tags: data.tags as Prisma.InputJsonValue }),
        ...(data.status && { status: data.status }),
        ...(data.sourceType && { sourceType: data.sourceType }),
      },
    });
  }

  async aiAnswer(tenantId: string, question: string, category?: string) {
    const articles = await this.prisma.knowledgeBaseArticle.findMany({
      where: {
        tenantId,
        status: { in: ['APPROVED', 'PUBLISHED'] },
        ...(category && { OR: [{ category: category.trim().toUpperCase() }, { sourceType: 'POLICY' }] }),
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: 50,
    });
    const scored = articles
      .map((article) => {
        const haystack = `${article.title} ${article.summary ?? ''} ${article.body} ${JSON.stringify(article.tags ?? [])}`.toLowerCase();
        const score = question
          .toLowerCase()
          .split(/\s+/)
          .filter(Boolean)
          .reduce((sum, token) => sum + (haystack.includes(token) ? 1 : 0), 0);
        return { article, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    const citations = scored.map(({ article }) => ({
      id: article.id,
      title: article.title,
      category: article.category,
      sourceType: article.sourceType,
      summary: article.summary,
    }));
    const answer = citations.length
      ? `Based on approved knowledge-base content, the most relevant guidance is: ${citations[0].title}.`
      : 'No approved knowledge-base content matched this question.';
    return { answer, citations };
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
        select: { id: true, category: true, createdAt: true, priority: true, status: true, slaBreached: true },
      }),
    ]);
    const slaOpen = await Promise.all(
      openTickets.map((ticket) => this.withSla(tenantId, { ...ticket, id: 'stats', category: 'GENERAL' })),
    );
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

  async kbStats(tenantId: string) {
    const [articles, approved, published, policies] = await Promise.all([
      this.prisma.knowledgeBaseArticle.count({ where: { tenantId } }),
      this.prisma.knowledgeBaseArticle.count({ where: { tenantId, status: 'APPROVED' } }),
      this.prisma.knowledgeBaseArticle.count({ where: { tenantId, status: 'PUBLISHED' } }),
      this.prisma.knowledgeBaseArticle.count({ where: { tenantId, sourceType: 'POLICY' } }),
    ]);
    return { articles, approved, published, policies };
  }
}
