import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { TaxRegime, AgeCategory, TaxRuleStatus, Prisma } from '@prisma/client';

@Injectable()
export class TaxService {
  constructor(private readonly prisma: PrismaService) {}

  async getTaxYears(tenantId: string) {
    return this.prisma.taxYear.findMany({
      where: { tenantId },
      orderBy: { financialYear: 'desc' },
    });
  }

  async getRegimes(tenantId: string, taxYearId?: string) {
    return this.prisma.taxRegimeConfig.findMany({
      where: { tenantId, ...(taxYearId && { taxYearId }) },
      include: { taxYear: true },
    });
  }

  async getSlabs(tenantId: string, taxYearId: string, regime?: TaxRegime, ageCategory?: AgeCategory) {
    return this.prisma.taxSlab.findMany({
      where: {
        tenantId,
        taxYearId,
        ...(regime && { regime }),
        ...(ageCategory && { ageCategory }),
        status: 'PUBLISHED',
      },
      orderBy: [{ regime: 'asc' }, { ageCategory: 'asc' }, { sortOrder: 'asc' }],
    });
  }

  async importSlabs(tenantId: string, taxYearId: string, slabs: {
    regime: TaxRegime;
    ageCategory: AgeCategory;
    minIncome: number;
    maxIncome?: number;
    taxRate: number;
    fixedTax?: number;
    sortOrder: number;
  }[]) {
    // Archive existing slabs for this year
    await this.prisma.taxSlab.updateMany({
      where: { tenantId, taxYearId },
      data: { status: TaxRuleStatus.ARCHIVED },
    });

    return this.prisma.taxSlab.createMany({
      data: slabs.map((s) => ({
        tenantId,
        taxYearId,
        regime: s.regime,
        ageCategory: s.ageCategory,
        minIncome: s.minIncome,
        maxIncome: s.maxIncome ?? null,
        taxRate: s.taxRate,
        fixedTax: s.fixedTax ?? 0,
        sortOrder: s.sortOrder,
        status: TaxRuleStatus.PUBLISHED,
      })),
    });
  }

  async cloneTaxYear(tenantId: string, sourceTaxYearId: string, newFinancialYear: string, newAssessmentYear: string) {
    const source = await this.prisma.taxYear.findUnique({ where: { id: sourceTaxYearId } });
    if (!source) throw new NotFoundException('Source tax year not found');

    const [slabs, surchargeRules, rebateRules, cessRules, deductionRules, exemptionRules] = await Promise.all([
      this.prisma.taxSlab.findMany({ where: { tenantId, taxYearId: sourceTaxYearId, status: 'PUBLISHED' } }),
      this.prisma.taxSurchargeRule.findMany({ where: { tenantId, taxYearId: sourceTaxYearId } }),
      this.prisma.taxRebateRule.findMany({ where: { tenantId, taxYearId: sourceTaxYearId } }),
      this.prisma.taxCessRule.findMany({ where: { tenantId, taxYearId: sourceTaxYearId } }),
      this.prisma.taxDeductionRule.findMany({ where: { tenantId, taxYearId: sourceTaxYearId } }),
      this.prisma.taxExemptionRule.findMany({ where: { tenantId, taxYearId: sourceTaxYearId } }),
    ]);

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const newYear = await tx.taxYear.create({
        data: {
          tenantId,
          financialYear: newFinancialYear,
          assessmentYear: newAssessmentYear,
          country: source.country,
          effectiveFrom: new Date(),
          isActive: false,
        },
      });

      await Promise.all([
        tx.taxSlab.createMany({ data: slabs.map(({ id, taxYearId, ...rest }) => ({ ...rest, taxYearId: newYear.id })) }),
        tx.taxSurchargeRule.createMany({ data: surchargeRules.map(({ id, taxYearId, ...rest }) => ({ ...rest, taxYearId: newYear.id })) }),
        tx.taxRebateRule.createMany({ data: rebateRules.map(({ id, taxYearId, ...rest }) => ({ ...rest, taxYearId: newYear.id })) }),
        tx.taxCessRule.createMany({ data: cessRules.map(({ id, taxYearId, ...rest }) => ({ ...rest, taxYearId: newYear.id })) }),
        tx.taxDeductionRule.createMany({ data: deductionRules.map(({ id, taxYearId, ...rest }) => ({ ...rest, taxYearId: newYear.id })) }),
        tx.taxExemptionRule.createMany({ data: exemptionRules.map(({ id, taxYearId, ...rest }) => ({ ...rest, taxYearId: newYear.id })) }),
      ]);

      return newYear;
    });
  }

  async getEmployeeTaxProfile(tenantId: string, employeeId: string) {
    return this.prisma.employeeTaxProfile.findUnique({
      where: { employeeId },
      include: {
        declarations: { include: { proofs: true } },
        previousIncome: true,
        monthlyTds: { orderBy: [{ year: 'desc' }, { month: 'desc' }], take: 12 },
      },
    });
  }

  async upsertEmployeeTaxProfile(tenantId: string, employeeId: string, data: {
    taxYearId: string;
    regime?: TaxRegime;
    ageCategory?: AgeCategory;
    panNumber?: string;
    dateOfBirth?: Date;
  }) {
    return this.prisma.employeeTaxProfile.upsert({
      where: { employeeId },
      create: { tenantId, employeeId, ...data },
      update: data,
    });
  }

  async submitDeclaration(tenantId: string, employeeId: string, data: {
    taxProfileId: string;
    taxYearId: string;
    section: string;
    declaredAmount: number;
    metadata?: Record<string, unknown>;
  }) {
    return this.prisma.employeeTaxDeclaration.upsert({
      where: {
        // unique by profile + section
        id: `${data.taxProfileId}-${data.section}`,
      },
      create: {
        tenantId,
        employeeId,
        taxProfileId: data.taxProfileId,
        taxYearId: data.taxYearId,
        section: data.section,
        declaredAmount: data.declaredAmount,
        metadata: data.metadata,
        status: 'SUBMITTED',
        submittedAt: new Date(),
      },
      update: {
        declaredAmount: data.declaredAmount,
        metadata: data.metadata,
        status: 'SUBMITTED',
        submittedAt: new Date(),
      },
    });
  }

  async getTdsSummaryForPayrollRun(tenantId: string, payrollRunId: string) {
    return this.prisma.taxComputationSnapshot.findMany({
      where: { tenantId, payrollRunId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
