import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { TaxRegime, AgeCategory, Prisma } from '@prisma/client';

export interface TdsCalculationInput {
  tenantId: string;
  employeeId: string;
  taxYearId: string;
  regime: TaxRegime;
  ageCategory: AgeCategory;
  annualFixedSalary: number;
  grossPaidTillDate: number;
  projectedRemainingGross: number;
  bonus: number;
  variablePay: number;
  arrears: number;
  taxableReimbursements: number;
  previousEmployerIncome: number;
  previousEmployerTds: number;
  tdsDeductedTillDate: number;
  approvedDeductions: Record<string, number>;
  approvedExemptions: Record<string, number>;
  currentMonth: number;
  currentYear: number;
  remainingPayrollMonths: number;
}

export interface TdsCalculationResult {
  grossTaxableIncome: number;
  exemptIncome: number;
  deductibleAmount: number;
  netTaxableIncome: number;
  taxBeforeRebate: number;
  rebate: number;
  surcharge: number;
  cess: number;
  totalAnnualTax: number;
  tdsAlreadyDeducted: number;
  remainingTax: number;
  monthlyTds: number;
  effectiveTaxRate: number;
  breakdownSteps: BreakdownStep[];
  slabsApplied: SlabApplication[];
}

export interface BreakdownStep {
  step: string;
  description: string;
  amount: number;
}

export interface SlabApplication {
  minIncome: number;
  maxIncome: number | null;
  taxRate: number;
  taxablePortionInSlab: number;
  taxFromSlab: number;
}

@Injectable()
export class TdsEngineService {
  constructor(private readonly prisma: PrismaService) {}

  async calculate(input: TdsCalculationInput): Promise<TdsCalculationResult> {
    const [slabs, surchargeRules, rebateRule, cessRule, deductionRules, exemptionRules] =
      await Promise.all([
        this.prisma.taxSlab.findMany({
          where: {
            tenantId: input.tenantId,
            taxYearId: input.taxYearId,
            regime: input.regime,
            ageCategory: input.ageCategory,
            status: 'PUBLISHED',
          },
          orderBy: { sortOrder: 'asc' },
        }),
        this.prisma.taxSurchargeRule.findMany({
          where: { tenantId: input.tenantId, taxYearId: input.taxYearId, regime: input.regime, status: 'PUBLISHED' },
          orderBy: { minIncome: 'asc' },
        }),
        this.prisma.taxRebateRule.findFirst({
          where: { tenantId: input.tenantId, taxYearId: input.taxYearId, regime: input.regime, status: 'PUBLISHED' },
        }),
        this.prisma.taxCessRule.findFirst({
          where: { tenantId: input.tenantId, taxYearId: input.taxYearId, status: 'PUBLISHED' },
        }),
        this.prisma.taxDeductionRule.findMany({
          where: { tenantId: input.tenantId, taxYearId: input.taxYearId, regime: input.regime, isEnabled: true, status: 'PUBLISHED' },
        }),
        this.prisma.taxExemptionRule.findMany({
          where: { tenantId: input.tenantId, taxYearId: input.taxYearId, regime: input.regime, isEnabled: true, status: 'PUBLISHED' },
        }),
      ]);

    const breakdownSteps: BreakdownStep[] = [];

    // Step 1: Gross taxable income
    const grossTaxableIncome =
      input.annualFixedSalary +
      input.bonus +
      input.variablePay +
      input.arrears +
      input.taxableReimbursements +
      input.previousEmployerIncome;
    breakdownSteps.push({ step: 'GROSS_INCOME', description: 'Gross taxable income', amount: grossTaxableIncome });

    // Step 2: Exemptions (HRA, LTA, etc.)
    let exemptIncome = 0;
    for (const rule of exemptionRules) {
      const declared = input.approvedExemptions[rule.name] ?? 0;
      const capped = rule.maxLimit ? Math.min(declared, Number(rule.maxLimit)) : declared;
      exemptIncome += capped;
      if (capped > 0) {
        breakdownSteps.push({ step: `EXEMPTION_${rule.name}`, description: `Exemption: ${rule.name}`, amount: -capped });
      }
    }

    // Step 3: Deductions (80C, 80D, standard deduction, etc.)
    let deductibleAmount = 0;
    for (const rule of deductionRules) {
      const declared = input.approvedDeductions[rule.section] ?? 0;
      const capped = rule.maxLimit ? Math.min(declared, Number(rule.maxLimit)) : declared;
      deductibleAmount += capped;
      if (capped > 0) {
        breakdownSteps.push({ step: `DEDUCTION_${rule.section}`, description: `Deduction: ${rule.name}`, amount: -capped });
      }
    }

    // Step 4: Net taxable income
    const netTaxableIncome = Math.max(0, grossTaxableIncome - exemptIncome - deductibleAmount);
    breakdownSteps.push({ step: 'NET_TAXABLE', description: 'Net taxable income', amount: netTaxableIncome });

    // Step 5: Slab-based tax
    const { tax: taxBeforeRebate, slabsApplied } = this.applySlabs(netTaxableIncome, slabs);
    breakdownSteps.push({ step: 'TAX_ON_SLABS', description: 'Tax as per slabs', amount: taxBeforeRebate });

    // Step 6: Section 87A rebate
    let rebate = 0;
    if (rebateRule && netTaxableIncome <= Number(rebateRule.incomeLimit)) {
      rebate = Math.min(taxBeforeRebate, Number(rebateRule.maxRebate));
    }
    if (rebate > 0) {
      breakdownSteps.push({ step: 'REBATE_87A', description: 'Section 87A rebate', amount: -rebate });
    }

    const taxAfterRebate = Math.max(0, taxBeforeRebate - rebate);

    // Step 7: Surcharge with marginal relief
    const surcharge = this.applySurcharge(netTaxableIncome, taxAfterRebate, surchargeRules);
    if (surcharge > 0) {
      breakdownSteps.push({ step: 'SURCHARGE', description: 'Surcharge', amount: surcharge });
    }

    // Step 8: Health & Education Cess (4%)
    const cessBase = taxAfterRebate + surcharge;
    const cessRate = cessRule ? Number(cessRule.cessRate) : 0.04;
    const cess = Math.round(cessBase * cessRate);
    if (cess > 0) {
      breakdownSteps.push({ step: 'CESS', description: 'Health & Education Cess', amount: cess });
    }

    // Step 9: Total annual tax
    const totalAnnualTax = taxAfterRebate + surcharge + cess;
    breakdownSteps.push({ step: 'TOTAL_ANNUAL_TAX', description: 'Total annual tax liability', amount: totalAnnualTax });

    // Step 10: TDS already deducted (current employer + previous employer)
    const tdsAlreadyDeducted = input.tdsDeductedTillDate + input.previousEmployerTds;
    const remainingTax = Math.max(0, totalAnnualTax - tdsAlreadyDeducted);
    const monthlyTds = input.remainingPayrollMonths > 0
      ? Math.ceil(remainingTax / input.remainingPayrollMonths)
      : remainingTax;

    const effectiveTaxRate = grossTaxableIncome > 0 ? totalAnnualTax / grossTaxableIncome : 0;

    breakdownSteps.push({ step: 'TDS_DEDUCTED', description: 'TDS deducted so far', amount: -tdsAlreadyDeducted });
    breakdownSteps.push({ step: 'REMAINING_TAX', description: 'Remaining tax payable', amount: remainingTax });
    breakdownSteps.push({ step: 'MONTHLY_TDS', description: `Monthly TDS (over ${input.remainingPayrollMonths} months)`, amount: monthlyTds });

    return {
      grossTaxableIncome,
      exemptIncome,
      deductibleAmount,
      netTaxableIncome,
      taxBeforeRebate,
      rebate,
      surcharge,
      cess,
      totalAnnualTax,
      tdsAlreadyDeducted,
      remainingTax,
      monthlyTds,
      effectiveTaxRate,
      breakdownSteps,
      slabsApplied,
    };
  }

