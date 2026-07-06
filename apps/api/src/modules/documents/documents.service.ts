import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentTemplateStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { FilesService } from '../files/files.service';
import { PrismaService } from '../../common/database/prisma.service';
import { AuthUser } from '../../common/types/auth-user';
import {
  AcknowledgePolicyDto,
  CreateDocumentTemplateDto,
  UpsertCustomFormDto,
  UpdateDocumentTemplateDto,
} from './dto/documents.dto';

type RenderContext = Record<string, unknown>;

const DEFAULT_TEMPLATE_SEARCH = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const;

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pathLookup(source: unknown, path: string): unknown {
  if (!path) return undefined;
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc == null) return undefined;
    if (typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[key];
  }, source);
}

function resolvePlaceholders(input: string, context: RenderContext, html = false) {
  return input.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, rawPath) => {
    const value = pathLookup(context, String(rawPath).trim());
    const text = value == null ? '' : String(value);
    return html ? escapeHtml(text) : text;
  });
}

function toList(input?: string[] | Prisma.JsonValue | null): string[] {
  if (!input) return [];
  if (Array.isArray(input)) return input.map((item) => String(item));
  return [];
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
  ) {}

  async listTemplates(tenantId: string, module?: string) {
    return this.prisma.documentTemplate.findMany({
      where: {
        OR: [{ tenantId }, { tenantId: null }],
        ...(module && { module }),
      },
      include: { versions: { orderBy: { version: 'desc' } } },
      orderBy: [{ module: 'asc' }, { name: 'asc' }],
    });
  }

  async getTemplate(tenantId: string, id: string) {
    const template = await this.prisma.documentTemplate.findFirst({
      where: { id, OR: [{ tenantId }, { tenantId: null }] },
      include: { versions: { orderBy: { version: 'desc' } }, generatedDocuments: { take: 5, orderBy: { createdAt: 'desc' } } },
    });
    if (!template) throw new NotFoundException('Document template not found');
    return template;
  }

  async createTemplate(tenantId: string, actorId: string, dto: CreateDocumentTemplateDto) {
    const template = await this.prisma.documentTemplate.create({
      data: {
        tenantId,
        templateKey: dto.templateKey,
        name: dto.name,
        module: dto.module,
        documentType: dto.documentType,
        title: dto.title,
        subject: dto.subject,
        bodyHtml: dto.bodyHtml,
        bodyText: dto.bodyText,
        variables: dto.variables ?? [],
        language: dto.language ?? 'en',
        isMandatory: dto.isMandatory ?? false,
        eSignatureRequired: dto.eSignatureRequired ?? false,
        status: (dto.status ?? 'DRAFT') as DocumentTemplateStatus,
        createdById: actorId,
      },
    });
    await this.prisma.documentTemplateVersion.create({
      data: {
        templateId: template.id,
        version: 1,
        title: template.title,
        subject: template.subject,
        bodyHtml: template.bodyHtml,
        bodyText: template.bodyText,
        variables: template.variables as Prisma.InputJsonValue,
        createdById: actorId,
      },
    });
    await this.audit(tenantId, actorId, 'document.template_created', 'DocumentTemplate', template.id, null, template);
    return this.getTemplate(tenantId, template.id);
  }

  async updateTemplate(tenantId: string, actorId: string, id: string, dto: UpdateDocumentTemplateDto) {
    const current = await this.getTemplate(tenantId, id);
    const nextVersion = current.version + 1;
    await this.prisma.documentTemplateVersion.create({
      data: {
        templateId: current.id,
        version: current.version,
        title: current.title,
        subject: current.subject,
        bodyHtml: current.bodyHtml,
        bodyText: current.bodyText,
        variables: current.variables as Prisma.InputJsonValue,
        createdById: actorId,
      },
    });

    const updated = await this.prisma.documentTemplate.update({
      where: { id: current.id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.module !== undefined && { module: dto.module }),
        ...(dto.documentType !== undefined && { documentType: dto.documentType }),
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.subject !== undefined && { subject: dto.subject }),
        ...(dto.bodyHtml !== undefined && { bodyHtml: dto.bodyHtml }),
        ...(dto.bodyText !== undefined && { bodyText: dto.bodyText }),
        ...(dto.variables !== undefined && { variables: dto.variables }),
        ...(dto.language !== undefined && { language: dto.language }),
        ...(dto.isMandatory !== undefined && { isMandatory: dto.isMandatory }),
        ...(dto.eSignatureRequired !== undefined && { eSignatureRequired: dto.eSignatureRequired }),
        ...(dto.status !== undefined && { status: dto.status as DocumentTemplateStatus }),
        version: nextVersion,
      },
    });
    await this.audit(tenantId, actorId, 'document.template_updated', 'DocumentTemplate', current.id, current, updated);
    return this.getTemplate(tenantId, current.id);
  }

  async cloneTemplate(tenantId: string, actorId: string, id: string) {
    const source = await this.getTemplate(tenantId, id);
    return this.createTemplate(tenantId, actorId, {
      templateKey: `${source.templateKey}-${randomUUID().slice(0, 8)}`,
      name: `${source.name} (copy)`,
      module: source.module,
      documentType: source.documentType,
      title: source.title,
      subject: source.subject ?? undefined,
      bodyHtml: source.bodyHtml,
      bodyText: source.bodyText ?? undefined,
      variables: toList(source.variables),
      language: source.language,
      isMandatory: false,
      eSignatureRequired: source.eSignatureRequired,
      status: 'DRAFT',
    });
  }

  async listGenerated(tenantId: string, filters: { employeeId?: string; templateId?: string } = {}) {
    const docs = await this.prisma.generatedDocument.findMany({
      where: {
        tenantId,
        ...(filters.employeeId && { employeeId: filters.employeeId }),
        ...(filters.templateId && { templateId: filters.templateId }),
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true, workEmail: true } },
        template: { select: { id: true, name: true, templateKey: true, documentType: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(
      docs.map(async (doc) => {
        try {
          const download = await this.files.downloadUrl(tenantId, doc.fileKey);
          return { ...doc, downloadUrl: download.url };
        } catch {
          return doc;
        }
      }),
    );
  }

  async generateDocument(
    user: AuthUser,
    templateId: string,
    dto: { employeeId: string; vars?: Record<string, unknown>; fileName?: string; title?: string },
  ) {
    const template = await this.getTemplate(user.tenantId, templateId);
    const employee = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, tenantId: user.tenantId },
      include: {
        legalEntity: true,
        department: true,
        designation: true,
        location: true,
        costCenter: true,
        businessUnit: true,
        manager: true,
      },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { name: true, legalName: true },
    });
    const context: RenderContext = {
      tenantId: user.tenantId,
      company_name: tenant?.name,
      company_legal_name: tenant?.legalName,
      employee,
      vars: dto.vars ?? {},
      generated_at: new Date().toISOString(),
      document: {
        template: {
          key: template.templateKey,
          name: template.name,
          type: template.documentType,
        },
      },
    };

    const resolvedTitle = resolvePlaceholders(dto.title ?? template.title, context, false);
    const resolvedSubject = template.subject ? resolvePlaceholders(template.subject, context, false) : null;
    const resolvedBodyHtml = resolvePlaceholders(template.bodyHtml, context, true);
    const resolvedBodyText = template.bodyText ? resolvePlaceholders(template.bodyText, context, false) : null;

    const htmlDocument = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(resolvedTitle)}</title></head><body>${resolvedBodyHtml}${resolvedBodyText ? `<pre>${escapeHtml(resolvedBodyText)}</pre>` : ''}</body></html>`;
    const buffer = Buffer.from(htmlDocument, 'utf8');
    const upload = await this.files.upload(user.tenantId, user.userId, {
      originalname: `${(dto.fileName ?? resolvedTitle).replace(/[^\w.-]+/g, '_')}.html`,
      mimetype: 'text/html',
      buffer,
    });

    const generated = await this.prisma.$transaction(async (tx) => {
      const record = await tx.generatedDocument.create({
        data: {
          tenantId: user.tenantId,
          employeeId: employee.id,
          templateId: template.id,
          documentType: template.documentType,
          title: resolvedTitle,
          fileKey: upload.key,
          fileName: upload.name,
          mimeType: 'text/html',
          version: template.version,
          metadata: {
            templateKey: template.templateKey,
            subject: resolvedSubject,
            vars: dto.vars ?? {},
            generatedBy: user.userId,
          } as Prisma.InputJsonValue,
          generatedById: user.userId,
        },
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true, workEmail: true } },
          template: { select: { id: true, name: true, templateKey: true, documentType: true } },
        },
      });

      await tx.employeeDocument.create({
        data: {
          tenantId: user.tenantId,
          employeeId: employee.id,
          type: template.documentType,
          name: resolvedTitle,
          fileKey: upload.key,
          fileUrl: null,
          mimeType: 'text/html',
          sizeBytes: buffer.length,
          uploadedById: user.userId,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          actorId: user.userId,
          action: 'document.generated',
          objectType: 'GeneratedDocument',
          objectId: record.id,
          oldValue: Prisma.JsonNull,
          newValue: record as unknown as Prisma.InputJsonValue,
        },
      });
      return record;
    });

    const download = await this.files.downloadUrl(user.tenantId, upload.key);
    return { ...generated, downloadUrl: download.url };
  }

  async acknowledgePolicy(
    user: AuthUser,
    templateId: string,
    dto: AcknowledgePolicyDto & { employeeId?: string },
  ) {
    const employeeId = dto.employeeId ?? user.employeeId;
    if (!employeeId) throw new BadRequestException('Employee id is required to acknowledge a policy');

    const template = await this.getTemplate(user.tenantId, templateId);
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId: user.tenantId },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    const ackDoc = await this.generateDocument(user, templateId, {
      employeeId,
      title: `${template.title} - Acknowledgement`,
      fileName: `${template.templateKey}-acknowledgement-${employee.employeeCode}`,
      vars: {
        ...(dto.vars ?? {}),
        acknowledged_by: user.name ?? user.email,
        acknowledged_at: new Date().toISOString(),
        comments: dto.comments ?? '',
      },
    });

    const acknowledged = await this.prisma.policyAcknowledgement.create({
      data: {
        tenantId: user.tenantId,
        employeeId,
        templateId: template.id,
        policyKey: template.templateKey,
        policyName: template.name,
        fileKey: ackDoc.fileKey,
        comments: dto.comments,
        acknowledgedById: user.userId,
      },
    });

    await this.audit(
      user.tenantId,
      user.userId,
      'policy.acknowledged',
      'PolicyAcknowledgement',
      acknowledged.id,
      null,
      acknowledged,
    );

    return {
      ...acknowledged,
      document: ackDoc,
    };
  }

  async listForms(tenantId: string) {
    return this.prisma.customForm.findMany({
      where: { tenantId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getForm(tenantId: string, id: string) {
    const form = await this.prisma.customForm.findFirst({ where: { tenantId, id } });
    if (!form) throw new NotFoundException('Form not found');
    return form;
  }

  async upsertForm(tenantId: string, actorId: string, dto: UpsertCustomFormDto, id?: string) {
    const payload = {
      tenantId,
      name: dto.name,
      description: dto.description ?? null,
      fields: dto.fields as unknown as Prisma.InputJsonValue,
      isActive: dto.isActive ?? true,
    };

    const created = id
      ? await this.prisma.customForm.update({ where: { id }, data: payload })
      : await this.prisma.customForm.create({ data: payload });

    await this.audit(tenantId, actorId, id ? 'custom_form.updated' : 'custom_form.created', 'CustomForm', created.id, null, created);
    return created;
  }

  async deleteForm(tenantId: string, actorId: string, id: string) {
    const form = await this.getForm(tenantId, id);
    await this.prisma.customForm.delete({ where: { id } });
    await this.audit(tenantId, actorId, 'custom_form.deleted', 'CustomForm', id, form, null);
    return { success: true };
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
}
