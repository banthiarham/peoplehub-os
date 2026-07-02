export type PayrollRunStatus =
  | 'DRAFT'
  | 'PROCESSING'
  | 'REVIEW'
  | 'APPROVED'
  | 'LOCKED'
  | 'PUBLISHED'
  | 'CLOSED';

export interface PayrollComponent {
  code: string;
  name: string;
  type: 'EARNING' | 'DEDUCTION' | 'EMPLOYER_CONTRIBUTION';
  amount: number;
  isTaxable: boolean;
}

export interface PayrollSummary {
  employeeId: string;
  month: number;
  year: number;
  grossPay: number;
  totalDeductions: number;
  netPay: number;
  lopDays: number;
  payableDays: number;
}
