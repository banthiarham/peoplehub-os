import { Injectable } from '@nestjs/common';

export interface ComponentLine {
  code: string;
  name: string;
  type: 'EARNING' | 'DEDUCTION' | 'EMPLOYER_CONTRIBUTION';
  monthly: number;
  annual: number;
}

export interface MonthlyPayrollInput {
  ctc: number; // annual
  payableDays: number;
  daysInMonth: number;
  monthlyEmiDeduction?: number;
}

export interface MonthlyPayrollResult {
  grossPay: number;
  totalDeductions: number;
  netPay: number;
  components: ComponentLine[];
}

const PF_WAGE_CAP = 15000;

/**
 * Demo-grade India statutory calculator aligned with the seeded
 * "Standard India Salary Structure": BASIC 40% of gross, HRA 50% of basic,
 * SA balancing figure, PF 12% of capped basic, ESI 0.75% if gross <= 21k,
 * PT flat slab, TDS from projected annual income (new regime FY 2025-26).
 */
@Injectable()
export class PayrollCalculatorService {
  /** Break an annual CTC into the standard monthly component grid. */
  buildComponents(ctc: number): ComponentLine[] {
    const monthlyCtc = ctc / 12;
    // Gross = CTC minus employer PF contribution; solve iteratively (2 passes suffice).
    let gross = monthlyCtc;
    for (let i = 0; i < 3; i++) {
      const basic = gross * 0.4;
      const employerPf = 0.12 * Math.min(basic, PF_WAGE_CAP);
      gross = monthlyCtc - employerPf;
    }
    const basic = round2(gross * 0.4);
    const hra = round2(basic * 0.5);
    const employerPf = round2(0.12 * Math.min(basic, PF_WAGE_CAP));
    const specialAllowance = round2(gross - basic - hra);

    const lines: ComponentLine[] = [
      { code: 'BASIC', name: 'Basic', type: 'EARNING', monthly: basic, annual: round2(basic * 12) },
      { code: 'HRA', name: 'HRA', type: 'EARNING', monthly: hra, annual: round2(hra * 12) },
      {
        code: 'SA',
        name: 'Special Allowance',
        type: 'EARNING',
        monthly: specialAllowance,
        annual: round2(specialAllowance * 12),
      },
      {
        code: 'PF_EMP_R',
        name: 'Provident Fund (Employer)',
        type: 'EMPLOYER_CONTRIBUTION',
        monthly: employerPf,
        annual: round2(employerPf * 12),
      },
    ];
    return lines;
  }

  calculateMonth(input: MonthlyPayrollInput): MonthlyPayrollResult {
    const proration = input.daysInMonth > 0 ? input.payableDays / input.daysInMonth : 1;
    const full = this.buildComponents(input.ctc);
    const earnings = full
      .filter((c) => c.type === 'EARNING')
      .map((c) => ({ ...c, monthly: round2(c.monthly * proration) }));
    const gross = round2(earnings.reduce((s, c) => s + c.monthly, 0));
    const basic = earnings.find((c) => c.code === 'BASIC')?.monthly ?? 0;

    const pf = round2(0.12 * Math.min(basic, PF_WAGE_CAP));
    const esi = gross <= 21000 ? round2(gross * 0.0075) : 0;
    const pt = gross >= 15000 ? 200 : gross >= 10000 ? 150 : 0;
    const tds = this.monthlyTds(gross * 12);
    const emi = input.monthlyEmiDeduction ?? 0;

    const deductions: ComponentLine[] = [
      { code: 'PF_EMP', name: 'Provident Fund (Employee)', type: 'DEDUCTION', monthly: pf, annual: round2(pf * 12) },
      ...(esi > 0
        ? [{ code: 'ESI_EMP', name: 'ESI (Employee)', type: 'DEDUCTION' as const, monthly: esi, annual: round2(esi * 12) }]
        : []),
      ...(pt > 0
        ? [{ code: 'PT', name: 'Professional Tax', type: 'DEDUCTION' as const, monthly: pt, annual: pt * 12 }]
        : []),
      ...(tds > 0
        ? [{ code: 'TDS', name: 'TDS', type: 'DEDUCTION' as const, monthly: tds, annual: round2(tds * 12) }]
        : []),
      ...(emi > 0
        ? [{ code: 'LOAN_EMI', name: 'Loan EMI', type: 'DEDUCTION' as const, monthly: emi, annual: 0 }]
        : []),
    ];

    const totalDeductions = round2(deductions.reduce((s, c) => s + c.monthly, 0));
    return {
      grossPay: gross,
      totalDeductions,
      netPay: round2(gross - totalDeductions),
      components: [...earnings, ...deductions],
    };
  }

  /** Simplified new-regime TDS (FY 2025-26): standard deduction 75k, 87A rebate up to 12L. */
  monthlyTds(annualGross: number): number {
    const taxable = Math.max(0, annualGross - 75000);
    if (taxable <= 1200000) return 0; // section 87A rebate
    const slabs: Array<[number, number, number]> = [
      [0, 400000, 0],
      [400000, 800000, 0.05],
      [800000, 1200000, 0.1],
      [1200000, 1600000, 0.15],
      [1600000, 2000000, 0.2],
      [2000000, 2400000, 0.25],
      [2400000, Infinity, 0.3],
    ];
    let tax = 0;
    for (const [lo, hi, rate] of slabs) {
      if (taxable > lo) tax += (Math.min(taxable, hi) - lo) * rate;
    }
    tax *= 1.04; // health & education cess
    return round2(tax / 12);
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
