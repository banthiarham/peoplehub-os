'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Download } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { downloadFile } from '@/lib/download';
import { formatINR } from '@/lib/utils';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { PayrollPayslipView, type PayslipComponent } from './payroll-payslip-view';

const MONTH_NAMES = [
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

interface RunEntry {
  id: string;
  grossPay: number;
  totalDeductions: number;
  netPay: number;
  components: PayslipComponent[];
  errors?: string[];
  warnings?: string[];
  explanation?: string[];
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    employeeCode: string;
    department: { name: string } | null;
  };
}

interface RunDetail {
  id: string;
  month: number;
  year: number;
  status: string;
  entries: RunEntry[];
  totals: {
    totalNet: number;
    totalGross: number;
    totalDeductions: number;
    errors?: number;
    warnings?: number;
  };
}

interface PayrollRunDetailDialogProps {
  runId: string | null;
  onClose: () => void;
}

/** Dialog showing a payroll run's per-employee entries; click an entry to view its payslip. */
export function PayrollRunDetailDialog({ runId, onClose }: PayrollRunDetailDialogProps) {
  const [entry, setEntry] = useState<RunEntry | null>(null);

  const { data: run, isLoading } = useQuery<RunDetail>({
    queryKey: ['payroll', 'runs', runId],
    queryFn: () => api.get(`/payroll/runs/${runId}`).then((r) => r.data),
    enabled: !!runId,
  });

  const period = run ? `${MONTH_NAMES[run.month - 1]} ${run.year}` : '';

  return (
    <Dialog
      open={!!runId}
      onOpenChange={(open) => {
        if (!open) {
          setEntry(null);
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        {entry ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="outline"
                  className="h-7 w-7"
                  onClick={() => setEntry(null)}
                  aria-label="Back to run"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                </Button>
                Payslip · {period}
              </DialogTitle>
            </DialogHeader>
            <PayrollPayslipView
              employeeName={`${entry.employee.firstName} ${entry.employee.lastName}`}
              meta={`${entry.employee.employeeCode} · ${entry.employee.department?.name ?? '—'} · ${period}`}
              grossPay={entry.grossPay}
              totalDeductions={entry.totalDeductions}
              netPay={entry.netPay}
              components={entry.components ?? []}
            />
            {!!entry.errors?.length && (
              <IssueList title="Critical issues" variant="destructive" items={entry.errors} />
            )}
            {!!entry.warnings?.length && (
              <IssueList title="Warnings" variant="warning" items={entry.warnings} />
            )}
            {!!entry.explanation?.length && (
              <IssueList title="Calculation explanation" variant="outline" items={entry.explanation} />
            )}
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                Payroll run · {period}
                {run && <Badge variant={statusVariant(run.status)}>{run.status}</Badge>}
              </DialogTitle>
              <DialogDescription>
                {run
                  ? `${run.entries.length} employees · Gross ${formatINR(run.totals.totalGross, true)} · Net ${formatINR(run.totals.totalNet, true)}`
                  : 'Loading run details…'}
              </DialogDescription>
            </DialogHeader>
            {run && ((run.totals.errors ?? 0) > 0 || (run.totals.warnings ?? 0) > 0) && (
              <div className="rounded-lg border border-line bg-canvas p-3 text-sm">
                {(run.totals.errors ?? 0) > 0 && (
                  <p className="font-medium text-danger">
                    {run.totals.errors} critical issue(s) block payroll approval.
                  </p>
                )}
                {(run.totals.warnings ?? 0) > 0 && (
                  <p className="text-ink-muted">
                    {run.totals.warnings} warning(s) need payroll review before publishing.
                  </p>
                )}
              </div>
            )}
            {run && run.entries.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="w-fit"
                onClick={() =>
                  downloadFile(`/payroll/runs/${run.id}/export`, 'payroll-register.csv')
                }
              >
                <Download className="h-3.5 w-3.5" /> Export register CSV
              </Button>
            )}
            {isLoading || !run ? (
              <div className="space-y-2">
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="h-10" />
                ))}
              </div>
            ) : run.entries.length ? (
              <Table>
                <THead>
                  <TR>
                    <TH>Employee</TH>
                    <TH>Checks</TH>
                    <TH className="text-right">Gross</TH>
                    <TH className="text-right">Deductions</TH>
                    <TH className="text-right">Net</TH>
                  </TR>
                </THead>
                <TBody>
                  {run.entries.map((e) => (
                    <TR
                      key={e.id}
                      className="cursor-pointer hover:bg-primary-50/40"
                      onClick={() => setEntry(e)}
                    >
                      <TD>
                        <span className="block font-medium">
                          {e.employee.firstName} {e.employee.lastName}
                        </span>
                        <span className="block text-xs text-ink-muted">
                          {e.employee.employeeCode} · {e.employee.department?.name ?? '—'}
                        </span>
                      </TD>
                      <TD>
                        <div className="flex gap-1">
                          {!!e.errors?.length && (
                            <Badge variant="destructive">{e.errors.length} errors</Badge>
                          )}
                          {!!e.warnings?.length && (
                            <Badge variant="warning">{e.warnings.length} warnings</Badge>
                          )}
                          {!e.errors?.length && !e.warnings?.length && (
                            <Badge variant="success">Clear</Badge>
                          )}
                        </div>
                      </TD>
                      <TD className="text-right tabular-nums text-ink-muted">
                        {formatINR(e.grossPay)}
                      </TD>
                      <TD className="text-right tabular-nums text-ink-muted">
                        −{formatINR(e.totalDeductions)}
                      </TD>
                      <TD className="text-right font-medium tabular-nums">{formatINR(e.netPay)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            ) : (
              <p className="py-6 text-center text-sm text-ink-muted">
                No entries yet — process the run to compute payslips.
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function IssueList({
  title,
  variant,
  items,
}: {
  title: string;
  variant: 'destructive' | 'warning' | 'outline';
  items: string[];
}) {
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="mb-2 flex items-center gap-2">
        <Badge variant={variant}>{title}</Badge>
      </div>
      <ul className="space-y-1 text-sm text-ink-muted">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
