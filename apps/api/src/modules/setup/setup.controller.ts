import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Scopes } from '../../common/decorators/scopes.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { SetupEmployeeImportDto, SetupSalaryImportDto } from './dto/setup-import.dto';
import { SetupService } from './setup.service';

const SETUP_ADMIN_ROLES = ['Super Admin', 'Tenant Owner', 'HR Admin', 'Payroll Admin'];

@ApiTags('Setup')
@ApiBearerAuth()
@Controller('setup')
export class SetupController {
  constructor(private readonly setup: SetupService) {}

  @Get('readiness')
  @Roles(...SETUP_ADMIN_ROLES)
  @Scopes('employees:read')
  @ApiOperation({ summary: 'Tenant implementation and payroll readiness checklist' })
  readiness(@CurrentUser() user: AuthUser) {
    return this.setup.readiness(user.tenantId);
  }

  @Get('templates/:type')
  @Roles(...SETUP_ADMIN_ROLES)
  @Scopes('employees:read')
  @ApiOperation({ summary: 'Import template metadata and sample rows' })
  template(@CurrentUser() user: AuthUser, @Param('type') type: string) {
    return this.setup.template(type, user.tenantId);
  }

  @Post('import/employees/preview')
  @Roles('Super Admin', 'Tenant Owner', 'HR Admin')
  @Scopes('employees:write')
  @ApiOperation({ summary: 'Preview employee import rows with row-level validation' })
  previewEmployees(@CurrentUser() user: AuthUser, @Body() dto: SetupEmployeeImportDto) {
    return this.setup.previewEmployees(user.tenantId, dto);
  }

  @Post('import/employees/commit')
  @Roles('Super Admin', 'Tenant Owner', 'HR Admin')
  @Scopes('employees:write')
  @ApiOperation({ summary: 'Commit a previously valid employee import' })
  commitEmployees(@CurrentUser() user: AuthUser, @Body() dto: SetupEmployeeImportDto) {
    return this.setup.commitEmployees(user, dto);
  }

  @Post('import/salary/preview')
  @Roles(...SETUP_ADMIN_ROLES)
  @Scopes('payroll:write')
  @ApiOperation({ summary: 'Preview salary assignment import rows with row-level validation' })
  previewSalary(@CurrentUser() user: AuthUser, @Body() dto: SetupSalaryImportDto) {
    return this.setup.previewSalary(user.tenantId, dto);
  }

  @Post('import/salary/commit')
  @Roles(...SETUP_ADMIN_ROLES)
  @Scopes('payroll:write')
  @ApiOperation({ summary: 'Commit a previously valid salary assignment import' })
  commitSalary(@CurrentUser() user: AuthUser, @Body() dto: SetupSalaryImportDto) {
    return this.setup.commitSalary(user, dto);
  }
}
