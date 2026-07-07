import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AssetCondition, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';

@Injectable()
export class AssetsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    tenantId: string,
    q: { page?: number; pageSize?: number; category?: string; status?: string; search?: string },
  ) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const where: Prisma.AssetWhereInput = {
      tenantId,
      ...(q.category && { category: q.category }),
      ...(q.status && { status: q.status }),
      ...(q.search && {
        OR: [
          { name: { contains: q.search, mode: 'insensitive' as const } },
          { serialNumber: { contains: q.search, mode: 'insensitive' as const } },
        ],
      }),
    };
    const [data, total] = await Promise.all([
      this.prisma.asset.findMany({
        where,
        include: {
          assignments: {
            where: { returnedAt: null },
            include: {
              employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
            },
          },
          documents: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.asset.count({ where }),
    ]);
    return {
      data: data.map((a) => ({
        ...a,
        currentHolder: a.assignments[0]?.employee ?? null,
        assignmentCount: a.assignments.length,
        documentCount: a.documents.length,
      })),
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async get(tenantId: string, id: string) {
    const asset = await this.prisma.asset.findFirst({
      where: { id, tenantId },
      include: {
        assignments: {
          include: {
            employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
          },
          orderBy: { assignedAt: 'desc' },
        },
        documents: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!asset) throw new NotFoundException('Asset not found');
    return {
      ...asset,
      currentHolder: asset.assignments.find((assignment) => !assignment.returnedAt)?.employee ?? null,
    };
  }

  async create(
    tenantId: string,
    data: { name: string; category: string; serialNumber?: string; purchaseCost?: number; condition?: AssetCondition },
  ) {
    return this.prisma.asset.create({ data: { ...data, tenantId } });
  }

  async assign(tenantId: string, assetId: string, employeeId: string) {
    const asset = await this.prisma.asset.findFirst({ where: { id: assetId, tenantId } });
    if (!asset) throw new NotFoundException('Asset not found');
    if (asset.status === 'ASSIGNED') throw new BadRequestException('Asset already assigned');
    const employee = await this.prisma.employee.findFirst({ where: { id: employeeId, tenantId } });
    if (!employee) throw new NotFoundException('Employee not found');
    const [assignment] = await Promise.all([
      this.prisma.assetAssignment.create({ data: { assetId, employeeId } }),
      this.prisma.asset.update({ where: { id: assetId }, data: { status: 'ASSIGNED' } }),
    ]);
    return assignment;
  }

  async returnAsset(tenantId: string, assetId: string, condition?: AssetCondition, notes?: string) {
    const asset = await this.prisma.asset.findFirst({ where: { id: assetId, tenantId } });
    if (!asset) throw new NotFoundException('Asset not found');
    const active = await this.prisma.assetAssignment.findFirst({
      where: { assetId, returnedAt: null },
    });
    if (!active) throw new BadRequestException('Asset has no active assignment');
    await Promise.all([
      this.prisma.assetAssignment.update({
        where: { id: active.id },
        data: { returnedAt: new Date(), condition, notes },
      }),
      this.prisma.asset.update({
        where: { id: assetId },
        data: { status: 'AVAILABLE', ...(condition && { condition }) },
      }),
    ]);
    return { success: true };
  }

  async addDocument(
    tenantId: string,
    assetId: string,
    data: { fileKey: string; fileName?: string; mimeType?: string },
  ) {
    const asset = await this.prisma.asset.findFirst({ where: { id: assetId, tenantId } });
    if (!asset) throw new NotFoundException('Asset not found');
    return this.prisma.assetDocument.create({
      data: {
        tenantId,
        assetId,
        fileKey: data.fileKey,
        fileName: data.fileName,
        mimeType: data.mimeType,
      },
    });
  }

  async history(tenantId: string, assetId: string) {
    const asset = await this.get(tenantId, assetId);
    return {
      asset: {
        id: asset.id,
        name: asset.name,
        category: asset.category,
        serialNumber: asset.serialNumber,
        status: asset.status,
        condition: asset.condition,
      },
      assignments: asset.assignments,
      documents: asset.documents,
    };
  }

  async stats(tenantId: string) {
    const [total, byStatus, byCategory] = await Promise.all([
      this.prisma.asset.count({ where: { tenantId } }),
      this.prisma.asset.groupBy({ by: ['status'], where: { tenantId }, _count: true }),
      this.prisma.asset.groupBy({ by: ['category'], where: { tenantId }, _count: true }),
    ]);
    const count = (s: string) => byStatus.find((b) => b.status === s)?._count ?? 0;
    return {
      total,
      assigned: count('ASSIGNED'),
      available: count('AVAILABLE'),
      inRepair: count('IN_REPAIR'),
      byCategory: byCategory.map((c) => ({ category: c.category, count: c._count })),
    };
  }
}
