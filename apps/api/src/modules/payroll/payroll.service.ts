import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { AuthUser } from '../../common/types/auth-user';
import { toCsv } from '../../common/utils/csv';
import {
  AssignSalaryDto,
  CreateExpenseDto,
  CreateLoanDto,
  CreateRunDto,
  ListExpensesDto,
  PageDto,
} from './dto/payroll.dto';
import { PayrollCalculatorService } from './payroll-calculator.service';

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calculator: PayrollCalculatorService,
  ) {}

  // ── Structures ────────────────────────────────────────────────────────────
  async listStructures(tenantId: string) {
    return this.prisma.salaryStructure.findMany({
      where: { tenantId },
      include: { components: { orderBy: { sequence: 'asc' } } },
    });
  }

  // ── Employee salaries ─────────────────────────────────────────────────────
  async listSalaries(tenantId: string, q: PageDto) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const where: Prisma.EmployeeWhereInput = {
      tenantId,
      status: { notIn: ['EXITED', 'INACTIVE'] },
      ...(q.search && {
        OR: [
          { firstName: { contains: q.search, mode: 'insensitive' as const } },
          { lastName: { contains: q.search, mode: 'insensitive' as const } },
          { employeeCode: { contains: q.search, mode: 'insensitive' as const } },
        ],
      }),
    };
    const [employees, total] = await Promise.all([
      this.prisma.employee.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeCode: true,
          department: { select: { name: true } },
          designation: { select: { name: true } },
          employeeSalaries: {
            orderBy: { effectiveFrom: 'desc' },
            take: 1,
            select: { id: true, ctc: true, effectiveFrom: true, components: true },
          },
        },
        orderBy: { firstName: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.employee.count({ where }),
    ]);
    return {
      data: employees.map((e) => ({ ...e, currentSalary: e.employeeSalaries[0] ?? null })),
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async salaryHistory(tenantId: string, employeeId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
      select: { id: true, firstName: true, lastName: true, employeeCode: true },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    const history = await this.prisma.employeeSalary.findMany({
      where: { employeeId },
      orderBy: { effectiveFrom: 'desc' },
      include: { salaryStructure: { select: { name: true } } },
    });
    return { employee, history };
  }

  async assignSalary(tenantId: string, dto: AssignSalaryDto) {
    const [employee, structure] = await Promise.all([
      this.prisma.employee.findFirst({ where: { id: dto.employeeId, tenantId } }),
      this.prisma.salaryStructure.findFirst({ where: { id: dto.salaryStructureId, tenantId } }),
    ]);
    if (!employee) throw new NotFoundException('Employee not found');
    if (!structure) throw new NotFoundException('Salary structure not found');

    const effectiveFrom = new Date(dto.effectiveFrom);
    await this.prisma.employeeSalary.updateMany({
      where: { employeeId: dto.employeeId, effectiveTo: null },
      data: { effectiveTo: effectiveFrom },
    });
    const components = this.calculator.buildComponents(dto.ctc) as unknown as Prisma.InputJsonValue;
    return this.prisma.employeeSalary.create({
      data: {
        employeeId: dto.employeeId,
        salaryStructureId: dto.salaryStructureId,
        ctc: dto.ctc,
        effectiveFrom,
        components,
      },
    });
  }

  // ── Payroll runs ──────────────────────────────────────────────────────────
  async listRuns(tenantId: string) {
    const runs = await this.prisma.payrollRun.findMany({
      where: { tenantId },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      include: { _count: { select: { entries: true } } },
    });
    const totals = await this.prisma.payrollRunEmployee.groupBy({
      by: ['payrollRunId'],
      where: { payrollRun: { tenantId } },
      _sum: { netPay: true, grossPay: true },
    });
    const totalMap = new Map(totals.map((t) => [t.payrollRunId, t._sum]));
    return runs.map((r) => ({
      ...r,
      employees: r._count.entries,
      totalNet: totalMap.get(r.id)?.netPay ?? 0,
      totalGross: totalMap.get(r.id)?.grossPay ?? 0,
    }));
  }

  async getRun(tenantId: string, id: string) {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id, tenantId },
      include: {
        entries: {
          include: {
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                employeeCode: true,
                department: { select: { name: true } },
              },
            },
          },
          orderBy: { netPay: 'desc' },
        },
      },
    });
    if (!run) throw new NotFoundException('Payroll run not found');
    const totalNet = run.entries.reduce((s, e) => s + e.netPay, 0);
    const totalGross = run.entries.reduce((s, e) => s + e.grossPay, 0);
    const totalDeductions = run.entries.reduce((s, e) => s + e.totalDeductions, 0);
    const entries = run.entries.map((entry) => ({
      ...entry,
      errors: this.jsonStringArray(entry.errors),
      warnings: this.jsonStringArray(entry.warnings),
      explanation: this.explainPayrollEntry(entry),
    }));
    return {
      ...run,
      entries,
      totals: {
        totalNet,
        totalGross,
        totalDeductions,
        errors: entries.reduce((sum, entry) => sum + entry.errors.length, 0),
        warnings: entries.reduce((sum, entry) => sum + entry.warnings.length, 0),
      },
    };
  }

  async exportRunCsv(tenantId: string, id: string): Promise<{ csv: string; period: string }> {
    const run = await this.getRun(tenantId, id);
    const csv = toCsv(
      run.entries.map((e) => ({
        employeeCode: e.employee.employeeCode,
        name: `${e.employee.firstName} ${e.employee.lastName}`,
        department: e.employee.department?.name ?? '',
        grossPay: e.grossPay,
        totalDeductions: e.totalDeductions,
        netPay: e.netPay,
      })),
    );
    return { csv, period: `${run.year}-${String(run.month).padStart(2, '0')}` };
  }

  async createRun(tenantId: string, dto: CreateRunDto) {
    const existing = await this.prisma.payrollRun.findUnique({
      where: { tenantId_month_year: { tenantId, month: dto.month, year: dto.year } },
    });
    if (existing) throw new BadRequestException('A run for this month already exists');
    return this.prisma.payrollRun.create({
      data: { tenantId, month: dto.month, year: dto.year },
    });
  }

  async processRun(tenantId: string, id: string) {
    const run = await this.prisma.payrollRun.findFirst({ where: { id, tenantId } });
    if (!run) throw new NotFoundException('Payroll run not found');
    if (!['DRAFT', 'PROCESSING'].includes(run.status)) {
      throw new BadRequestException(`Run is ${run.status}; only DRAFT runs can be processed`);
    }

    const daysInMonth = new Date(run.year, run.month, 0).getDate();
    const monthStart = new Date(Date.UTC(run.year, run.month - 1, 1));
    const monthEnd = new Date(Date.UTC(run.year, run.month, 0));

    const employees = await this.prisma.employee.findMany({
      where: { tenantId, status: { notIn: ['EXITED', 'INACTIVE', 'CANDIDATE', 'PREBOARDING'] } },
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        pan: true,
        uan: true,
        bankDetails: true,
        employeeSalaries: {
          where: { effectiveFrom: { lte: monthEnd } },
          orderBy: { effectiveFrom: 'desc' },
          take: 1,
          select: { ctc: true },
        },
        loans: {
          where: { status: 'ACTIVE' },
          select: { emiAmount: true },
        },
      },
    });

    const attendanceWarnings = await this.attendanceWarningMap(tenantId, monthStart, monthEnd);

    // Unpaid leave days (LWP) reduce payable days
    const lwpRequests = await this.prisma.leaveRequest.findMany({
      where: {
        tenantId,
        status: 'APPROVED',
        leaveType: { isPaid: false },
        fromDate: { lte: monthEnd },
        toDate: { gte: monthStart },
      },
      select: { employeeId: true, days: true },
    });
    const lwpByEmployee = new Map<string, number>();
    for (const r of lwpRequests) {
      lwpByEmployee.set(r.employeeId, (lwpByEmployee.get(r.employeeId) ?? 0) + r.days);
    }

    let processed = 0;
    let errorCount = 0;
    let warningCount = 0;
    for (const emp of employees) {
      const salary = emp.employeeSalaries[0];
      const errors: string[] = [];
      const warnings: string[] = [];
      if (!salary) errors.push('Missing active salary structure or CTC for this payroll month');
      if (!emp.pan) warnings.push('PAN is missing; TDS and Form 16 data should be reviewed');
      if (!emp.uan) warnings.push('UAN is missing; PF reporting should be reviewed');
      if (!emp.bankDetails) warnings.push('Bank details are missing; bank file payout may fail');
      const unfinalized = attendanceWarnings.get(emp.id);
      if (unfinalized) warnings.push(`${unfinalized} attendance record(s) are not finalized`);

      const lopDays = Math.min(lwpByEmployee.get(emp.id) ?? 0, daysInMonth);
      const payableDays = daysInMonth - lopDays;
      const emi = emp.loans.reduce((s, l) => s + l.emiAmount, 0);
      if (!salary) {
        await this.prisma.payrollRunEmployee.upsert({
          where: { payrollRunId_employeeId: { payrollRunId: run.id, employeeId: emp.id } },
          create: {
            payrollRunId: run.id,
            employeeId: emp.id,
            grossPay: 0,
            totalDeductions: 0,
            netPay: 0,
            lopDays,
            payableDays: 0,
            components: [],
            errors,
            warnings,
          },
          update: {
            grossPay: 0,
            totalDeductions: 0,
            netPay: 0,
            lopDays,
            payableDays: 0,
            components: [],
            errors,
            warnings,
          },
        });
        errorCount += errors.length;
        warningCount += warnings.length;
        continue;
      }
      const result = this.calculator.calculateMonth({
        ctc: salary.ctc,
        payableDays,
        daysInMonth,
        monthlyEmiDeduction: emi,
      });
      if (result.netPay < 0) errors.push('Net pay is negative after deductions');
      await this.prisma.payrollRunEmployee.upsert({
        where: { payrollRunId_employeeId: { payrollRunId: run.id, employeeId: emp.id } },
        create: {
          payrollRunId: run.id,
          employeeId: emp.id,
          grossPay: result.grossPay,
          totalDeductions: result.totalDeductions,
          netPay: result.netPay,
          lopDays,
          payableDays,
          components: result.components as unknown as Prisma.InputJsonValue,
          errors,
          warnings,
        },
        update: {
          grossPay: result.grossPay,
          totalDeductions: result.totalDeductions,
          netPay: result.netPay,
          lopDays,
          payableDays,
          components: result.components as unknown as Prisma.InputJsonValue,
          errors,
          warnings,
        },
      });
      errorCount += errors.length;
      warningCount += warnings.length;
      processed++;
    }
    await this.prisma.payrollRun.update({ where: { id }, data: { status: 'REVIEW' } });
    return { processed, errors: errorCount, warnings: warningCount, status: 'REVIEW' };
  }

  async approveRun(tenantId: string, id: string, userId: string) {
    const run = await this.prisma.payrollRun.findFirst({ where: { id, tenantId } });
    if (!run) throw new NotFoundException('Payroll run not found');
    if (run.status !== 'REVIEW') throw new BadRequestException('Run must be in REVIEW to approve');
    const entries = await this.prisma.payrollRunEmployee.findMany({
      where: { payrollRunId: id },
      select: { errors: true },
    });
    const criticalErrors = entries.reduce((sum, entry) => sum + this.jsonStringArray(entry.errors).length, 0);
    if (!entries.length) throw new BadRequestException('Process the run before approving payroll');
    if (criticalErrors > 0) {
      throw new BadRequestException(
        `Payroll has ${criticalErrors} critical validation error(s). Fix them before approval.`,
      );
    }
    return this.prisma.payrollRun.update({
      where: { id },
      data: { status: 'APPROVED', lockedAt: new Date(), lockedById: userId },
    });
  }

  async publishRun(tenantId: string, id: string) {
    const run = await this.getRun(tenantId, id);
    if (run.status !== 'APPROVED') {
      throw new BadRequestException('Run must be APPROVED before publishing');
    }
    for (const entry of run.entries) {
      await this.prisma.payslip.upsert({
        where: {
          employeeId_month_year: { employeeId: entry.employeeId, month: run.month, year: run.year },
        },
        create: {
          tenantId,
          employeeId: entry.employeeId,
          payrollRunId: run.id,
          month: run.month,
          year: run.year,
          grossPay: entry.grossPay,
          totalDeductions: entry.totalDeductions,
          netPay: entry.netPay,
          components: entry.components as Prisma.InputJsonValue,
          publishedAt: new Date(),
        },
        update: { publishedAt: new Date() },
      });
    }
    await this.prisma.payrollRun.update({
      where: { id },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });
    return { published: run.entries.length };
  }

  // ── Payslips ──────────────────────────────────────────────────────────────
  async myPayslips(user: AuthUser) {
    if (!user.employeeId) throw new ForbiddenException('No employee profile linked');
    return this.prisma.payslip.findMany({
      where: { employeeId: user.employeeId },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      take: 24,
    });
  }

  async getPayslip(tenantId: string, id: string) {
    const slip = await this.prisma.payslip.findFirst({
      where: { id, tenantId },
      include: {
        employee: {
          select: {
            firstName: true,
            lastName: true,
            employeeCode: true,
            pan: true,
            uan: true,
            department: { select: { name: true } },
            designation: { select: { name: true } },
          },
        },
      },
    });
    if (!slip) throw new NotFoundException('Payslip not found');
    return slip;
  }

  // ── Stats ─────────────────────────────────────────────────────────────────
  async stats(tenantId: string) {
    const lastRun = await this.prisma.payrollRun.findFirst({
      where: { tenantId, status: { in: ['APPROVED', 'LOCKED', 'PUBLISHED', 'CLOSED', 'REVIEW'] } },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      include: { entries: { select: { netPay: true, grossPay: true, components: true } } },
    });

    const runs = await this.prisma.payrollRun.findMany({
      where: { tenantId },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      take: 6,
      include: { entries: { select: { netPay: true } } },
    });

    let statutory = { pf: 0, esi: 0, pt: 0, tds: 0 };
    if (lastRun) {
      for (const e of lastRun.entries) {
        const comps = (e.components as Array<{ code: string; monthly: number }> | null) ?? [];
        for (const c of comps) {
          if (c.code === 'PF_EMP') statutory.pf += c.monthly;
          else if (c.code === 'ESI_EMP') statutory.esi += c.monthly;
          else if (c.code === 'PT') statutory.pt += c.monthly;
          else if (c.code === 'TDS') statutory.tds += c.monthly;
        }
      }
      statutory = {
        pf: Math.round(statutory.pf),
        esi: Math.round(statutory.esi),
        pt: Math.round(statutory.pt),
        tds: Math.round(statutory.tds),
      };
    }

    return {
      lastRun: lastRun
        ? {
            id: lastRun.id,
            month: lastRun.month,
            year: lastRun.year,
            status: lastRun.status,
            totalNet: Math.round(lastRun.entries.reduce((s, e) => s + e.netPay, 0)),
            employees: lastRun.entries.length,
          }
        : null,
      monthlyCostTrend: runs
        .map((r) => ({
          month: `${r.year}-${String(r.month).padStart(2, '0')}`,
          amount: Math.round(r.entries.reduce((s, e) => s + e.netPay, 0)),
        }))
        .reverse(),
      statutory,
    };
  }

  private async attendanceWarningMap(tenantId: string, monthStart: Date, monthEnd: Date) {
    const grouped = await this.prisma.attendanceRecord.groupBy({
      by: ['employeeId'],
      where: {
        tenantId,
        date: { gte: monthStart, lte: monthEnd },
        isFinalized: false,
      },
      _count: true,
    });
    return new Map(grouped.map((row) => [row.employeeId, row._count]));
  }

  private jsonStringArray(value: Prisma.JsonValue | null | undefined): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  }

  private explainPayrollEntry(entry: {
    grossPay: number;
    totalDeductions: number;
    netPay: number;
    lopDays: number;
    payableDays: number;
    components: Prisma.JsonValue;
  }): string[] {
    const components = Array.isArray(entry.components)
      ? (entry.components as Array<{ code?: string; name?: string; type?: string; monthly?: number }>)
      : [];
    const earnings = components.filter((c) => c.type === 'EARNING');
    const deductions = components.filter((c) => c.type === 'DEDUCTION');
    const lines = [
      `Payable days: ${entry.payableDays}${entry.lopDays ? ` after ${entry.lopDays} LOP day(s)` : ''}.`,
      `Gross pay is ${Math.round(entry.grossPay)} from ${earnings.map((c) => c.name ?? c.code).join(', ') || 'earnings'}.`,
    ];
    if (deductions.length) {
      lines.push(
        `Deductions total ${Math.round(entry.totalDeductions)} from ${deductions
          .map((c) => `${c.name ?? c.code}: ${Math.round(c.monthly ?? 0)}`)
          .join(', ')}.`,
      );
    } else {
      lines.push('No statutory or loan deductions were applied.');
    }
    lines.push(`Net pay is ${Math.round(entry.netPay)}.`);
    return lines;
  }

  // ── Expenses ──────────────────────────────────────────────────────────────
  async listExpenses(tenantId: string, q: ListExpensesDto) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const where: Prisma.ExpenseClaimWhereInput = {
      tenantId,
      ...(q.status && { status: q.status }),
    };
    const [data, total] = await Promise.all([
      this.prisma.expenseClaim.findMany({
        where,
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.expenseClaim.count({ where }),
    ]);
    return { data, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }

  async createExpense(user: AuthUser, dto: CreateExpenseDto) {
    if (!user.employeeId) throw new ForbiddenException('No employee profile linked');
    return this.prisma.expenseClaim.create({
      data: { ...dto, tenantId: user.tenantId, employeeId: user.employeeId, status: 'SUBMITTED' },
    });
  }

  async decideExpense(tenantId: string, id: string, status: 'APPROVED' | 'REJECTED' | 'PAID') {
    const claim = await this.prisma.expenseClaim.findFirst({ where: { id, tenantId } });
    if (!claim) throw new NotFoundException('Expense claim not found');
    return this.prisma.expenseClaim.update({ where: { id }, data: { status } });
  }

  // ── Loans ─────────────────────────────────────────────────────────────────
  async listLoans(tenantId: string) {
    return this.prisma.loan.findMany({
      where: { tenantId },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createLoan(tenantId: string, dto: CreateLoanDto) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, tenantId },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    const now = new Date();
    return this.prisma.loan.create({
      data: {
        tenantId,
        employeeId: dto.employeeId,
        type: dto.type,
        amount: dto.amount,
        outstanding: dto.amount,
        emiAmount: dto.emiAmount,
        emiStartMonth: now.getMonth() + 1,
        emiStartYear: now.getFullYear(),
        totalInstallments: dto.totalInstallments,
      },
    });
  }

  async closeLoan(tenantId: string, id: string) {
    const loan = await this.prisma.loan.findFirst({ where: { id, tenantId } });
    if (!loan) throw new NotFoundException('Loan not found');
    return this.prisma.loan.update({
      where: { id },
      data: { status: 'CLOSED', outstanding: 0 },
    });
  }
}
