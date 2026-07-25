import { Injectable } from '@nestjs/common';
import { EmploymentType, Gender, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';

type DbClient = Prisma.TransactionClient | PrismaService;

const ELIGIBLE_EMPLOYEE_STATUSES = [
  'PREBOARDING',
  'ACTIVE',
  'ON_PROBATION',
  'CONFIRMED',
  'ON_NOTICE',
  'CONTRACTOR',
  'INTERN',
] as const;

@Injectable()
export class LeaveBalanceInitializationService {
  constructor(private readonly prisma: PrismaService) {}

  async initializeForPolicy(
    tenantId: string,
    policyId: string,
    db: DbClient = this.prisma,
  ): Promise<number> {
    const policy = await db.leavePolicy.findFirst({
      where: { id: policyId, tenantId, isActive: true, leaveType: { isActive: true } },
    });
    if (!policy) return 0;

    const employees = await db.employee.findMany({
      where: {
        tenantId,
        ...(policy.locationId && { locationId: policy.locationId }),
        ...(policy.genderRestriction && { gender: policy.genderRestriction as Gender }),
        ...(policy.employmentTypes.length && {
          employmentType: { in: policy.employmentTypes as EmploymentType[] },
        }),
        AND: [
          { status: { in: [...ELIGIBLE_EMPLOYEE_STATUSES] } },
          ...(!policy.probationAllowed ? [{ status: { not: 'ON_PROBATION' as const } }] : []),
          ...(!policy.noticePeriodAllowed ? [{ status: { not: 'ON_NOTICE' as const } }] : []),
        ],
      },
      select: { id: true },
    });

    await this.initializeBalances(
      employees.map((employee) => employee.id),
      policy.leaveTypeId,
      this.initialCredit(policy),
      db,
    );
    return employees.length;
  }

  async initializeForEmployee(
    tenantId: string,
    employeeId: string,
    db: DbClient = this.prisma,
  ): Promise<number> {
    const employee = await db.employee.findFirst({
      where: { id: employeeId, tenantId, status: { in: [...ELIGIBLE_EMPLOYEE_STATUSES] } },
      select: {
        id: true,
        status: true,
        locationId: true,
        gender: true,
        employmentType: true,
      },
    });
    if (!employee) return 0;

    const policies = await db.leavePolicy.findMany({
      where: {
        tenantId,
        isActive: true,
        leaveType: { isActive: true },
        OR: [{ locationId: employee.locationId }, { locationId: null }],
        AND: [
          {
            OR: [{ genderRestriction: null }, { genderRestriction: employee.gender }],
          },
          {
            OR: [
              { employmentTypes: { isEmpty: true } },
              { employmentTypes: { has: employee.employmentType } },
            ],
          },
        ],
        ...(employee.status === 'ON_PROBATION' && { probationAllowed: true }),
        ...(employee.status === 'ON_NOTICE' && { noticePeriodAllowed: true }),
      },
      orderBy: [{ locationId: 'desc' }, { updatedAt: 'desc' }],
    });

    const policiesByType = new Map<string, (typeof policies)[number]>();
    for (const policy of policies) {
      if (!policiesByType.has(policy.leaveTypeId)) policiesByType.set(policy.leaveTypeId, policy);
    }

    for (const policy of policiesByType.values()) {
      await this.initializeBalances(
        [employee.id],
        policy.leaveTypeId,
        this.initialCredit(policy),
        db,
      );
    }
    return policiesByType.size;
  }

  private initialCredit(policy: {
    accrualType: string;
    accrualDays: number;
    maxAnnualDays: number | null;
  }): number {
    const credit =
      policy.accrualType === 'MONTHLY'
        ? policy.accrualDays
        : (policy.maxAnnualDays ?? policy.accrualDays);
    return Math.max(0, credit);
  }

  private async initializeBalances(
    employeeIds: string[],
    leaveTypeId: string,
    credit: number,
    db: DbClient,
  ) {
    const year = new Date().getFullYear();
    await Promise.all(
      employeeIds.map((employeeId) =>
        db.leaveBalance.upsert({
          where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year } },
          create: {
            employeeId,
            leaveTypeId,
            year,
            openingBalance: credit,
            accrued: credit,
            balance: credit,
          },
          update: {},
        }),
      ),
    );
  }
}
