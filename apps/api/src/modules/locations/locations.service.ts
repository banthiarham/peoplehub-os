import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { CreateLocationDto, UpdateLocationDto } from './dto/locations.dto';

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string) {
    const locations = await this.prisma.location.findMany({
      where: { tenantId },
      include: { _count: { select: { employees: true } } },
      orderBy: { name: 'asc' },
    });
    return locations.map(({ _count, ...loc }) => ({ ...loc, employees: _count.employees }));
  }

  create(tenantId: string, dto: CreateLocationDto) {
    return this.prisma.location.create({
      data: { tenantId, ...dto, attendanceRadius: dto.attendanceRadius || null },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateLocationDto) {
    const existing = await this.prisma.location.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Location not found');
    return this.prisma.location.update({
      where: { id },
      data: {
        ...dto,
        // 0 (or explicit clearing) turns the geofence off
        ...(dto.attendanceRadius !== undefined && {
          attendanceRadius: dto.attendanceRadius || null,
        }),
      },
    });
  }
}
