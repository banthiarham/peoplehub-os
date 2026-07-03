import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async global(tenantId: string, q: string) {
    const query = q.trim();
    if (query.length < 2) {
      return { employees: [], candidates: [], tickets: [], jobs: [], assets: [] };
    }
    const contains = { contains: query, mode: 'insensitive' as const };

    const [employees, candidates, tickets, jobs, assets] = await Promise.all([
      this.prisma.employee.findMany({
        where: {
          tenantId,
          status: { notIn: ['EXITED', 'INACTIVE'] },
          OR: [
            { firstName: contains },
            { lastName: contains },
            { workEmail: contains },
            { employeeCode: contains },
          ],
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeCode: true,
          workEmail: true,
          designation: { select: { name: true } },
          department: { select: { name: true } },
        },
        take: 5,
      }),
      this.prisma.candidate.findMany({
        where: {
          tenantId,
          OR: [{ firstName: contains }, { lastName: contains }, { email: contains }],
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          currentStage: true,
          jobRequisition: { select: { title: true } },
        },
        take: 5,
      }),
      this.prisma.ticket.findMany({
        where: { tenantId, subject: contains },
        select: { id: true, subject: true, status: true, category: true },
        take: 5,
      }),
      this.prisma.jobRequisition.findMany({
        where: { tenantId, title: contains },
        select: { id: true, title: true, status: true, openings: true },
        take: 5,
      }),
      this.prisma.asset.findMany({
        where: { tenantId, OR: [{ name: contains }, { serialNumber: contains }] },
        select: { id: true, name: true, category: true, status: true },
        take: 5,
      }),
    ]);

    return { employees, candidates, tickets, jobs, assets };
  }
}
