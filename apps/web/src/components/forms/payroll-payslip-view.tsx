'use client';

import { Printer } from 'lucide-react';
import { formatINR } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface PayslipComponent {
  code: string;
  name: string;
  type: string;
  monthly: number;
}

interface PayrollPayslipViewProps {
  title?: string;
  employeeName?: string;
  meta?: string;
  grossPay: number;
  totalDeductions: number;
  netPay: number;
  components: PayslipComponent[];
  showPrint?: boolean;
}

function ComponentTable({ label, rows }: { label: string; rows: PayslipComponent[] }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
        {label}
      </p>
      <div className="overflow-hidden rounded-lg border border-line">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-line">
            {rows.length ? (
              rows.map((c) => (
                <tr key={c.code}>
                  <td className="px-3 py-2 text-ink">{c.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatINR(c.monthly)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-3 py-2 text-ink-muted" colSpan={2}>
                  None
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Presentational payslip document: header, earnings, deductions and highlighted net pay. */
export function PayrollPayslipView({
  title = 'VioHr · Demo Corp',
  employeeName,
  meta,
  grossPay,
  totalDeductions,
  netPay,
  components,
  showPrint = false,
}: PayrollPayslipViewProps) {
  const earnings = components.filter((c) => c.type === 'EARNING');
  const deductions = components.filter((c) => c.type !== 'EARNING');

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between border-b border-line pb-3">
        <div>
          <p className="text-sm font-semibold">{title}</p>
          {employeeName && <p className="mt-0.5 text-sm text-ink">{employeeName}</p>}
          {meta && <p className="text-xs text-ink-muted">{meta}</p>}
        </div>
        {showPrint && (
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <ComponentTable label="Earnings" rows={earnings} />
        <ComponentTable label="Deductions" rows={deductions} />
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm">
        <div className="rounded-lg border border-line px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-ink-muted">Gross</p>
          <p className="mt-0.5 font-semibold tabular-nums">{formatINR(grossPay)}</p>
        </div>
        <div className="rounded-lg border border-line px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-ink-muted">Deductions</p>
          <p className="mt-0.5 font-semibold tabular-nums text-danger">
            −{formatINR(totalDeductions)}
          </p>
        </div>
        <div className="rounded-lg border border-primary-200 bg-primary-50 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-primary-700">Net pay</p>
          <p className="mt-0.5 text-base font-bold tabular-nums text-primary-800">
            {formatINR(netPay)}
          </p>
        </div>
      </div>
    </div>
  );
}
