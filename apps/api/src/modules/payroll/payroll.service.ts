import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AgeCategory, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { AuthUser } from '../../common/types/auth-user';
import { toCsv } from '../../common/utils/csv';
import { TdsCalculationResult, TdsEngineService } from '../tax/tds-engine.service';
import {
  AssignSalaryDto,
  CreateExpenseDto,
  CreateLoanDto,
  CreatePayrollInputDto,
  CreateRunDto,
  ExpenseDecisionDto,
  ListExpensesDto,
  OverrideWarningsDto,
  PageDto,
  PreviewSalaryStructureDto,
  UpsertSalaryStructureDto,
  WaiveLoanDto,
} from './dto/payroll.dto';
import { PayrollCalculatorService } from './payroll-calculator.service';

const EXPENSE_POLICY_LIMITS: Record<string, number> = {
  TRAVEL: 50000,
  MEALS: 5000,
  INTERNET: 2500,
  SUPPLIES: 10000,
  OFFICE_SUPPLIES: 10000,
  LEARNING: 25000,
  MEDICAL: 15000,
};

const EARNING_INPUTS = new Set(['BONUS', 'ARREAR', 'INCENTIVE', 'OVERTIME', 'REIMBURSEMENT', 'LEAVE_ENCASHMENT', 'FULL_AND_FINAL']);

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calculator: PayrollCalculatorService,
    private readonly tdsEngine: TdsEngineService,
  ) {}

  // ── Structures ────────────────────────────────────────────────────────────
  async listStructures(tenantId: string) {
    return this.prisma.salaryStructure.findMany({
      where: { tenantId },
      include: { components: { orderBy: { sequence: 'asc' } } },
    });
  }

  async createStructure(tenantId: string, actorId: string | undefined, dto: UpsertSalaryStructureDto) {
    const components = this.normalizeStructureComponents(dto.components);
    const created = await this.prisma.salaryStructure.create({
      data: {
        tenantId,
        name: dto.name,
        description: dto.description,
        isActive: dto.isActive ?? true,
        components: {
          create: components,
        },
      },
      include: { components: { orderBy: { sequence: 'asc' } } },
    });
    await this.audit(tenantId, actorId, 'SALARY_STRUCTURE_CREATED', 'SalaryStructure', created.id, undefined, created);
    return created;
  }

  async updateStructure(tenantId: string, id: string, actorId: string | undefined, dto: UpsertSalaryStructureDto) {
    const existing = await this.prisma.salaryStructure.findFirst({
      where: { id, tenantId },
      include: { components: true },
    });
    if (!existing) throw new NotFoundException('Salary structure not found');
    const components = dto.components ? this.normalizeStructureComponents(dto.components) : null;
    const updated = await this.prisma.$transaction(async (tx) => {
      if (components) {
        await tx.salaryComponent.deleteMany({ where: { salaryStructureId: id } });
      }
      return tx.salaryStructure.update({
        where: { id },
        data: {
          name: dto.name,
          description: dto.description,
          isActive: dto.isActive ?? true,
          ...(components && {
            components: {
              create: components,
            },
          }),
        },
        include: { components: { orderBy: { sequence: 'asc' } } },
      });
    });
    await this.audit(tenantId, actorId, 'SALARY_STRUCTURE_UPDATED', 'SalaryStructure', id, existing, updated);
    return updated;
  }

  async previewStructure(tenantId: string, id: string, dto: PreviewSalaryStructureDto) {
    const structure = await this.prisma.salaryStructure.findFirst({
      where: { id, tenantId },
      include: { components: { orderBy: { sequence: 'asc' } } },
    });
    if (!structure) throw new NotFoundException('Salary structure not found');
    const components = this.buildComponentsForStructure(dto.ctc, structure.components);
    return this.salaryPreview(dto.ctc, components);
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

  async assignSalary(tenantId: string, dto: AssignSalaryDto, actorId?: string) {
    const [employee, structure] = await Promise.all([
      this.prisma.employee.findFirst({ where: { id: dto.employeeId, tenantId } }),
      this.prisma.salaryStructure.findFirst({
        where: { id: dto.salaryStructureId, tenantId },
        include: { components: { orderBy: { sequence: 'asc' } } },
      }),
    ]);
    if (!employee) throw new NotFoundException('Employee not found');
    if (!structure) throw new NotFoundException('Salary structure not found');
    if (!structure.isActive) throw new BadRequestException('Salary structure is inactive');

    const effectiveFrom = new Date(dto.effectiveFrom);
    await this.prisma.employeeSalary.updateMany({
      where: { employeeId: dto.employeeId, effectiveTo: null },
      data: { effectiveTo: effectiveFrom },
    });
    const components = this.buildComponentsForStructure(dto.ctc, structure.components) as unknown as Prisma.InputJsonValue;
    const created = await this.prisma.employeeSalary.create({
      data: {
        employeeId: dto.employeeId,
        salaryStructureId: dto.salaryStructureId,
        ctc: dto.ctc,
        effectiveFrom,
        components,
      },
    });
    await this.audit(tenantId, actorId, 'EMPLOYEE_SALARY_ASSIGNED', 'EmployeeSalary', created.id, undefined, created);
    return created;
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
                pan: true,
                uan: true,
                bankDetails: true,
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

  async exportBankFileCsv(tenantId: string, id: string): Promise<{ csv: string; period: string }> {
    const run = await this.getRun(tenantId, id);
    const csv = toCsv(
      run.entries.map((entry) => {
        const bank = this.asRecord(entry.employee.bankDetails);
        return {
          employeeCode: entry.employee.employeeCode,
          employeeName: `${entry.employee.firstName} ${entry.employee.lastName}`,
          accountNumber: bank.accountNumber ?? bank.account ?? '',
          ifsc: bank.ifsc ?? bank.ifscCode ?? '',
          bankName: bank.bankName ?? '',
          amount: entry.netPay,
          narration: `Salary ${this.period(run.year, run.month)}`,
        };
      }),
    );
    return { csv, period: this.period(run.year, run.month) };
  }

  async exportPfEcr(tenantId: string, id: string): Promise<{ text: string; period: string }> {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id, tenantId },
      include: {
        entries: {
          include: {
            employee: { select: { firstName: true, lastName: true, employeeCode: true, uan: true } },
          },
          orderBy: { employee: { employeeCode: 'asc' } },
        },
      },
    });
    if (!run) throw new NotFoundException('Payroll run not found');

    const rows = run.entries.map((entry) => {
      const components = this.payrollComponents(entry.components);
      const basic = this.componentAmount(components, 'BASIC');
      const epfWages = Math.min(Math.round(basic), 15000);
      const epsWages = epfWages;
      const edliWages = epfWages;
      const employeePf = Math.round(this.componentAmount(components, 'PF_EMP'));
      const epsContribution = Math.min(Math.round(epsWages * 0.0833), 1250);
      const epfEpsDifference = Math.max(0, employeePf - epsContribution);
      const grossWages = Math.round(entry.grossPay);
      const memberName = `${entry.employee.firstName} ${entry.employee.lastName}`.trim();

      return [
        entry.employee.uan ?? '',
        memberName,
        grossWages,
        epfWages,
        epsWages,
        edliWages,
        employeePf,
        epsContribution,
        epfEpsDifference,
        entry.lopDays,
        0,
      ].join('#');
    });

    return { text: rows.join('\n'), period: this.period(run.year, run.month) };
  }

  async exportForm16DataCsv(tenantId: string, id: string): Promise<{ csv: string; period: string }> {
    const run = await this.getRun(tenantId, id);
    const taxYear = await this.activeTaxYear(tenantId, new Date(Date.UTC(run.year, run.month - 1, 1)), new Date(Date.UTC(run.year, run.month, 0)));
    const snapshots = await this.prisma.taxComputationSnapshot.findMany({
      where: { tenantId, payrollRunId: id },
      orderBy: { createdAt: 'desc' },
    });
    const snapshotByEmployee = new Map(snapshots.map((s) => [s.employeeId, s]));
    const csv = toCsv(
      run.entries.map((entry) => {
        const snapshot = snapshotByEmployee.get(entry.employeeId);
        return {
          employeeCode: entry.employee.employeeCode,
          employeeName: `${entry.employee.firstName} ${entry.employee.lastName}`,
          pan: entry.employee.pan ?? '',
          uan: entry.employee.uan ?? '',
          financialYear: taxYear?.financialYear ?? '',
          assessmentYear: taxYear?.assessmentYear ?? '',
          regime: snapshot?.regime ?? '',
          grossTaxableIncome: snapshot?.grossTaxableIncome ?? entry.grossPay * 12,
          exemptIncome: snapshot?.exemptIncome ?? 0,
          deductibleAmount: snapshot?.deductibleAmount ?? 0,
          netTaxableIncome: snapshot?.netTaxableIncome ?? 0,
          taxBeforeRebate: snapshot?.taxBeforeRebate ?? 0,
          rebate: snapshot?.rebate ?? 0,
          surcharge: snapshot?.surcharge ?? 0,
          cess: snapshot?.cess ?? 0,
          totalAnnualTax: snapshot?.totalAnnualTax ?? 0,
          monthlyTdsDeducted: snapshot?.monthlyTdsDeducted ?? this.componentAmount(this.payrollComponents(entry.components), 'TDS'),
        };
      }),
    );
    return { csv, period: `${taxYear?.financialYear ?? this.period(run.year, run.month)}` };
  }

  async exportQuarterlyTdsCsv(tenantId: string, id: string): Promise<{ csv: string; period: string }> {
    const run = await this.getRun(tenantId, id);
    const taxYear = await this.activeTaxYear(tenantId, new Date(Date.UTC(run.year, run.month - 1, 1)), new Date(Date.UTC(run.year, run.month, 0)));
    const snapshots = await this.prisma.taxComputationSnapshot.findMany({
      where: { tenantId, payrollRunId: id },
      orderBy: { createdAt: 'desc' },
    });
    const snapshotByEmployee = new Map(snapshots.map((s) => [s.employeeId, s]));
    const csv = toCsv(
      run.entries.map((entry) => {
        const components = this.payrollComponents(entry.components);
        const snapshot = snapshotByEmployee.get(entry.employeeId);
        return {
          employeeCode: entry.employee.employeeCode,
          employeeName: `${entry.employee.firstName} ${entry.employee.lastName}`,
          pan: entry.employee.pan ?? '',
          uan: entry.employee.uan ?? '',
          financialYear: taxYear?.financialYear ?? '',
          quarter: this.tdsQuarter(run.month),
          grossSalaryPaid: entry.grossPay,
          taxableIncomeProjected: snapshot?.netTaxableIncome ?? 0,
          tdsDeducted: snapshot?.monthlyTdsDeducted ?? this.componentAmount(components, 'TDS'),
          totalTaxLiability: snapshot?.totalAnnualTax ?? 0,
          regime: snapshot?.regime ?? '',
        };
      }),
    );
    return { csv, period: `${taxYear?.financialYear ?? this.period(run.year, run.month)}-Q${this.tdsQuarter(run.month)}` };
  }

  async exportGlCsv(tenantId: string, id: string): Promise<{ csv: string; period: string }> {
    const run = await this.getRun(tenantId, id);
    const totals = {
      grossPay: 0,
      netPay: 0,
      pf: 0,
      esi: 0,
      pt: 0,
      tds: 0,
      loan: 0,
    };
    for (const entry of run.entries) {
      totals.grossPay += entry.grossPay;
      totals.netPay += entry.netPay;
      const components = this.payrollComponents(entry.components);
      totals.pf += this.componentAmount(components, 'PF_EMP');
      totals.esi += this.componentAmount(components, 'ESI_EMP');
      totals.pt += this.componentAmount(components, 'PT');
      totals.tds += this.componentAmount(components, 'TDS');
      totals.loan += this.componentAmount(components, 'LOAN_EMI');
    }
    const period = this.period(run.year, run.month);
    const rows = [
      { period, accountCode: '6000', accountName: 'Salary expense', debit: round2(totals.grossPay), credit: 0, memo: 'Payroll gross earnings' },
      { period, accountCode: '2100', accountName: 'Employee PF payable', debit: 0, credit: round2(totals.pf), memo: 'Employee provident fund deduction' },
      { period, accountCode: '2110', accountName: 'ESI payable', debit: 0, credit: round2(totals.esi), memo: 'Employee ESI deduction' },
      { period, accountCode: '2120', accountName: 'Professional tax payable', debit: 0, credit: round2(totals.pt), memo: 'Professional tax deduction' },
      { period, accountCode: '2130', accountName: 'TDS payable', debit: 0, credit: round2(totals.tds), memo: 'Income tax TDS deduction' },
      { period, accountCode: '2140', accountName: 'Loan recovery clearing', debit: 0, credit: round2(totals.loan), memo: 'Loan or advance recovery' },
      { period, accountCode: '2200', accountName: 'Salary bank payable', debit: 0, credit: round2(totals.netPay), memo: 'Net salary payable' },
    ].filter((row) => row.debit > 0 || row.credit > 0);
    return { csv: toCsv(rows), period };
  }

  async createRun(tenantId: string, dto: CreateRunDto, actorId?: string) {
    const runType = dto.runType ?? 'MONTHLY';
    const existing = await this.prisma.payrollRun.findFirst({
      where: {
        tenantId,
        month: dto.month,
        year: dto.year,
        runType,
        legalEntityId: dto.legalEntityId ?? null,
        locationId: dto.locationId ?? null,
        payGroup: dto.payGroup ?? null,
        status: { notIn: ['CLOSED'] },
      },
    });
    if (existing) throw new BadRequestException('A matching payroll run already exists for this period');
    const created = await this.prisma.payrollRun.create({
      data: {
        tenantId,
        month: dto.month,
        year: dto.year,
        runType,
        legalEntityId: dto.legalEntityId,
        locationId: dto.locationId,
        payGroup: dto.payGroup,
        notes: dto.notes,
      },
    });
    await this.audit(tenantId, actorId, 'PAYROLL_RUN_CREATED', 'PayrollRun', created.id, undefined, created);
    return created;
  }

  async processRun(tenantId: string, id: string, actorId?: string) {
    const run = await this.prisma.payrollRun.findFirst({ where: { id, tenantId } });
    if (!run) throw new NotFoundException('Payroll run not found');
    if (!['DRAFT', 'PROCESSING'].includes(run.status)) {
      throw new BadRequestException(`Run is ${run.status}; only DRAFT runs can be processed`);
    }

    const daysInMonth = new Date(run.year, run.month, 0).getDate();
    const monthStart = new Date(Date.UTC(run.year, run.month - 1, 1));
    const monthEnd = new Date(Date.UTC(run.year, run.month, 0));

    await this.prisma.payrollRun.update({ where: { id }, data: { status: 'PROCESSING' } });
    const employees = await this.prisma.employee.findMany({
      where: {
        tenantId,
        status: { notIn: ['EXITED', 'INACTIVE', 'CANDIDATE', 'PREBOARDING'] },
        ...(run.legalEntityId && { legalEntityId: run.legalEntityId }),
        ...(run.locationId && { locationId: run.locationId }),
      },
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        status: true,
        joiningDate: true,
        exitDate: true,
        noticePeriodDays: true,
        dateOfBirth: true,
        pan: true,
        taxRegime: true,
        uan: true,
        bankDetails: true,
        legalEntityId: true,
        locationId: true,
        employeeSalaries: {
          where: { effectiveFrom: { lte: monthEnd } },
          orderBy: { effectiveFrom: 'desc' },
          take: 1,
          select: { ctc: true, components: true },
        },
        loans: {
          where: { status: 'ACTIVE' },
          select: { id: true, emiAmount: true, outstanding: true, emiStartMonth: true, emiStartYear: true },
        },
      },
    });

    const attendanceWarnings = await this.attendanceWarningMap(tenantId, monthStart, monthEnd);
    const attendanceLopByEmployee = await this.attendanceLossDayMap(tenantId, monthStart, monthEnd);
    const taxYear = await this.activeTaxYear(tenantId, monthStart, monthEnd);
    const taxContext = taxYear
      ? await this.payrollTaxContext(
          tenantId,
          taxYear.id,
          employees.map((employee) => employee.id),
          run.year,
          run.month,
        )
      : null;

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
    const employeeIds = employees.map((employee) => employee.id);
    const [variableInputs, payrollExpenses, pendingLeave, pendingExpenses, duplicateCodes] = await Promise.all([
      this.prisma.payrollVariableInput.findMany({
        where: {
          tenantId,
          employeeId: { in: employeeIds },
          status: 'APPROVED',
          OR: [
            { payrollRunId: run.id },
            { payrollRunId: null, month: run.month, year: run.year },
          ],
        },
      }),
      this.prisma.expenseClaim.findMany({
        where: {
          tenantId,
          employeeId: { in: employeeIds },
          status: 'APPROVED',
          reimbursementMethod: 'PAYROLL',
        },
      }),
      this.prisma.leaveRequest.groupBy({
        by: ['employeeId'],
        where: {
          tenantId,
          employeeId: { in: employeeIds },
          status: 'PENDING',
          fromDate: { lte: monthEnd },
          toDate: { gte: monthStart },
        },
        _count: true,
      }),
      this.prisma.expenseClaim.groupBy({
        by: ['employeeId'],
        where: { tenantId, employeeId: { in: employeeIds }, status: { in: ['SUBMITTED', 'CLARIFICATION_REQUESTED'] } },
        _count: true,
      }),
      this.prisma.employee.groupBy({
        by: ['employeeCode'],
        where: { tenantId },
        _count: true,
        having: { employeeCode: { _count: { gt: 1 } } },
      }),
    ]);
    const inputsByEmployee = this.groupByEmployee(variableInputs);
    const expensesByEmployee = this.groupByEmployee(payrollExpenses);
    const pendingLeaveByEmployee = new Map(pendingLeave.map((row) => [row.employeeId, row._count]));
    const pendingExpenseByEmployee = new Map(pendingExpenses.map((row) => [row.employeeId, row._count]));
    const duplicateCodeSet = new Set(duplicateCodes.map((row) => row.employeeCode));

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
      if (duplicateCodeSet.has(emp.employeeCode)) errors.push(`Duplicate employee code ${emp.employeeCode} exists in this tenant`);
      if (pendingLeaveByEmployee.get(emp.id)) warnings.push(`${pendingLeaveByEmployee.get(emp.id)} leave request(s) are still pending`);
      if (pendingExpenseByEmployee.get(emp.id)) warnings.push(`${pendingExpenseByEmployee.get(emp.id)} reimbursement claim(s) need review`);
      if (emp.status === 'ON_NOTICE' && run.runType !== 'FULL_AND_FINAL') {
        warnings.push('Employee is on notice; confirm settlement status before regular payroll finalization');
      }
      if (run.runType === 'FULL_AND_FINAL' && !emp.exitDate) {
        warnings.push('Full-and-final run includes employee without exit date');
      }
      const unfinalized = attendanceWarnings.get(emp.id);
      if (unfinalized) warnings.push(`${unfinalized} attendance record(s) are not finalized`);

      const attendanceLop = attendanceLopByEmployee.get(emp.id) ?? 0;
      if (attendanceLop > 0) warnings.push(`${attendanceLop} attendance LOP day(s) from finalized absences/half-days`);
      const lopDays = Math.min((lwpByEmployee.get(emp.id) ?? 0) + attendanceLop, daysInMonth);
      const payableDays = daysInMonth - lopDays;
      const dueLoans = emp.loans.map((loan) => ({
        ...loan,
        due: this.loanDueForMonth(loan, run.month, run.year),
      })).filter((loan) => loan.due > 0);
      const emi = dueLoans.reduce((s, l) => s + l.due, 0);
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
      const result = this.calculateConfiguredMonth({
        ctc: salary.ctc,
        storedComponents: salary.components,
        payableDays,
        daysInMonth,
        monthlyEmiDeduction: emi,
      });
      const manualInputs = inputsByEmployee.get(emp.id) ?? [];
      const expenseInputs = (expensesByEmployee.get(emp.id) ?? []).map((expense) => ({
        id: expense.id,
        type: 'REIMBURSEMENT',
        label: `Expense: ${expense.category}`,
        amount: expense.amount,
        taxable: false,
        source: 'EXPENSE',
      }));
      const inputComponents = this.inputComponents([...manualInputs, ...expenseInputs]);
      const componentsWithInputs = [...result.components, ...inputComponents];
      const currentGross = round2(result.grossPay + inputComponents
        .filter((component) => component.type === 'EARNING')
        .reduce((sum, component) => sum + component.monthly, 0));
      const annualTaxableSalary = this.annualTaxableSalaryFromComponents(salary.ctc, salary.components)
        + manualInputs
          .filter((input) => input.taxable && EARNING_INPUTS.has(input.type))
          .reduce((sum, input) => sum + input.amount, 0);
      const previousGross = taxContext?.previousGrossByEmployee.get(emp.id) ?? 0;
      const taxProfile = taxYear
        ? await this.ensureTaxProfile(tenantId, taxYear.id, emp)
        : null;
      const tds = taxYear && taxContext && taxProfile
        ? await this.calculatePayrollTds({
            tenantId,
            employeeId: emp.id,
            taxYearId: taxYear.id,
            payrollRunId: run.id,
            month: run.month,
            year: run.year,
            annualTaxableSalary,
            currentGross,
            previousGross,
            regime: taxProfile.regime,
            ageCategory: taxProfile.ageCategory,
            taxProfileId: taxProfile.id,
            declarations: taxContext.declarationsByEmployee.get(emp.id) ?? [],
            previousIncome: taxContext.previousIncomeByEmployee.get(emp.id) ?? [],
            tdsDeductedTillDate: taxContext.previousTdsByEmployee.get(emp.id) ?? 0,
            remainingPayrollMonths: this.remainingMonthsInTaxYear(run.year, run.month, taxYear.effectiveTo),
          }).catch((error: Error) => {
            warnings.push(`Versioned TDS rules could not be applied: ${error.message}`);
            return null;
          })
        : null;
      const finalComponents = tds
        ? this.replaceTdsComponent(componentsWithInputs, tds.result.monthlyTds)
        : componentsWithInputs;
      const finalTotalDeductions = this.totalDeductions(finalComponents);
      const finalGross = this.totalEarnings(finalComponents);
      const finalNetPay = Math.round((finalGross - finalTotalDeductions) * 100) / 100;
      if (!taxYear) warnings.push('No active tax year found; payroll used demo TDS fallback');
      if (finalNetPay < 0) errors.push('Net pay is negative after deductions');
      await this.prisma.payrollRunEmployee.upsert({
        where: { payrollRunId_employeeId: { payrollRunId: run.id, employeeId: emp.id } },
        create: {
          payrollRunId: run.id,
          employeeId: emp.id,
          grossPay: finalGross,
          totalDeductions: finalTotalDeductions,
          netPay: finalNetPay,
          lopDays,
          payableDays,
          components: finalComponents as unknown as Prisma.InputJsonValue,
          errors,
          warnings,
        },
        update: {
          grossPay: finalGross,
          totalDeductions: finalTotalDeductions,
          netPay: finalNetPay,
          lopDays,
          payableDays,
          components: finalComponents as unknown as Prisma.InputJsonValue,
          errors,
          warnings,
        },
      });
      if (tds && taxYear && taxProfile) {
        await this.persistPayrollTds({
          tenantId,
          employeeId: emp.id,
          taxProfileId: tds.taxProfileId,
          taxYearId: taxYear.id,
          payrollRunId: run.id,
          month: run.month,
          year: run.year,
          annualTaxableSalary,
          grossIncomeTillDate: previousGross + finalGross,
          remainingPayrollMonths: tds.remainingPayrollMonths,
          calculation: tds.result,
          regime: taxProfile.regime,
          ageCategory: taxProfile.ageCategory,
        });
      }
      errorCount += errors.length;
      warningCount += warnings.length;
      processed++;
    }
    if (payrollExpenses.length) {
      await this.prisma.expenseClaim.updateMany({
        where: { id: { in: payrollExpenses.map((expense) => expense.id) } },
        data: { reimbursedInPayrollRunId: run.id },
      });
    }
    await this.prisma.payrollRun.update({ where: { id }, data: { status: 'REVIEW' } });
    await this.audit(tenantId, actorId, 'PAYROLL_RUN_PROCESSED', 'PayrollRun', id, undefined, {
      processed,
      errors: errorCount,
      warnings: warningCount,
    });
    return { processed, errors: errorCount, warnings: warningCount, status: 'REVIEW' };
  }

  async approveRun(tenantId: string, id: string, userId: string) {
    const run = await this.prisma.payrollRun.findFirst({ where: { id, tenantId } });
    if (!run) throw new NotFoundException('Payroll run not found');
    if (run.status !== 'REVIEW') throw new BadRequestException('Run must be in REVIEW to approve');
    const entries = await this.prisma.payrollRunEmployee.findMany({
      where: { payrollRunId: id },
      select: { errors: true, warnings: true },
    });
    const criticalErrors = entries.reduce((sum, entry) => sum + this.jsonStringArray(entry.errors).length, 0);
    const warnings = entries.reduce((sum, entry) => sum + this.jsonStringArray(entry.warnings).length, 0);
    if (!entries.length) throw new BadRequestException('Process the run before approving payroll');
    if (criticalErrors > 0) {
      throw new BadRequestException(
        `Payroll has ${criticalErrors} critical validation error(s). Fix them before approval.`,
      );
    }
    if (warnings > 0 && !run.warningsOverriddenAt) {
      throw new BadRequestException(
        `Payroll has ${warnings} warning(s). Override warnings with a reason before approval.`,
      );
    }
    const updated = await this.prisma.payrollRun.update({
      where: { id },
      data: { status: 'APPROVED' },
    });
    await this.audit(tenantId, userId, 'PAYROLL_RUN_APPROVED', 'PayrollRun', id, run, updated);
    return updated;
  }

  async overrideRunWarnings(tenantId: string, id: string, userId: string, dto: OverrideWarningsDto) {
    const run = await this.prisma.payrollRun.findFirst({ where: { id, tenantId } });
    if (!run) throw new NotFoundException('Payroll run not found');
    if (run.status !== 'REVIEW') throw new BadRequestException('Warnings can only be overridden during review');
    const updated = await this.prisma.payrollRun.update({
      where: { id },
      data: {
        warningOverrideReason: dto.reason,
        warningsOverriddenAt: new Date(),
        warningsOverriddenById: userId,
      },
    });
    await this.audit(tenantId, userId, 'PAYROLL_WARNINGS_OVERRIDDEN', 'PayrollRun', id, run, updated, dto.reason);
    return updated;
  }

  async lockRun(tenantId: string, id: string, userId: string) {
    const run = await this.prisma.payrollRun.findFirst({ where: { id, tenantId } });
    if (!run) throw new NotFoundException('Payroll run not found');
    if (run.status !== 'APPROVED') throw new BadRequestException('Run must be APPROVED before locking');
    await this.recordLoanInstallmentsForRun(run);
    const updated = await this.prisma.payrollRun.update({
      where: { id },
      data: { status: 'LOCKED', lockedAt: new Date(), lockedById: userId },
    });
    await this.audit(tenantId, userId, 'PAYROLL_RUN_LOCKED', 'PayrollRun', id, run, updated);
    return updated;
  }

  async publishRun(tenantId: string, id: string, userId?: string) {
    const run = await this.getRun(tenantId, id);
    if (run.status !== 'LOCKED') {
      throw new BadRequestException('Run must be LOCKED before publishing');
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
    await this.prisma.expenseClaim.updateMany({
      where: { tenantId, reimbursedInPayrollRunId: run.id, status: 'APPROVED', reimbursementMethod: 'PAYROLL' },
      data: { status: 'PAID', decidedAt: new Date() },
    });
    await this.audit(tenantId, userId, 'PAYROLL_PAYSLIPS_PUBLISHED', 'PayrollRun', id, undefined, {
      published: run.entries.length,
    });
    return { published: run.entries.length };
  }

  async closeRun(tenantId: string, id: string, userId: string) {
    const run = await this.prisma.payrollRun.findFirst({ where: { id, tenantId } });
    if (!run) throw new NotFoundException('Payroll run not found');
    if (run.status !== 'PUBLISHED') throw new BadRequestException('Run must be PUBLISHED before closing');
    const updated = await this.prisma.payrollRun.update({
      where: { id },
      data: { status: 'CLOSED', closedAt: new Date() },
    });
    await this.audit(tenantId, userId, 'PAYROLL_RUN_CLOSED', 'PayrollRun', id, run, updated);
    return updated;
  }

  // ── Payslips ──────────────────────────────────────────────────────────────
  async myPayslips(user: AuthUser) {
    if (!user.employeeId) throw new ForbiddenException('No employee profile linked');
    return this.prisma.payslip.findMany({
      where: { employeeId: user.employeeId, publishedAt: { not: null } },
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

  async listPayrollInputs(tenantId: string, q: PageDto & { month?: number; year?: number }) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const where: Prisma.PayrollVariableInputWhereInput = {
      tenantId,
      ...(q.month && { month: q.month }),
      ...(q.year && { year: q.year }),
      ...(q.search && {
        OR: [
          { label: { contains: q.search, mode: 'insensitive' as const } },
          { type: { contains: q.search, mode: 'insensitive' as const } },
          { employee: { employeeCode: { contains: q.search, mode: 'insensitive' as const } } },
          { employee: { firstName: { contains: q.search, mode: 'insensitive' as const } } },
          { employee: { lastName: { contains: q.search, mode: 'insensitive' as const } } },
        ],
      }),
    };
    const [data, total] = await Promise.all([
      this.prisma.payrollVariableInput.findMany({
        where,
        include: { employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.payrollVariableInput.count({ where }),
    ]);
    return { data, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }

  async createPayrollInput(tenantId: string, actorId: string | undefined, dto: CreatePayrollInputDto) {
    const employee = await this.prisma.employee.findFirst({ where: { id: dto.employeeId, tenantId } });
    if (!employee) throw new NotFoundException('Employee not found');
    if (dto.payrollRunId) {
      const run = await this.prisma.payrollRun.findFirst({ where: { id: dto.payrollRunId, tenantId } });
      if (!run) throw new NotFoundException('Payroll run not found');
      if (!['DRAFT', 'PROCESSING', 'REVIEW'].includes(run.status)) {
        throw new BadRequestException('Inputs can only be added before payroll approval');
      }
    }
    const created = await this.prisma.payrollVariableInput.create({
      data: {
        tenantId,
        employeeId: dto.employeeId,
        payrollRunId: dto.payrollRunId,
        month: dto.month,
        year: dto.year,
        type: dto.type.trim().toUpperCase(),
        label: dto.label,
        amount: dto.amount,
        taxable: dto.taxable ?? true,
        status: dto.status ?? 'APPROVED',
        createdById: actorId,
      },
    });
    await this.audit(tenantId, actorId, 'PAYROLL_INPUT_CREATED', 'PayrollVariableInput', created.id, undefined, created);
    return created;
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

  private async attendanceLossDayMap(tenantId: string, monthStart: Date, monthEnd: Date) {
    const records = await this.prisma.attendanceRecord.findMany({
      where: {
        tenantId,
        date: { gte: monthStart, lte: monthEnd },
        isFinalized: true,
        status: { in: ['ABSENT', 'HALF_DAY'] },
      },
      select: { employeeId: true, status: true },
    });
    const result = new Map<string, number>();
    for (const record of records) {
      result.set(record.employeeId, (result.get(record.employeeId) ?? 0) + (record.status === 'HALF_DAY' ? 0.5 : 1));
    }
    return result;
  }

  private async activeTaxYear(tenantId: string, monthStart: Date, monthEnd: Date) {
    return this.prisma.taxYear.findFirst({
      where: {
        tenantId,
        country: 'IN',
        isActive: true,
        effectiveFrom: { lte: monthEnd },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: monthStart } }],
      },
      orderBy: [{ isDefault: 'desc' }, { effectiveFrom: 'desc' }],
    });
  }

  private async payrollTaxContext(
    tenantId: string,
    taxYearId: string,
    employeeIds: string[],
    year: number,
    month: number,
  ) {
    if (!employeeIds.length) {
      return {
        declarationsByEmployee: new Map<string, Array<{ section: string; approvedAmount: Prisma.Decimal | null; declaredAmount: Prisma.Decimal }>>(),
        previousIncomeByEmployee: new Map<string, Array<{ taxableAmount: Prisma.Decimal; tdsDeducted: Prisma.Decimal }>>(),
        previousTdsByEmployee: new Map<string, number>(),
        previousGrossByEmployee: new Map<string, number>(),
      };
    }

    const previousRunWhere = {
      tenantId,
      OR: [{ year: { lt: year } }, { year, month: { lt: month } }],
    };

    const [declarations, previousIncome, previousTds, previousEntries] = await Promise.all([
      this.prisma.employeeTaxDeclaration.findMany({
        where: { tenantId, taxYearId, employeeId: { in: employeeIds }, status: { in: ['APPROVED', 'LOCKED'] } },
        select: { employeeId: true, section: true, approvedAmount: true, declaredAmount: true },
      }),
      this.prisma.employeePreviousEmployerIncome.findMany({
        where: { tenantId, taxYearId, employeeId: { in: employeeIds } },
        select: { employeeId: true, taxableAmount: true, tdsDeducted: true },
      }),
      this.prisma.employeeMonthlyTds.groupBy({
        by: ['employeeId'],
        where: {
          tenantId,
          taxYearId,
          employeeId: { in: employeeIds },
          OR: [{ year: { lt: year } }, { year, month: { lt: month } }],
        },
        _sum: { monthlyTds: true },
      }),
      this.prisma.payrollRunEmployee.findMany({
        where: { employeeId: { in: employeeIds }, payrollRun: previousRunWhere },
        select: { employeeId: true, grossPay: true },
      }),
    ]);

    return {
      declarationsByEmployee: this.groupByEmployee(declarations),
      previousIncomeByEmployee: this.groupByEmployee(previousIncome),
      previousTdsByEmployee: new Map(previousTds.map((row) => [row.employeeId, Number(row._sum.monthlyTds ?? 0)])),
      previousGrossByEmployee: this.sumByEmployee(previousEntries, 'grossPay'),
    };
  }

  private async ensureTaxProfile(
    tenantId: string,
    taxYearId: string,
    employee: {
      id: string;
      taxRegime: 'OLD' | 'NEW';
      dateOfBirth: Date | null;
      pan: string | null;
    },
  ) {
    const existing = await this.prisma.employeeTaxProfile.findUnique({ where: { employeeId: employee.id } });
    if (existing?.taxYearId === taxYearId) return existing;
    const data = {
      tenantId,
      employeeId: employee.id,
      taxYearId,
      regime: existing?.regime ?? employee.taxRegime,
      ageCategory: existing?.ageCategory ?? this.ageCategory(employee.dateOfBirth),
      panNumber: existing?.panNumber ?? employee.pan,
      dateOfBirth: existing?.dateOfBirth ?? employee.dateOfBirth,
    };
    return existing
      ? this.prisma.employeeTaxProfile.update({ where: { id: existing.id }, data })
      : this.prisma.employeeTaxProfile.create({ data });
  }

  private async calculatePayrollTds(input: {
    tenantId: string;
    employeeId: string;
    taxYearId: string;
    payrollRunId: string;
    month: number;
    year: number;
    annualTaxableSalary: number;
    currentGross: number;
    previousGross: number;
    regime: 'OLD' | 'NEW';
    ageCategory: AgeCategory;
    taxProfileId: string;
    declarations: Array<{ section: string; approvedAmount: Prisma.Decimal | null; declaredAmount: Prisma.Decimal }>;
    previousIncome: Array<{ taxableAmount: Prisma.Decimal; tdsDeducted: Prisma.Decimal }>;
    tdsDeductedTillDate: number;
    remainingPayrollMonths: number;
  }): Promise<{ result: TdsCalculationResult; taxProfileId: string; remainingPayrollMonths: number }> {
    const approvedDeductions = this.approvedDeclarationMap(input.declarations);
    const approvedExemptions = this.approvedDeclarationMap(input.declarations);
    approvedDeductions.STANDARD_DEDUCTION = Number.MAX_SAFE_INTEGER;
    approvedDeductions.PROFESSIONAL_TAX = 2500;
    const previousEmployerIncome = input.previousIncome.reduce((sum, item) => sum + Number(item.taxableAmount), 0);
    const previousEmployerTds = input.previousIncome.reduce((sum, item) => sum + Number(item.tdsDeducted), 0);
    const result = await this.tdsEngine.calculate({
      tenantId: input.tenantId,
      employeeId: input.employeeId,
      taxYearId: input.taxYearId,
      regime: input.regime,
      ageCategory: input.ageCategory,
      annualFixedSalary: input.annualTaxableSalary,
      grossPaidTillDate: input.previousGross + input.currentGross,
      projectedRemainingGross: Math.max(0, input.annualTaxableSalary - input.previousGross - input.currentGross),
      bonus: 0,
      variablePay: 0,
      arrears: 0,
      taxableReimbursements: 0,
      previousEmployerIncome,
      previousEmployerTds,
      tdsDeductedTillDate: input.tdsDeductedTillDate,
      approvedDeductions,
      approvedExemptions,
      currentMonth: input.month,
      currentYear: input.year,
      remainingPayrollMonths: input.remainingPayrollMonths,
    });
    return { result, taxProfileId: input.taxProfileId, remainingPayrollMonths: input.remainingPayrollMonths };
  }

  private async persistPayrollTds(input: {
    tenantId: string;
    employeeId: string;
    taxProfileId: string;
    taxYearId: string;
    payrollRunId: string;
    month: number;
    year: number;
    annualTaxableSalary: number;
    grossIncomeTillDate: number;
    remainingPayrollMonths: number;
    calculation: TdsCalculationResult;
    regime: 'OLD' | 'NEW';
    ageCategory: AgeCategory;
  }) {
    await this.prisma.employeeMonthlyTds.upsert({
      where: {
        tenantId_employeeId_taxYearId_month_year: {
          tenantId: input.tenantId,
          employeeId: input.employeeId,
          taxYearId: input.taxYearId,
          month: input.month,
          year: input.year,
        },
      },
      create: {
        tenantId: input.tenantId,
        employeeId: input.employeeId,
        taxProfileId: input.taxProfileId,
        taxYearId: input.taxYearId,
        payrollRunId: input.payrollRunId,
        month: input.month,
        year: input.year,
        grossIncomeTillDate: input.grossIncomeTillDate,
        projectedAnnualIncome: input.calculation.grossTaxableIncome,
        totalExemptions: input.calculation.exemptIncome,
        totalDeductions: input.calculation.deductibleAmount,
        netTaxableIncome: input.calculation.netTaxableIncome,
        taxBeforeRebate: input.calculation.taxBeforeRebate,
        rebate: input.calculation.rebate,
        surcharge: input.calculation.surcharge,
        cess: input.calculation.cess,
        totalTax: input.calculation.totalAnnualTax,
        tdsDeductedTillDate: input.calculation.tdsAlreadyDeducted,
        remainingTax: input.calculation.remainingTax,
        remainingMonths: input.remainingPayrollMonths,
        monthlyTds: input.calculation.monthlyTds,
        effectiveTaxRate: input.calculation.effectiveTaxRate,
      },
      update: {
        payrollRunId: input.payrollRunId,
        grossIncomeTillDate: input.grossIncomeTillDate,
        projectedAnnualIncome: input.calculation.grossTaxableIncome,
        totalExemptions: input.calculation.exemptIncome,
        totalDeductions: input.calculation.deductibleAmount,
        netTaxableIncome: input.calculation.netTaxableIncome,
        taxBeforeRebate: input.calculation.taxBeforeRebate,
        rebate: input.calculation.rebate,
        surcharge: input.calculation.surcharge,
        cess: input.calculation.cess,
        totalTax: input.calculation.totalAnnualTax,
        tdsDeductedTillDate: input.calculation.tdsAlreadyDeducted,
        remainingTax: input.calculation.remainingTax,
        remainingMonths: input.remainingPayrollMonths,
        monthlyTds: input.calculation.monthlyTds,
        effectiveTaxRate: input.calculation.effectiveTaxRate,
      },
    });

    await this.prisma.taxComputationSnapshot.deleteMany({
      where: { tenantId: input.tenantId, employeeId: input.employeeId, payrollRunId: input.payrollRunId },
    });
    await this.prisma.taxComputationSnapshot.create({
      data: {
        tenantId: input.tenantId,
        employeeId: input.employeeId,
        payrollRunId: input.payrollRunId,
        taxYearId: input.taxYearId,
        regime: input.regime,
        ageCategory: input.ageCategory,
        annualFixedSalary: input.annualTaxableSalary,
        grossTaxableIncome: input.calculation.grossTaxableIncome,
        exemptIncome: input.calculation.exemptIncome,
        deductibleAmount: input.calculation.deductibleAmount,
        netTaxableIncome: input.calculation.netTaxableIncome,
        taxBeforeRebate: input.calculation.taxBeforeRebate,
        rebate: input.calculation.rebate,
        surcharge: input.calculation.surcharge,
        cess: input.calculation.cess,
        totalAnnualTax: input.calculation.totalAnnualTax,
        tdsAlreadyDeducted: input.calculation.tdsAlreadyDeducted,
        remainingTax: input.calculation.remainingTax,
        monthlyTdsDeducted: input.calculation.monthlyTds,
        effectiveTaxRate: input.calculation.effectiveTaxRate,
        breakdownJson: input.calculation.breakdownSteps as unknown as Prisma.InputJsonValue,
        slabsUsed: input.calculation.slabsApplied as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private annualTaxableSalary(ctc: number): number {
    return Math.round(
      this.calculator
        .buildComponents(ctc)
        .filter((component) => component.type === 'EARNING')
        .reduce((sum, component) => sum + component.monthly, 0) * 12,
    );
  }

  private annualTaxableSalaryFromComponents(ctc: number, components: Prisma.JsonValue): number {
    const stored = this.payrollComponents(components);
    if (!stored.length) return this.annualTaxableSalary(ctc);
    return Math.round(
      stored
        .filter((component) => component.type === 'EARNING')
        .reduce((sum, component) => sum + (component.monthly ?? 0) * 12, 0),
    );
  }

  private normalizeStructureComponents(components?: UpsertSalaryStructureDto['components']) {
    const source = components?.length ? components : this.defaultSalaryComponents();
    const allowedTypes = new Set(['EARNING', 'DEDUCTION', 'EMPLOYER_CONTRIBUTION']);
    const allowedCalculationTypes = new Set(['FIXED', 'PERCENTAGE_OF_BASIC', 'PERCENTAGE_OF_GROSS']);
    const normalized = source.map((component, index) => ({
      name: component.name.trim(),
      code: component.code.trim().toUpperCase(),
      type: component.type.trim().toUpperCase(),
      calculationType: component.calculationType.trim().toUpperCase(),
      value: Number(component.value),
      isTaxable: component.isTaxable ?? true,
      isStatutory: component.isStatutory ?? false,
      statutoryType: component.statutoryType?.trim().toUpperCase() || undefined,
      sequence: component.sequence ?? index + 1,
    }));

    const codes = new Set<string>();
    for (const component of normalized) {
      if (!component.name || !component.code) throw new BadRequestException('Every salary component needs a name and code');
      if (codes.has(component.code)) throw new BadRequestException(`Duplicate salary component code: ${component.code}`);
      codes.add(component.code);
      if (!allowedTypes.has(component.type)) throw new BadRequestException(`Unsupported component type: ${component.type}`);
      if (!allowedCalculationTypes.has(component.calculationType)) {
        throw new BadRequestException(`Unsupported calculation type: ${component.calculationType}`);
      }
      if (!Number.isFinite(component.value) || component.value < 0) {
        throw new BadRequestException(`Component ${component.code} must have a non-negative value`);
      }
    }
    if (!normalized.some((component) => component.type === 'EARNING')) {
      throw new BadRequestException('At least one earning component is required');
    }
    const basic = normalized.find((component) => component.code === 'BASIC');
    if (!basic || basic.type !== 'EARNING') {
      throw new BadRequestException('A BASIC earning component is required');
    }
    return normalized;
  }

  private salaryPreview(
    ctc: number,
    components: Array<{ code: string; name: string; type: 'EARNING' | 'DEDUCTION' | 'EMPLOYER_CONTRIBUTION'; monthly: number; annual: number }>,
  ) {
    const monthlyGross = round2(components.filter((component) => component.type === 'EARNING').reduce((sum, component) => sum + component.monthly, 0));
    const monthlyDeductions = round2(components.filter((component) => component.type === 'DEDUCTION').reduce((sum, component) => sum + component.monthly, 0));
    const employerContributions = round2(components.filter((component) => component.type === 'EMPLOYER_CONTRIBUTION').reduce((sum, component) => sum + component.monthly, 0));
    return {
      ctc,
      monthlyCtc: round2(ctc / 12),
      monthlyGross,
      monthlyDeductions,
      monthlyNet: round2(monthlyGross - monthlyDeductions),
      employerContributions,
      components,
    };
  }

  private buildComponentsForStructure(
    ctc: number,
    components: Array<{
      name: string;
      code: string;
      type: string;
      calculationType: string;
      value: number;
      isTaxable: boolean;
      isStatutory: boolean;
      statutoryType: string | null;
      sequence: number;
    }>,
  ) {
    if (!components.length) return this.calculator.buildComponents(ctc);
    const monthlyCtc = ctc / 12;
    let gross = monthlyCtc;
    for (let i = 0; i < 3; i++) {
      const basic = this.configuredComponentAmount(components.find((c) => c.code === 'BASIC'), gross, gross);
      const employerContribution = components
        .filter((c) => c.type === 'EMPLOYER_CONTRIBUTION')
        .reduce((sum, component) => sum + this.configuredComponentAmount(component, gross, basic), 0);
      gross = monthlyCtc - employerContribution;
    }
    const basic = this.configuredComponentAmount(components.find((c) => c.code === 'BASIC'), gross, gross);
    const fixedZeroBalancers = components.filter((c) => c.type === 'EARNING' && c.calculationType === 'FIXED' && c.value === 0);
    const nonBalancingEarnings = components.filter((c) => c.type === 'EARNING' && !fixedZeroBalancers.includes(c));
    const nonBalancingTotal = nonBalancingEarnings.reduce(
      (sum, component) => sum + this.configuredComponentAmount(component, gross, basic),
      0,
    );
    const balancingAmount = fixedZeroBalancers.length ? Math.max(0, gross - nonBalancingTotal) / fixedZeroBalancers.length : 0;

    return components
      .filter((component) => component.code !== 'TDS')
      .map((component) => {
        const monthly = fixedZeroBalancers.includes(component)
          ? balancingAmount
          : this.configuredComponentAmount(component, gross, basic);
        return {
          code: component.code,
          name: component.name,
          type: component.type as 'EARNING' | 'DEDUCTION' | 'EMPLOYER_CONTRIBUTION',
          monthly: round2(monthly),
          annual: round2(monthly * 12),
          taxable: component.isTaxable,
          statutoryType: component.statutoryType,
        };
      })
      .filter((component) => component.monthly > 0 || component.type !== 'DEDUCTION');
  }

  private configuredComponentAmount(
    component: { calculationType: string; value: number; statutoryType?: string | null } | undefined,
    gross: number,
    basic: number,
  ): number {
    if (!component) return 0;
    if (component.statutoryType === 'PF') return Math.min(basic, 15000) * (component.value / 100);
    if (component.statutoryType === 'ESI' && gross > 21000) return 0;
    if (component.calculationType === 'PERCENTAGE_OF_BASIC') return basic * (component.value / 100);
    if (component.calculationType === 'PERCENTAGE_OF_GROSS') return gross * (component.value / 100);
    return component.value;
  }

  private calculateConfiguredMonth(input: {
    ctc: number;
    storedComponents: Prisma.JsonValue;
    payableDays: number;
    daysInMonth: number;
    monthlyEmiDeduction?: number;
  }) {
    const stored = this.payrollComponents(input.storedComponents);
    if (!stored.length) return this.calculator.calculateMonth(input);
    const proration = input.daysInMonth > 0 ? input.payableDays / input.daysInMonth : 1;
    const earnings = stored
      .filter((component) => component.type === 'EARNING')
      .map((component) => ({
        code: component.code ?? '',
        name: component.name ?? component.code ?? '',
        type: 'EARNING' as const,
        monthly: round2((component.monthly ?? 0) * proration),
        annual: round2((component.monthly ?? 0) * 12),
      }));
    const grossPay = round2(earnings.reduce((sum, component) => sum + component.monthly, 0));
    const basic = earnings.find((component) => component.code === 'BASIC')?.monthly ?? 0;
    const deductions = stored
      .filter((component) => component.type === 'DEDUCTION' && component.code !== 'TDS')
      .map((component) => {
        let monthly = component.monthly ?? 0;
        if (component.code === 'PF_EMP') monthly = Math.min(basic, 15000) * 0.12;
        else if (component.code === 'ESI_EMP') monthly = grossPay <= 21000 ? grossPay * 0.0075 : 0;
        else if (component.code === 'PT') monthly = grossPay >= 15000 ? 200 : grossPay >= 10000 ? 150 : 0;
        else if (component.code === 'LWF') monthly = grossPay > 0 ? monthly : 0;
        else monthly *= proration;
        return {
          code: component.code ?? '',
          name: component.name ?? component.code ?? '',
          type: 'DEDUCTION' as const,
          monthly: round2(monthly),
          annual: round2(monthly * 12),
        };
      })
      .filter((component) => component.monthly > 0);
    if ((input.monthlyEmiDeduction ?? 0) > 0) {
      deductions.push({
        code: 'LOAN_EMI',
        name: 'Loan EMI',
        type: 'DEDUCTION',
        monthly: round2(input.monthlyEmiDeduction ?? 0),
        annual: 0,
      });
    }
    const employer = stored
      .filter((component) => component.type === 'EMPLOYER_CONTRIBUTION')
      .map((component) => ({
        code: component.code ?? '',
        name: component.name ?? component.code ?? '',
        type: 'EMPLOYER_CONTRIBUTION' as const,
        monthly: round2((component.monthly ?? 0) * proration),
        annual: round2((component.monthly ?? 0) * 12),
      }));
    const totalDeductions = round2(deductions.reduce((sum, component) => sum + component.monthly, 0));
    return {
      grossPay,
      totalDeductions,
      netPay: round2(grossPay - totalDeductions),
      components: [...earnings, ...employer, ...deductions],
    };
  }

  private defaultSalaryComponents() {
    return [
      { name: 'Basic', code: 'BASIC', type: 'EARNING', calculationType: 'PERCENTAGE_OF_GROSS', value: 40, isTaxable: true, sequence: 1 },
      { name: 'HRA', code: 'HRA', type: 'EARNING', calculationType: 'PERCENTAGE_OF_BASIC', value: 50, isTaxable: false, sequence: 2 },
      { name: 'Special Allowance', code: 'SA', type: 'EARNING', calculationType: 'FIXED', value: 0, isTaxable: true, sequence: 3 },
      { name: 'Provident Fund (Employee)', code: 'PF_EMP', type: 'DEDUCTION', calculationType: 'PERCENTAGE_OF_BASIC', value: 12, isTaxable: false, isStatutory: true, statutoryType: 'PF', sequence: 10 },
      { name: 'Provident Fund (Employer)', code: 'PF_EMP_R', type: 'EMPLOYER_CONTRIBUTION', calculationType: 'PERCENTAGE_OF_BASIC', value: 12, isTaxable: false, isStatutory: true, statutoryType: 'PF', sequence: 11 },
      { name: 'ESI (Employee)', code: 'ESI_EMP', type: 'DEDUCTION', calculationType: 'PERCENTAGE_OF_GROSS', value: 0.75, isTaxable: false, isStatutory: true, statutoryType: 'ESI', sequence: 12 },
      { name: 'Professional Tax', code: 'PT', type: 'DEDUCTION', calculationType: 'FIXED', value: 200, isTaxable: false, isStatutory: true, statutoryType: 'PT', sequence: 13 },
      { name: 'Labour Welfare Fund', code: 'LWF', type: 'DEDUCTION', calculationType: 'FIXED', value: 10, isTaxable: false, isStatutory: true, statutoryType: 'LWF', sequence: 14 },
      { name: 'Gratuity Accrual', code: 'GRATUITY', type: 'EMPLOYER_CONTRIBUTION', calculationType: 'PERCENTAGE_OF_BASIC', value: 4.81, isTaxable: false, isStatutory: true, statutoryType: 'GRATUITY', sequence: 15 },
      { name: 'TDS', code: 'TDS', type: 'DEDUCTION', calculationType: 'FIXED', value: 0, isTaxable: false, isStatutory: true, statutoryType: 'TDS', sequence: 16 },
    ];
  }

  private replaceTdsComponent(
    components: Array<{ code: string; name: string; type: 'EARNING' | 'DEDUCTION' | 'EMPLOYER_CONTRIBUTION'; monthly: number; annual: number }>,
    monthlyTds: number,
  ) {
    const next = components.filter((component) => component.code !== 'TDS');
    if (monthlyTds > 0) {
      next.push({
        code: 'TDS',
        name: 'TDS',
        type: 'DEDUCTION',
        monthly: Math.round(monthlyTds * 100) / 100,
        annual: Math.round(monthlyTds * 12 * 100) / 100,
      });
    }
    return next;
  }

  private totalDeductions(components: Array<{ type?: string; monthly?: number }>): number {
    return Math.round(
      components
        .filter((component) => component.type === 'DEDUCTION')
        .reduce((sum, component) => sum + (component.monthly ?? 0), 0) * 100,
    ) / 100;
  }

  private totalEarnings(components: Array<{ type?: string; monthly?: number }>): number {
    return Math.round(
      components
        .filter((component) => component.type === 'EARNING')
        .reduce((sum, component) => sum + (component.monthly ?? 0), 0) * 100,
    ) / 100;
  }

  private inputComponents(inputs: Array<{ type: string; label: string; amount: number; taxable?: boolean; source?: string }>) {
    return inputs
      .filter((input) => input.amount !== 0)
      .map((input) => {
        const type = input.type.trim().toUpperCase();
        const isEarning = EARNING_INPUTS.has(type);
        return {
          code: `INPUT_${type}`,
          name: input.label,
          type: isEarning ? 'EARNING' as const : 'DEDUCTION' as const,
          monthly: round2(Math.abs(input.amount)),
          annual: 0,
          taxable: input.taxable ?? true,
          source: input.source ?? 'MANUAL',
        };
      });
  }

  private payrollComponents(value: Prisma.JsonValue): Array<{ code?: string; monthly?: number; name?: string; type?: string }> {
    return Array.isArray(value)
      ? (value as Array<{ code?: string; monthly?: number; name?: string; type?: string }>)
      : [];
  }

  private componentAmount(
    components: Array<{ code?: string; monthly?: number }>,
    code: string,
  ): number {
    return components.find((component) => component.code === code)?.monthly ?? 0;
  }

  private asRecord(value: Prisma.JsonValue | null | undefined): Record<string, string> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).map(([key, raw]) => [key, raw == null ? '' : String(raw)]),
    );
  }

  private loanDueForMonth(
    loan: { emiAmount: number; outstanding: number; emiStartMonth: number; emiStartYear: number },
    month: number,
    year: number,
  ): number {
    const currentIndex = year * 12 + month;
    const startIndex = loan.emiStartYear * 12 + loan.emiStartMonth;
    if (currentIndex < startIndex || loan.outstanding <= 0) return 0;
    return round2(Math.min(loan.emiAmount, loan.outstanding));
  }

  private loanSchedule(loan: {
    id: string;
    tenantId: string;
    employeeId: string;
    amount: number;
    emiAmount: number;
    emiStartMonth: number;
    emiStartYear: number;
    totalInstallments: number;
  }) {
    const rows: Prisma.LoanInstallmentCreateManyInput[] = [];
    let balance = loan.amount;
    for (let i = 0; i < loan.totalInstallments && balance > 0; i++) {
      const monthIndex = (loan.emiStartYear * 12 + loan.emiStartMonth - 1) + i;
      const year = Math.floor(monthIndex / 12);
      const month = (monthIndex % 12) + 1;
      const amount = round2(Math.min(loan.emiAmount, balance));
      const closingBalance = round2(Math.max(0, balance - amount));
      rows.push({
        tenantId: loan.tenantId,
        loanId: loan.id,
        employeeId: loan.employeeId,
        month,
        year,
        amount,
        principalAmount: amount,
        openingBalance: round2(balance),
        closingBalance,
        status: 'SCHEDULED',
      });
      balance = closingBalance;
    }
    return rows;
  }

  private async recordLoanInstallmentsForRun(run: { id: string; tenantId: string; month: number; year: number }) {
    const entries = await this.prisma.payrollRunEmployee.findMany({
      where: { payrollRunId: run.id },
      select: { employeeId: true, components: true },
    });
    for (const entry of entries) {
      if (this.componentAmount(this.payrollComponents(entry.components), 'LOAN_EMI') <= 0) continue;
      const loans = await this.prisma.loan.findMany({
        where: { tenantId: run.tenantId, employeeId: entry.employeeId, status: 'ACTIVE' },
      });
      for (const loan of loans) {
        const amount = this.loanDueForMonth(loan, run.month, run.year);
        if (amount <= 0) continue;
        const openingBalance = loan.outstanding;
        const closingBalance = round2(Math.max(0, openingBalance - amount));
        await this.prisma.loanInstallment.upsert({
          where: { loanId_month_year: { loanId: loan.id, month: run.month, year: run.year } },
          create: {
            tenantId: run.tenantId,
            loanId: loan.id,
            employeeId: loan.employeeId,
            payrollRunId: run.id,
            month: run.month,
            year: run.year,
            amount,
            principalAmount: amount,
            openingBalance,
            closingBalance,
            status: 'DEDUCTED',
            deductedAt: new Date(),
          },
          update: {
            payrollRunId: run.id,
            amount,
            principalAmount: amount,
            openingBalance,
            closingBalance,
            status: 'DEDUCTED',
            deductedAt: new Date(),
          },
        });
        await this.prisma.loan.update({
          where: { id: loan.id },
          data: {
            outstanding: closingBalance,
            paidInstallments: { increment: closingBalance < openingBalance ? 1 : 0 },
            ...(closingBalance <= 0 && { status: 'CLOSED' }),
          },
        });
      }
    }
  }

  private groupByEmployee<T extends { employeeId: string }>(rows: T[]): Map<string, T[]> {
    const grouped = new Map<string, T[]>();
    for (const row of rows) {
      grouped.set(row.employeeId, [...(grouped.get(row.employeeId) ?? []), row]);
    }
    return grouped;
  }

  private sumByEmployee<T extends { employeeId: string }>(rows: T[], key: keyof T): Map<string, number> {
    const sums = new Map<string, number>();
    for (const row of rows) {
      sums.set(row.employeeId, (sums.get(row.employeeId) ?? 0) + Number(row[key] ?? 0));
    }
    return sums;
  }

  private approvedDeclarationMap(
    declarations: Array<{ section: string; approvedAmount: Prisma.Decimal | null; declaredAmount: Prisma.Decimal }>,
  ): Record<string, number> {
    return declarations.reduce<Record<string, number>>((acc, declaration) => {
      acc[declaration.section] = Number(declaration.approvedAmount ?? declaration.declaredAmount);
      return acc;
    }, {});
  }

  private ageCategory(dateOfBirth: Date | null): AgeCategory {
    if (!dateOfBirth) return 'BELOW_60';
    const age = Math.floor((Date.now() - dateOfBirth.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    if (age >= 80) return 'SUPER_SENIOR_80_PLUS';
    if (age >= 60) return 'SENIOR_60_80';
    return 'BELOW_60';
  }

  private remainingMonthsInTaxYear(year: number, month: number, effectiveTo: Date | null): number {
    const end = effectiveTo ?? new Date(Date.UTC(month >= 4 ? year + 1 : year, 2, 31));
    return Math.max(1, (end.getUTCFullYear() - year) * 12 + (end.getUTCMonth() + 1 - month) + 1);
  }

  private period(year: number, month: number): string {
    return `${year}-${String(month).padStart(2, '0')}`;
  }

  private tdsQuarter(month: number): number {
    if (month >= 4 && month <= 6) return 1;
    if (month >= 7 && month <= 9) return 2;
    if (month >= 10 && month <= 12) return 3;
    return 4;
  }

  private jsonStringArray(value: Prisma.JsonValue | null | undefined): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  }

  private async audit(
    tenantId: string,
    actorId: string | undefined,
    action: string,
    objectType: string,
    objectId?: string,
    oldValue?: unknown,
    newValue?: unknown,
    reason?: string,
  ) {
    if (!('auditLog' in this.prisma) || !this.prisma.auditLog?.create) return;
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId,
        action,
        objectType,
        objectId,
        oldValue: oldValue == null ? undefined : oldValue as Prisma.InputJsonValue,
        newValue: newValue == null ? undefined : newValue as Prisma.InputJsonValue,
        reason,
      },
    }).catch(() => undefined);
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

  async exportExpensesCsv(tenantId: string, q: ListExpensesDto): Promise<{ csv: string; period: string }> {
    const where: Prisma.ExpenseClaimWhereInput = {
      tenantId,
      ...(q.status && { status: q.status }),
    };
    const rows = await this.prisma.expenseClaim.findMany({
      where,
      include: {
        employee: { select: { employeeCode: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const csv = toCsv(rows.map((row) => ({
      employeeCode: row.employee.employeeCode,
      employeeName: `${row.employee.firstName} ${row.employee.lastName}`,
      category: row.category,
      amount: row.amount,
      currency: row.currency,
      reimbursementMethod: row.reimbursementMethod,
      status: row.status,
      receiptKey: row.receiptKey ?? '',
      clarificationNote: row.clarificationNote ?? '',
      reimbursedInPayrollRunId: row.reimbursedInPayrollRunId ?? '',
      createdAt: row.createdAt.toISOString(),
    })));
    return { csv, period: new Date().toISOString().slice(0, 10) };
  }

  async createExpense(user: AuthUser, dto: CreateExpenseDto) {
    if (!user.employeeId) throw new ForbiddenException('No employee profile linked');
    const category = dto.category.trim().toUpperCase().replace(/\s+/g, '_');
    const limit = EXPENSE_POLICY_LIMITS[category];
    if (limit != null && dto.amount > limit) {
      throw new BadRequestException(
        `${category.replace(/_/g, ' ')} claims are capped at ${limit}. Split the claim or request a finance exception.`,
      );
    }
    const created = await this.prisma.expenseClaim.create({
      data: {
        ...dto,
        category,
        tenantId: user.tenantId,
        employeeId: user.employeeId,
        status: 'SUBMITTED',
        reimbursementMethod: dto.reimbursementMethod ?? 'PAYROLL',
        ocrData: dto.receiptKey ? { status: 'READY_FOR_EXTRACTION', receiptKey: dto.receiptKey } : undefined,
      },
    });
    await this.audit(user.tenantId, user.userId, 'EXPENSE_SUBMITTED', 'ExpenseClaim', created.id, undefined, created);
    return created;
  }

  async decideExpense(
    tenantId: string,
    id: string,
    status: 'APPROVED' | 'REJECTED' | 'PAID' | 'CLARIFICATION_REQUESTED',
    actorId?: string,
    dto?: ExpenseDecisionDto,
  ) {
    const claim = await this.prisma.expenseClaim.findFirst({ where: { id, tenantId } });
    if (!claim) throw new NotFoundException('Expense claim not found');
    if (status === 'PAID' && claim.reimbursementMethod === 'PAYROLL' && !claim.reimbursedInPayrollRunId) {
      throw new BadRequestException('Payroll reimbursement claims are marked paid when the linked payroll run is published');
    }
    const updated = await this.prisma.expenseClaim.update({
      where: { id },
      data: {
        status,
        clarificationNote: dto?.note,
        decidedById: actorId,
        decidedAt: new Date(),
      },
    });
    await this.audit(tenantId, actorId, `EXPENSE_${status}`, 'ExpenseClaim', id, claim, updated, dto?.note);
    return updated;
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
    const created = await this.prisma.loan.create({
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
    const schedule = this.loanSchedule(created);
    if (schedule.length) {
      await this.prisma.loanInstallment.createMany({
        data: schedule,
        skipDuplicates: true,
      });
    }
    await this.audit(tenantId, undefined, 'LOAN_CREATED', 'Loan', created.id, undefined, created);
    return created;
  }

  async closeLoan(tenantId: string, id: string, actorId?: string) {
    const loan = await this.prisma.loan.findFirst({ where: { id, tenantId } });
    if (!loan) throw new NotFoundException('Loan not found');
    const updated = await this.prisma.loan.update({
      where: { id },
      data: { status: 'CLOSED', outstanding: 0 },
    });
    await this.audit(tenantId, actorId, 'LOAN_CLOSED', 'Loan', id, loan, updated);
    return updated;
  }

  async waiveLoan(tenantId: string, id: string, actorId: string, dto: WaiveLoanDto) {
    const loan = await this.prisma.loan.findFirst({ where: { id, tenantId } });
    if (!loan) throw new NotFoundException('Loan not found');
    const updated = await this.prisma.loan.update({
      where: { id },
      data: { status: 'WAIVED', outstanding: 0 },
    });
    await this.prisma.loanInstallment.create({
      data: {
        tenantId,
        loanId: loan.id,
        employeeId: loan.employeeId,
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
        amount: loan.outstanding,
        principalAmount: loan.outstanding,
        openingBalance: loan.outstanding,
        closingBalance: 0,
        status: 'WAIVED',
      },
    }).catch(() => undefined);
    await this.audit(tenantId, actorId, 'LOAN_WAIVED', 'Loan', id, loan, updated, dto.reason);
    return updated;
  }

  async listLoanInstallments(tenantId: string, loanId: string) {
    const loan = await this.prisma.loan.findFirst({ where: { id: loanId, tenantId } });
    if (!loan) throw new NotFoundException('Loan not found');
    return this.prisma.loanInstallment.findMany({
      where: { loanId },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });
  }
}
