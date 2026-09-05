import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Scopes } from '../../common/decorators/scopes.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { UpsertPayrollPolicyDto } from './dto/payroll-policy.dto';
import { PayrollPolicyService } from './payroll-policy.service';

const PAYROLL_POLICY_ROLES = ['Super Admin', 'Tenant Owner', 'Payroll Admin', 'HR Admin'];

@ApiTags('Payroll Policy')
@ApiBearerAuth()
@Controller('payroll/policies')
export class PayrollPolicyController {
  constructor(private readonly payrollPolicy: PayrollPolicyService) {}

  @Get()
  @Roles(...PAYROLL_POLICY_ROLES)
  @Scopes('payroll:read')
  list(@CurrentUser() user: AuthUser) {
    return this.payrollPolicy.list(user.tenantId);
  }

  @Get(':id')
  @Roles(...PAYROLL_POLICY_ROLES)
  @Scopes('payroll:read')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payrollPolicy.get(user.tenantId, id);
  }

  @Post()
  @Roles(...PAYROLL_POLICY_ROLES)
  @Scopes('payroll:write')
  create(@CurrentUser() user: AuthUser, @Body() dto: UpsertPayrollPolicyDto) {
    return this.payrollPolicy.create(user.tenantId, dto);
  }

  @Patch(':id')
  @Roles(...PAYROLL_POLICY_ROLES)
  @Scopes('payroll:write')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpsertPayrollPolicyDto) {
    return this.payrollPolicy.update(user.tenantId, id, dto);
  }

  @Delete(':id')
  @Roles(...PAYROLL_POLICY_ROLES)
  @Scopes('payroll:write')
  delete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payrollPolicy.delete(user.tenantId, id);
  }
}
