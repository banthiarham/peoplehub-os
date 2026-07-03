import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { AuthUser } from '../../common/types/auth-user';
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
    return { ...run, totals: { totalNet, totalGross, totalDeductions } };
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
    for (const emp of employees) {
      const salary = emp.employeeSalaries[0];
      if (!salary) continue;
      const lopDays = Math.min(lwpByEmployee.get(emp.id) ?? 0, daysInMonth);
      const payableDays = daysInMonth - lopDays;
      const emi = emp.loans.reduce((s, l) => s + l.emiAmount, 0);
      const result = this.calculator.calculateMonth({
        ctc: salary.ctc,
        payableDays,
        daysInMonth,
        monthlyEmiDeduction: emi,
      });
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
        },
        update: {
          grossPay: result.grossPay,
          totalDeductions: result.totalDeductions,
          netPay: result.netPay,
          lopDays,
          payableDays,
          components: result.components as unknown as Prisma.InputJsonValue,
        },
      });
      processed++;
    }
    await this.prisma.payrollRun.update({ where: { id }, data: { status: 'REVIEW' } });
    return { processed, status: 'REVIEW' };
  }

  async approveRun(tenantId: string, id: string, userId: string) {
    const run = await this.prisma.payrollRun.findFirst({ where: { id, tenantId } });
    if (!run) throw new NotFoundException('Payroll run not found');
    if (run.status !== 'REVIEW') throw new BadRequestException('Run must be in REVIEW to approve');
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
