import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../common/database/prisma.service';
import { AuthUser } from '../../common/types/auth-user';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-5';

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async chat(user: AuthUser, message: string, conversationId?: string) {
    const convId = conversationId ?? `conv_${randomBytes(8).toString('hex')}`;
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return {
        reply:
          'The AI copilot is not configured yet. Set ANTHROPIC_API_KEY in the API environment to enable PeopleHub Copilot — it can answer questions about headcount, attendance, leave balances, payroll compliance (PF/ESI/PT/TDS) and more.',
        conversationId: convId,
        configured: false,
      };
    }

    const context = await this.tenantContext(user.tenantId);
    const history = conversationId
      ? await this.prisma.aIInteractionLog.findMany({
          where: { tenantId: user.tenantId, metadata: { path: ['conversationId'], equals: conversationId } },
          orderBy: { createdAt: 'asc' },
          take: 10,
        })
      : [];

    const messages = [
      ...history.flatMap((h) => [
        { role: 'user' as const, content: h.prompt },
        { role: 'assistant' as const, content: h.response },
      ]),
      { role: 'user' as const, content: message },
    ];

    const started = Date.now();
    const { data } = await axios.post(
      ANTHROPIC_URL,
      {
        model: MODEL,
        max_tokens: 1024,
        system: `You are PeopleHub Copilot, an HR assistant for an Indian workplace on the PeopleHub OS platform. You are aware of Indian statutory compliance (PF, ESI, Professional Tax, TDS, gratuity, leave rules). Be concise and practical. Live org snapshot: ${JSON.stringify(context)}`,
        messages,
      },
      {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        timeout: 30000,
      },
    );

    const reply: string = data?.content?.[0]?.text ?? 'I could not generate a response.';
    await this.prisma.aIInteractionLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.userId,
        assistantType: 'HR',
        prompt: message,
        response: reply,
        tokensUsed: (data?.usage?.input_tokens ?? 0) + (data?.usage?.output_tokens ?? 0),
        latencyMs: Date.now() - started,
        model: MODEL,
        metadata: { conversationId: convId },
      },
    });
    return { reply, conversationId: convId, configured: true };
  }

  private async tenantContext(tenantId: string) {
    const today = new Date();
    const dateOnly = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
    const [headcount, pendingLeaves, presentToday, openJobs] = await Promise.all([
      this.prisma.employee.count({
        where: { tenantId, status: { notIn: ['EXITED', 'INACTIVE'] } },
      }),
      this.prisma.leaveRequest.count({ where: { tenantId, status: 'PENDING' } }),
      this.prisma.attendanceRecord.count({
        where: { tenantId, date: dateOnly, status: { in: ['PRESENT', 'LATE'] } },
      }),
      this.prisma.jobRequisition.count({ where: { tenantId, status: 'OPEN' } }),
    ]).catch(() => [0, 0, 0, 0]);
    return { headcount, pendingLeaves, presentToday, openJobs, date: dateOnly.toISOString().slice(0, 10) };
  }

  async history(user: AuthUser, conversationId?: string) {
    return this.prisma.aIInteractionLog.findMany({
      where: {
        tenantId: user.tenantId,
        userId: user.userId,
        ...(conversationId && { metadata: { path: ['conversationId'], equals: conversationId } }),
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { id: true, prompt: true, response: true, createdAt: true, metadata: true },
    });
  }

  suggestions(user: AuthUser) {
    const base = [
      'How many people are on leave today?',
      'What is our current headcount by department?',
      'Explain the difference between the old and new tax regime',
    ];
    if (user.roles.includes('Payroll Admin') || user.isSuperAdmin) {
      base.push('What statutory deductions apply to a ₹12 LPA salary?', 'Summarise last month’s payroll run');
    }
    if (user.roles.includes('HR Admin') || user.isSuperAdmin) {
      base.push('Draft a probation confirmation letter', 'Which teams have the highest attrition risk?');
    }
    return { suggestions: base };
  }
}
