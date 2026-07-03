import { PayrollCalculatorService } from './payroll-calculator.service';

describe('PayrollCalculatorService', () => {
  const calc = new PayrollCalculatorService();

  describe('buildComponents', () => {
    it('splits CTC into BASIC (40% of gross), HRA (50% of basic) and balancing SA', () => {
      const components = calc.buildComponents(1200000);
      const basic = components.find((c) => c.code === 'BASIC')!;
      const hra = components.find((c) => c.code === 'HRA')!;
      const sa = components.find((c) => c.code === 'SA')!;
      const employerPf = components.find((c) => c.code === 'PF_EMP_R')!;

      expect(hra.monthly).toBeCloseTo(basic.monthly * 0.5, 0);
      // gross + employer PF ≈ monthly CTC
      const gross = basic.monthly + hra.monthly + sa.monthly;
      expect(gross + employerPf.monthly).toBeCloseTo(100000, 0);
      // employer PF capped at 12% of ₹15,000
      expect(employerPf.monthly).toBeLessThanOrEqual(1800);
    });
  });

  describe('monthlyTds (new regime FY 2025-26)', () => {
    it('is zero at or below the 87A rebate threshold (₹12L taxable)', () => {
      expect(calc.monthlyTds(1200000)).toBe(0);
      expect(calc.monthlyTds(1275000)).toBe(0); // 12.75L gross - 75k std deduction = 12L
    });

    it('applies slab rates plus 4% cess above the rebate threshold', () => {
      // 24L gross -> 23.25L taxable
      // slabs: 4L@0 + 4L@5% + 4L@10% + 4L@15% + 4L@20% + 3.25L@25% = 281,250; +4% cess = 292,500
      expect(calc.monthlyTds(2400000)).toBeCloseTo(292500 / 12, 0);
    });

    it('never returns a negative value', () => {
      expect(calc.monthlyTds(0)).toBe(0);
      expect(calc.monthlyTds(50000)).toBe(0);
    });
  });

  describe('calculateMonth', () => {
    it('computes gross, statutory deductions and net for a full month', () => {
      const result = calc.calculateMonth({ ctc: 1200000, payableDays: 30, daysInMonth: 30 });
      expect(result.grossPay).toBeGreaterThan(0);
      expect(result.netPay).toBeCloseTo(result.grossPay - result.totalDeductions, 1);

      const pf = result.components.find((c) => c.code === 'PF_EMP')!;
      expect(pf.monthly).toBeLessThanOrEqual(1800);

      // gross ≈ 98,200/month > ₹21k, so no ESI line
      expect(result.components.find((c) => c.code === 'ESI_EMP')).toBeUndefined();
      // PT applies at ₹200 for gross >= 15k
      expect(result.components.find((c) => c.code === 'PT')?.monthly).toBe(200);
    });

    it('applies ESI for gross <= ₹21,000', () => {
      const result = calc.calculateMonth({ ctc: 240000, payableDays: 30, daysInMonth: 30 });
      const esi = result.components.find((c) => c.code === 'ESI_EMP');
      expect(esi).toBeDefined();
      expect(esi!.monthly).toBeCloseTo(result.grossPay * 0.0075, 1);
    });

    it('prorates earnings by payable days (loss of pay)', () => {
      const full = calc.calculateMonth({ ctc: 1200000, payableDays: 30, daysInMonth: 30 });
      const half = calc.calculateMonth({ ctc: 1200000, payableDays: 15, daysInMonth: 30 });
      expect(half.grossPay).toBeCloseTo(full.grossPay / 2, 0);
    });

    it('includes loan EMI as a deduction when present', () => {
      const result = calc.calculateMonth({
        ctc: 1200000,
        payableDays: 30,
        daysInMonth: 30,
        monthlyEmiDeduction: 10000,
      });
      expect(result.components.find((c) => c.code === 'LOAN_EMI')?.monthly).toBe(10000);
    });
  });
});
