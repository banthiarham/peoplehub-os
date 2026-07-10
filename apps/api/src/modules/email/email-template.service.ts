import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { EmailTemplateStatus, Prisma } from '@prisma/client';

const BUILT_IN_EMAIL_TEMPLATES: Record<
  string,
  { subject: string; bodyHtml: string; bodyText?: string }
> = {
  account_invitation: {
    subject: 'Welcome to {{company_name}} - Set up your account',
    bodyHtml:
      '<p>Hi {{employee_name}},</p><p>You have been invited to join {{company_name}} on VioHr.</p><p><a href="{{login_link}}">Set up your account</a></p><p>This link expires in 48 hours.</p>',
    bodyText:
      'Hi {{employee_name}}, you have been invited to join {{company_name}} on VioHr. Set up your account: {{login_link}}',
  },
  password_reset: {
    subject: 'Reset your password - {{company_name}}',
    bodyHtml:
      '<p>Hi {{employee_name}},</p><p>We received a request to reset your password.</p><p><a href="{{login_link}}">Reset Password</a></p><p>This link expires in 1 hour. If you did not request this, ignore this email.</p>',
    bodyText:
      'Hi {{employee_name}}, reset your password using this secure link: {{login_link}}. This link expires in 1 hour.',
  },
  welcome: {
    subject: 'Welcome to {{company_name}}',
    bodyHtml:
      '<p>Hi {{employee_name}},</p><p>Welcome aboard. Your account is now active.</p><p><a href="{{login_link}}">Login here</a>.</p>',
    bodyText: 'Hi {{employee_name}}, welcome aboard. Login here: {{login_link}}',
  },
};

@Injectable()
export class EmailTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  async findByKey(tenantId: string, templateKey: string, language = 'en') {
    const tenantTemplate = await this.prisma.emailTemplate.findFirst({
      where: {
        templateKey,
        language,
        status: 'ACTIVE',
        tenantId,
      },
    });
    if (tenantTemplate) return tenantTemplate;

    return this.prisma.emailTemplate.findFirst({
      where: {
        templateKey,
        language,
        status: 'ACTIVE',
        tenantId: null,
      },
    });
  }

  resolveVariables(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
  }

  async render(
    tenantId: string,
    templateKey: string,
    vars: Record<string, string>,
    language = 'en',
  ): Promise<{ subject: string; bodyHtml: string; bodyText: string }> {
    const tpl = await this.findByKey(tenantId, templateKey, language);
    const source = tpl ?? BUILT_IN_EMAIL_TEMPLATES[templateKey];
    if (!source) throw new NotFoundException(`Email template '${templateKey}' not found`);

    return {
      subject: this.resolveVariables(source.subject, vars),
      bodyHtml: this.resolveVariables(source.bodyHtml, vars),
      bodyText: source.bodyText ? this.resolveVariables(source.bodyText, vars) : '',
    };
  }

  async list(tenantId: string, module?: string) {
    return this.prisma.emailTemplate.findMany({
      where: {
        OR: [{ tenantId }, { tenantId: null }],
        ...(module && { module }),
      },
      orderBy: [{ module: 'asc' }, { name: 'asc' }],
    });
  }

  async findById(id: string) {
    const tpl = await this.prisma.emailTemplate.findUnique({
      where: { id },
      include: { versions: { orderBy: { version: 'desc' }, take: 10 } },
    });
    if (!tpl) throw new NotFoundException('Template not found');
    return tpl;
  }

  async create(
    tenantId: string,
    data: {
      templateKey: string;
      name: string;
      subject: string;
      bodyHtml: string;
      bodyText?: string;
      variables?: string[];
      language?: string;
      module: string;
      isMandatory?: boolean;
      createdById: string;
    },
  ) {
    return this.prisma.emailTemplate.create({
      data: {
        tenantId,
        templateKey: data.templateKey,
        name: data.name,
        subject: data.subject,
        bodyHtml: data.bodyHtml,
        bodyText: data.bodyText,
        variables: data.variables ?? [],
        language: data.language ?? 'en',
        module: data.module,
        isMandatory: data.isMandatory ?? false,
        createdById: data.createdById,
        status: EmailTemplateStatus.ACTIVE,
      },
    });
  }

  async update(
    id: string,
    data: { subject?: string; bodyHtml?: string; bodyText?: string; status?: EmailTemplateStatus },
  ) {
    const current = await this.findById(id);

    // Archive current version before update
    await this.prisma.emailTemplateVersion.create({
      data: {
        templateId: id,
        version: current.version,
        subject: current.subject,
        bodyHtml: current.bodyHtml,
        bodyText: current.bodyText,
        variables: (current.variables ?? []) as unknown as Prisma.InputJsonValue,
      },
    });

    return this.prisma.emailTemplate.update({
      where: { id },
      data: { ...data, version: current.version + 1 },
    });
  }

  async clone(id: string, tenantId: string, createdById: string) {
    const source = await this.findById(id);
    return this.create(tenantId, {
      templateKey: `${source.templateKey}_copy`,
      name: `${source.name} (copy)`,
      subject: source.subject,
      bodyHtml: source.bodyHtml,
      bodyText: source.bodyText ?? undefined,
      variables: source.variables as string[],
      language: source.language,
      module: source.module,
      isMandatory: false,
      createdById,
    });
  }
}
