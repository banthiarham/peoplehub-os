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
  CreateRunDto,
  ListExpensesDto,
  PageDto,
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
    return this.payroll.assignSalary(user.tenantId, dto);
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

  @Post('runs')
  @Roles(...PAYROLL_ROLES)
  createRun(@CurrentUser() user: AuthUser, @Body() dto: CreateRunDto) {
    return this.payroll.createRun(user.tenantId, dto);
  }

  @Post('runs/:id/process')
  @Roles(...PAYROLL_ROLES)
  @ApiOperation({ summary: 'Compute gross/deductions/net for every active employee' })
  processRun(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payroll.processRun(user.tenantId, id);
  }

  @Patch('runs/:id/approve')
  @Roles(...PAYROLL_ROLES)
  approveRun(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payroll.approveRun(user.tenantId, id, user.userId);
  }

  @Post('runs/:id/publish')
  @Roles(...PAYROLL_ROLES)
  @ApiOperation({ summary: 'Publish payslips to employees' })
  publishRun(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payroll.publishRun(user.tenantId, id);
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

  @Get('expenses')
  listExpenses(@CurrentUser() user: AuthUser, @Query() q: ListExpensesDto) {
    return this.payroll.listExpenses(user.tenantId, q);
  }

  @Post('expenses')
  createExpense(@CurrentUser() user: AuthUser, @Body() dto: CreateExpenseDto) {
    return this.payroll.createExpense(user, dto);
  }

  @Patch('expenses/:id/approve')
  @Roles(...PAYROLL_ROLES, 'Manager')
  approveExpense(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payroll.decideExpense(user.tenantId, id, 'APPROVED');
  }

  @Patch('expenses/:id/reject')
  @Roles(...PAYROLL_ROLES, 'Manager')
  rejectExpense(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payroll.decideExpense(user.tenantId, id, 'REJECTED');
  }

  @Patch('expenses/:id/reimburse')
  @Roles(...PAYROLL_ROLES)
  reimburseExpense(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payroll.decideExpense(user.tenantId, id, 'PAID');
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
    return this.payroll.closeLoan(user.tenantId, id);
  }
}
