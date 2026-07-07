import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { EmailTemplateStatus, Prisma } from '@prisma/client';

@Injectable()
export class EmailTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  async findByKey(tenantId: string, templateKey: string, language = 'en') {
    // Prefer tenant-specific template, fall back to system default (tenantId null)
    const template = await this.prisma.emailTemplate.findFirst({
      where: {
        templateKey,
        language,
        status: 'ACTIVE',
        OR: [{ tenantId }, { tenantId: null }],
      },
      orderBy: { tenantId: 'desc' }, // tenant-specific rows sort after null
    });
    return template;
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
    if (!tpl) throw new NotFoundException(`Email template '${templateKey}' not found`);

    return {
      subject: this.resolveVariables(tpl.subject, vars),
      bodyHtml: this.resolveVariables(tpl.bodyHtml, vars),
      bodyText: tpl.bodyText ? this.resolveVariables(tpl.bodyText, vars) : '',
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
