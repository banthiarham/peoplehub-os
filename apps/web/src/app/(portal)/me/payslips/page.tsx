'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, ReceiptText } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { formatINR } from '@/lib/utils';
import { PayrollPayslipView, type PayslipComponent } from '@/components/forms/payroll-payslip-view';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

interface PayslipRow {
  id: string;
  month: number;
  year: number;
  grossPay: number;
  totalDeductions: number;
  netPay: number;
  components: PayslipComponent[];
}

export default function MyPayslipsPage() {
  const [openId, setOpenId] = useState<string | null>(null);
  const { data: payslips, isLoading } = useQuery<PayslipRow[]>({
    queryKey: ['payroll', 'my-payslips'],
    queryFn: () => api.get('/payroll/payslips/me').then((r) => r.data),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">My payslips</h1>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : payslips?.length ? (
        <div className="space-y-2">
          {payslips.map((p) => {
            const open = openId === p.id;
            return (
              <Card key={p.id} className="p-4">
                <button
                  className="flex w-full items-center justify-between text-left"
                  onClick={() => setOpenId(open ? null : p.id)}
                >
                  <div>
                    <p className="text-sm font-medium">
                      {MONTHS[p.month - 1]} {p.year}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      Net {formatINR(p.netPay)} · Gross {formatINR(p.grossPay)}
                    </p>
                  </div>
                  {open ? (
                    <ChevronUp className="h-4 w-4 text-ink-faint" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-ink-faint" />
                  )}
                </button>
                {open && (
                  <div className="mt-4 border-t border-line pt-4">
                    <PayrollPayslipView
                      meta={`${MONTHS[p.month - 1]} ${p.year}`}
                      grossPay={p.grossPay}
                      totalDeductions={p.totalDeductions}
                      netPay={p.netPay}
                      components={p.components ?? []}
                      showPrint
                    />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={ReceiptText}
          title="No payslips yet"
          description="Published payslips will appear here."
        />
      )}
    </div>
  );
}
