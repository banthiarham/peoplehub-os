import { Body, Controller, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthUser } from '../../common/types/auth-user';
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
import { PayrollService } from './payroll.service';

const PAYROLL_ROLES = ['Super Admin', 'Payroll Admin', 'HR Admin'];

@ApiTags('Payroll')
@ApiBearerAuth()
@Controller('payroll')
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  @Get('structures')
  listStructures(@CurrentUser() user: AuthUser) {
    return this.payroll.listStructures(user.tenantId);
  }

  @Get('salary-structures')
  listSalaryStructures(@CurrentUser() user: AuthUser) {
    return this.payroll.listStructures(user.tenantId);
  }

  @Post('structures')
  @Roles(...PAYROLL_ROLES)
  createStructure(@CurrentUser() user: AuthUser, @Body() dto: UpsertSalaryStructureDto) {
    return this.payroll.createStructure(user.tenantId, user.userId, dto);
  }

  @Post('salary-structures')
  @Roles(...PAYROLL_ROLES)
  createSalaryStructure(@CurrentUser() user: AuthUser, @Body() dto: UpsertSalaryStructureDto) {
    return this.payroll.createStructure(user.tenantId, user.userId, dto);
  }

  @Patch('structures/:id')
  @Roles(...PAYROLL_ROLES)
  updateStructure(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpsertSalaryStructureDto) {
    return this.payroll.updateStructure(user.tenantId, id, user.userId, dto);
  }

  @Patch('salary-structures/:id')
  @Roles(...PAYROLL_ROLES)
  updateSalaryStructure(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpsertSalaryStructureDto) {
    return this.payroll.updateStructure(user.tenantId, id, user.userId, dto);
  }

  @Post('structures/:id/preview')
  @Roles(...PAYROLL_ROLES)
  previewStructure(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: PreviewSalaryStructureDto) {
    return this.payroll.previewStructure(user.tenantId, id, dto);
  }

  @Post('salary-structures/:id/preview')
  @Roles(...PAYROLL_ROLES)
  previewSalaryStructure(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: PreviewSalaryStructureDto) {
    return this.payroll.previewStructure(user.tenantId, id, dto);
  }

  @Get('salaries')
  @Roles(...PAYROLL_ROLES)
  listSalaries(@CurrentUser() user: AuthUser, @Query() q: PageDto) {
    return this.payroll.listSalaries(user.tenantId, q);
  }

  @Get('salaries/:employeeId')
  @Roles(...PAYROLL_ROLES)
  salaryHistory(@CurrentUser() user: AuthUser, @Param('employeeId') employeeId: string) {
    return this.payroll.salaryHistory(user.tenantId, employeeId);
  }

  @Post('salaries')
  @Roles(...PAYROLL_ROLES)
  @ApiOperation({ summary: 'Assign or revise an employee salary' })
  assignSalary(@CurrentUser() user: AuthUser, @Body() dto: AssignSalaryDto) {
    return this.payroll.assignSalary(user.tenantId, dto, user.userId);
  }

  @Get('runs')
  @Roles(...PAYROLL_ROLES)
  listRuns(@CurrentUser() user: AuthUser) {
    return this.payroll.listRuns(user.tenantId);
  }

  @Get('runs/:id')
  @Roles(...PAYROLL_ROLES)
  getRun(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payroll.getRun(user.tenantId, id);
  }

  @Get('runs/:id/export')
  @Roles(...PAYROLL_ROLES)
  @ApiOperation({ summary: 'Download the payroll register for a run as CSV' })
  async exportRun(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const { csv, period } = await this.payroll.exportRunCsv(user.tenantId, id);
    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.header('Content-Disposition', `attachment; filename="payroll-register-${period}.csv"`);
    return csv;
  }

  @Get('runs/:id/bank-file')
  @Roles(...PAYROLL_ROLES)
  @ApiOperation({ summary: 'Download bank payout file for a payroll run' })
  async exportBankFile(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const { csv, period } = await this.payroll.exportBankFileCsv(user.tenantId, id);
    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.header('Content-Disposition', `attachment; filename="bank-file-${period}.csv"`);
    return csv;
  }

  @Get('runs/:id/statutory/pf-ecr')
  @Roles(...PAYROLL_ROLES)
  @ApiOperation({ summary: 'Download PF ECR-ready file for a payroll run' })
  async exportPfEcr(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const { text, period } = await this.payroll.exportPfEcr(user.tenantId, id);
    res.header('Content-Type', 'text/plain; charset=utf-8');
    res.header('Content-Disposition', `attachment; filename="pf-ecr-${period}.txt"`);
    return text;
  }

  @Get('runs/:id/statutory/form-16')
  @Roles(...PAYROLL_ROLES)
  @ApiOperation({ summary: 'Download Form 16 data extract for a payroll run' })
  async exportForm16Data(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const { csv, period } = await this.payroll.exportForm16DataCsv(user.tenantId, id);
    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.header('Content-Disposition', `attachment; filename="form-16-data-${period}.csv"`);
    return csv;
  }

  @Get('runs/:id/statutory/24q')
  @Roles(...PAYROLL_ROLES)
  @ApiOperation({ summary: 'Download 24Q TDS data extract for a payroll run' })
  async export24QData(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const { csv, period } = await this.payroll.exportQuarterlyTdsCsv(user.tenantId, id);
    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.header('Content-Disposition', `attachment; filename="24q-tds-data-${period}.csv"`);
    return csv;
  }

  @Get('runs/:id/accounting/gl')
  @Roles(...PAYROLL_ROLES)
  @ApiOperation({ summary: 'Download accounting GL export for a payroll run' })
  async exportGl(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const { csv, period } = await this.payroll.exportGlCsv(user.tenantId, id);
    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.header('Content-Disposition', `attachment; filename="payroll-gl-${period}.csv"`);
    return csv;
  }

  @Post('runs')
  @Roles(...PAYROLL_ROLES)
  createRun(@CurrentUser() user: AuthUser, @Body() dto: CreateRunDto) {
    return this.payroll.createRun(user.tenantId, dto, user.userId);
  }

  @Post('runs/:id/process')
  @Roles(...PAYROLL_ROLES)
  @ApiOperation({ summary: 'Compute gross/deductions/net for every active employee' })
  processRun(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payroll.processRun(user.tenantId, id, user.userId);
  }

  @Post('runs/:id/override-warnings')
  @Roles(...PAYROLL_ROLES)
  @ApiOperation({ summary: 'Override payroll warnings with a required review reason' })
  overrideWarnings(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: OverrideWarningsDto) {
    return this.payroll.overrideRunWarnings(user.tenantId, id, user.userId, dto);
  }

  @Patch('runs/:id/approve')
  @Roles(...PAYROLL_ROLES)
  approveRun(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payroll.approveRun(user.tenantId, id, user.userId);
  }

  @Patch('runs/:id/lock')
  @Roles(...PAYROLL_ROLES)
  lockRun(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payroll.lockRun(user.tenantId, id, user.userId);
  }

  @Post('runs/:id/publish')
  @Roles(...PAYROLL_ROLES)
  @ApiOperation({ summary: 'Publish payslips to employees' })
  publishRun(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payroll.publishRun(user.tenantId, id, user.userId);
  }

  @Patch('runs/:id/close')
  @Roles(...PAYROLL_ROLES)
  closeRun(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payroll.closeRun(user.tenantId, id, user.userId);
  }

  @Get('payslips/me')
  myPayslips(@CurrentUser() user: AuthUser) {
    return this.payroll.myPayslips(user);
  }

  @Get('payslips/:id')
  getPayslip(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payroll.getPayslip(user.tenantId, id);
  }

  @Get('stats')
  stats(@CurrentUser() user: AuthUser) {
    return this.payroll.stats(user.tenantId);
  }

  @Get('inputs')
  @Roles(...PAYROLL_ROLES)
  listInputs(@CurrentUser() user: AuthUser, @Query() q: PageDto & { month?: number; year?: number }) {
    return this.payroll.listPayrollInputs(user.tenantId, q);
  }

  @Post('inputs')
  @Roles(...PAYROLL_ROLES)
  createInput(@CurrentUser() user: AuthUser, @Body() dto: CreatePayrollInputDto) {
    return this.payroll.createPayrollInput(user.tenantId, user.userId, dto);
  }

  @Get('expenses')
  listExpenses(@CurrentUser() user: AuthUser, @Query() q: ListExpensesDto) {
    return this.payroll.listExpenses(user.tenantId, q);
  }

  @Get('expenses/export')
  @Roles(...PAYROLL_ROLES)
  async exportExpenses(
    @CurrentUser() user: AuthUser,
    @Query() q: ListExpensesDto,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const { csv, period } = await this.payroll.exportExpensesCsv(user.tenantId, q);
    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.header('Content-Disposition', `attachment; filename="expense-report-${period}.csv"`);
    return csv;
  }

  @Post('expenses')
  createExpense(@CurrentUser() user: AuthUser, @Body() dto: CreateExpenseDto) {
    return this.payroll.createExpense(user, dto);
  }

  @Patch('expenses/:id/approve')
  @Roles(...PAYROLL_ROLES, 'Manager')
  approveExpense(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ExpenseDecisionDto) {
    return this.payroll.decideExpense(user.tenantId, id, 'APPROVED', user.userId, dto);
  }

  @Patch('expenses/:id/reject')
  @Roles(...PAYROLL_ROLES, 'Manager')
  rejectExpense(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ExpenseDecisionDto) {
    return this.payroll.decideExpense(user.tenantId, id, 'REJECTED', user.userId, dto);
  }

  @Patch('expenses/:id/clarify')
  @Roles(...PAYROLL_ROLES, 'Manager')
  clarifyExpense(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ExpenseDecisionDto) {
    return this.payroll.decideExpense(user.tenantId, id, 'CLARIFICATION_REQUESTED', user.userId, dto);
  }

  @Patch('expenses/:id/reimburse')
  @Roles(...PAYROLL_ROLES)
  reimburseExpense(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ExpenseDecisionDto) {
    return this.payroll.decideExpense(user.tenantId, id, 'PAID', user.userId, dto);
  }

  @Get('loans')
  @Roles(...PAYROLL_ROLES)
  listLoans(@CurrentUser() user: AuthUser) {
    return this.payroll.listLoans(user.tenantId);
  }

  @Post('loans')
  @Roles(...PAYROLL_ROLES)
  createLoan(@CurrentUser() user: AuthUser, @Body() dto: CreateLoanDto) {
    return this.payroll.createLoan(user.tenantId, dto);
  }

  @Patch('loans/:id/close')
  @Roles(...PAYROLL_ROLES)
  closeLoan(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payroll.closeLoan(user.tenantId, id, user.userId);
  }

  @Patch('loans/:id/waive')
  @Roles(...PAYROLL_ROLES)
  waiveLoan(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: WaiveLoanDto) {
    return this.payroll.waiveLoan(user.tenantId, id, user.userId, dto);
  }

  @Get('loans/:id/installments')
  @Roles(...PAYROLL_ROLES)
  loanInstallments(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payroll.listLoanInstallments(user.tenantId, id);
  }
}