  private applySlabs(
    taxableIncome: number,
    slabs: { minIncome: Prisma.Decimal; maxIncome: Prisma.Decimal | null; taxRate: Prisma.Decimal; fixedTax: Prisma.Decimal }[],
  ): { tax: number; slabsApplied: SlabApplication[] } {
    let tax = 0;
    const slabsApplied: SlabApplication[] = [];

    for (const slab of slabs) {
      const min = Number(slab.minIncome);
      const max = slab.maxIncome ? Number(slab.maxIncome) : null;
      const rate = Number(slab.taxRate);

      if (taxableIncome <= min) break;

      const incomeInSlab = max ? Math.min(taxableIncome, max) - min : taxableIncome - min;
      const taxFromSlab = Math.round(incomeInSlab * rate);
      tax += taxFromSlab;

      slabsApplied.push({ minIncome: min, maxIncome: max, taxRate: rate, taxablePortionInSlab: incomeInSlab, taxFromSlab });
    }

    return { tax, slabsApplied };
  }

  private applySurcharge(
    netTaxableIncome: number,
    taxAfterRebate: number,
    surchargeRules: { minIncome: Prisma.Decimal; maxIncome: Prisma.Decimal | null; surchargeRate: Prisma.Decimal; marginalReliefEnabled: boolean }[],
  ): number {
    const applicableRule = [...surchargeRules]
      .reverse()
      .find((r) => netTaxableIncome > Number(r.minIncome));

    if (!applicableRule || Number(applicableRule.surchargeRate) === 0) return 0;

    const surcharge = Math.round(taxAfterRebate * Number(applicableRule.surchargeRate));

    // Marginal relief: surcharge cannot exceed income above the lower slab threshold
    if (applicableRule.marginalReliefEnabled) {
      const prevRule = surchargeRules.find(
        (r) => Number(r.maxIncome) === Number(applicableRule.minIncome),
      );
      if (prevRule) {
        const maxSurcharge = netTaxableIncome - Number(applicableRule.minIncome);
        return Math.min(surcharge, Math.max(0, maxSurcharge));
      }
    }

    return surcharge;
  }

  async compareRegimes(
    input: Omit<TdsCalculationInput, 'regime'>,
  ): Promise<{ new: TdsCalculationResult; old: TdsCalculationResult; recommendation: TaxRegime }> {
    const [newRegime, oldRegime] = await Promise.all([
      this.calculate({ ...input, regime: 'NEW' }),
      this.calculate({ ...input, regime: 'OLD' }),
    ]);

    return {
      new: newRegime,
      old: oldRegime,
      recommendation: newRegime.totalAnnualTax <= oldRegime.totalAnnualTax ? 'NEW' : 'OLD',
    };
  }
}
