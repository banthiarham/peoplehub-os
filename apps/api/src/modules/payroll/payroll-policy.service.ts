import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CompOffUnusedTreatment, CompOffUsagePeriod, SalaryBasis } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { UpsertPayrollPolicyDto } from './dto/payroll-policy.dto';

/** Upper bound for `fixedDays`: a payable-day count is a day count within one month. */
export const MAX_FIXED_DAYS = 31;

/**
 * In-code fallback applied when a tenant has configured no payroll policy at all.
 * Kept in sync with the Prisma model's `@default` values so an unconfigured tenant
 * resolves to exactly what a freshly created default row would hold.
 */
const FALLBACK_POLICY = {
  salaryBasis: SalaryBasis.CALENDAR_DAYS,
  fixedDays: null as number | null,
  overtimePaymentEnabled: false,
  compOffEnabled: false,
  compOffUnusedTreatment: CompOffUnusedTreatment.UNPAID,
  compOffUsagePeriod: CompOffUsagePeriod.MONTHLY,
  compOffCarryForwardEnabled: false,
  isDefault: true,
};

/** The settable configuration of a policy, with its scope (`locationId`) resolved separately. */
type PolicySettings = {
  salaryBasis?: SalaryBasis;
  fixedDays?: number | null;
  overtimePaymentEnabled?: boolean;
  compOffEnabled?: boolean;
  compOffUnusedTreatment?: CompOffUnusedTreatment;
  compOffUsagePeriod?: CompOffUsagePeriod;
  compOffCarryForwardEnabled?: boolean;
};

@Injectable()
export class PayrollPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  /** Tenant-wide default first, then location policies - mirrors `listRules` ordering. */
  async list(tenantId: string) {
    return this.prisma.payrollPolicy.findMany({
      where: { tenantId },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async get(tenantId: string, id: string) {
    const policy = await this.prisma.payrollPolicy.findFirst({ where: { id, tenantId } });
    if (!policy) throw new NotFoundException('Payroll policy not found');
    return policy;
  }

  async create(tenantId: string, dto: UpsertPayrollPolicyDto) {
    const locationId = dto.locationId ?? null;

    if (locationId) {
      const location = await this.prisma.location.findFirst({ where: { id: locationId, tenantId } });
      if (!location) throw new NotFoundException('Location not found');
    }

    const existing = await this.prisma.payrollPolicy.findFirst({ where: { tenantId, locationId } });
    if (existing) {
      throw new BadRequestException(
        locationId
          ? 'A payroll policy already exists for this location'
          : 'A tenant-wide default payroll policy already exists',
      );
    }

    return this.prisma.payrollPolicy.create({
      data: { tenantId, locationId, ...this.buildData(dto, locationId) },
    });
  }

  async update(tenantId: string, id: string, dto: UpsertPayrollPolicyDto) {
    const policy = await this.prisma.payrollPolicy.findFirst({ where: { id, tenantId } });
    if (!policy) throw new NotFoundException('Payroll policy not found');

    // A policy's scope is its identity under the tenant/location unique constraint. Moving
    // one is a delete plus a create, not an edit, so reject it rather than silently ignore it.
    if (dto.locationId !== undefined && dto.locationId !== policy.locationId) {
      throw new BadRequestException('A payroll policy cannot be moved to a different location');
    }

    const salaryBasis = dto.salaryBasis ?? policy.salaryBasis;
    const merged: PolicySettings = {
      salaryBasis,
      // Carry the stored day count over only while the basis is unchanged: switching away
      // from FIXED_DAYS must clear it, not fail validation against the stale value.
      fixedDays: dto.fixedDays ?? (salaryBasis === policy.salaryBasis ? policy.fixedDays : null),
      overtimePaymentEnabled: dto.overtimePaymentEnabled ?? policy.overtimePaymentEnabled,
      compOffEnabled: dto.compOffEnabled ?? policy.compOffEnabled,
      compOffUnusedTreatment: dto.compOffUnusedTreatment ?? policy.compOffUnusedTreatment,
      compOffUsagePeriod: dto.compOffUsagePeriod ?? policy.compOffUsagePeriod,
      compOffCarryForwardEnabled: dto.compOffCarryForwardEnabled ?? policy.compOffCarryForwardEnabled,
    };

    return this.prisma.payrollPolicy.update({
      where: { id },
      data: this.buildData(merged, policy.locationId),
    });
  }

  async delete(tenantId: string, id: string) {
    const policy = await this.prisma.payrollPolicy.findFirst({ where: { id, tenantId } });
    if (!policy) throw new NotFoundException('Payroll policy not found');
    await this.prisma.payrollPolicy.delete({ where: { id } });
    return { success: true };
  }

  /**
   * Resolves the effective payroll policy for a tenant, optionally scoped to a location.
   *
   * Precedence, most specific first:
   *   1. the policy configured for `locationId`
   *   2. the tenant-wide default policy (the row with `locationId: null`)
   *   3. the in-code fallback, for a tenant that has configured nothing
   *
   * `inherited` says the returned configuration was not set for the requested scope.
   * Every lookup is tenant-scoped, so a policy never resolves across tenants.
   */
  async resolve(tenantId: string, locationId?: string | null) {
    if (locationId) {
      const scoped = await this.prisma.payrollPolicy.findFirst({ where: { tenantId, locationId } });
      if (scoped) return { ...scoped, inherited: false };
    }

    const tenantDefault = await this.prisma.payrollPolicy.findFirst({
      where: { tenantId, locationId: null },
    });
    if (tenantDefault) return { ...tenantDefault, inherited: Boolean(locationId) };

    return {
      id: `default:${tenantId}`,
      tenantId,
      locationId: locationId ?? null,
      ...FALLBACK_POLICY,
      createdAt: null,
      updatedAt: null,
      inherited: true,
    };
  }

  /**
   * Validates a policy's settings and returns the persistable row data.
   *
   * `isDefault` is derived from the scope rather than taken from the client: the tenant-wide
   * row (`locationId: null`) is the default that `resolve` falls back to, and a location row
   * never is, so the stored flag cannot contradict resolution.
   */
  private buildData(settings: PolicySettings, locationId: string | null) {
    const salaryBasis = settings.salaryBasis ?? SalaryBasis.CALENDAR_DAYS;
    const fixedDays = settings.fixedDays;

    if (salaryBasis === SalaryBasis.FIXED_DAYS) {
      if (!Number.isInteger(fixedDays) || (fixedDays as number) < 1 || (fixedDays as number) > MAX_FIXED_DAYS) {
        throw new BadRequestException(
          `fixedDays is required when salaryBasis is FIXED_DAYS and must be an integer between 1 and ${MAX_FIXED_DAYS}`,
        );
      }
    } else if (fixedDays !== undefined && fixedDays !== null) {
      throw new BadRequestException('fixedDays may only be set when salaryBasis is FIXED_DAYS');
    }

    return {
      salaryBasis,
      fixedDays: salaryBasis === SalaryBasis.FIXED_DAYS ? (fixedDays as number) : null,
      overtimePaymentEnabled: settings.overtimePaymentEnabled ?? false,
      compOffEnabled: settings.compOffEnabled ?? false,
      compOffUnusedTreatment: settings.compOffUnusedTreatment ?? CompOffUnusedTreatment.UNPAID,
      compOffUsagePeriod: settings.compOffUsagePeriod ?? CompOffUsagePeriod.MONTHLY,
      compOffCarryForwardEnabled: settings.compOffCarryForwardEnabled ?? false,
      isDefault: locationId === null,
    };
  }
}
