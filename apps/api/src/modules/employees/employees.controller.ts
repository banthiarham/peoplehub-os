import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Scopes } from '../../common/decorators/scopes.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthUser } from '../../common/types/auth-user';
import {
  BulkDocumentDto,
  BulkImportEmployeesDto,
  BulkManagerChangeDto,
  BulkSalaryAssignmentDto,
  BulkUpdateEmployeesDto,
  CreateDocumentDto,
  CreateEmployeeDto,
  CreateLifecycleEventDto,
  UpdateEmployeeDto,
} from './dto/create-employee.dto';
import { ListEmployeesDto } from './dto/list-employees.dto';
import { EmployeesService } from './employees.service';

@ApiTags('Employees')
@ApiBearerAuth()
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  @ApiOperation({ summary: 'Paginated employee directory' })
  @Scopes('employees:read')
  list(@CurrentUser() user: AuthUser, @Query() q: ListEmployeesDto) {
    return this.employees.list(user, q);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Headcount statistics' })
  @Scopes('employees:read')
  stats(@CurrentUser() user: AuthUser) {
    return this.employees.stats(user.tenantId);
  }

  @Get('meta/options')
  @ApiOperation({ summary: 'Dropdown options for employee forms' })
  @Scopes('employees:read')
  options(@CurrentUser() user: AuthUser) {
    return this.employees.options(user.tenantId);
  }

  @Get('profile-changes/pending')
  @Roles('Super Admin', 'HR Admin')
  @Scopes('employees:approve')
  pendingProfileChanges(@CurrentUser() user: AuthUser) {
    return this.employees.pendingProfileChanges(user);
  }

  @Patch('profile-changes/:id/approve')
  @Roles('Super Admin', 'HR Admin')
  @Scopes('employees:approve')
  approveProfileChange(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.employees.approveProfileChange(user, id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Full employee profile' })
  @Scopes('employees:read')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.employees.get(user, id);
  }

  @Get(':id/manager')
  @ApiOperation({ summary: "Employee's reporting manager" })
  @Scopes('employees:read')
  manager(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.employees.manager(user, id);
  }

  @Get(':id/team')
  @ApiOperation({ summary: "Employee's direct reports" })
  @Scopes('employees:read')
  team(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.employees.team(user, id);
  }

  @Post()
  @Roles('Super Admin', 'HR Admin')
  @Scopes('employees:write')
  @ApiOperation({ summary: 'Create employee' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateEmployeeDto) {
    return this.employees.create(user.tenantId, dto, user.userId);
  }

  @Patch(':id')
  @Roles('Super Admin', 'HR Admin')
  @Scopes('employees:write')
  @ApiOperation({ summary: 'Update employee (audited)' })
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateEmployeeDto) {
    return this.employees.update(user, id, dto);
  }

  @Delete(':id')
  @Roles('Super Admin', 'HR Admin')
  @Scopes('employees:write')
  @ApiOperation({ summary: 'Deactivate employee (soft delete)' })
  deactivate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.employees.deactivate(user, id);
  }

  @Get(':id/documents')
  @Scopes('employees:read')
  listDocuments(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.employees.listDocuments(user, id);
  }

  @Post(':id/documents')
  @Scopes('employees:write')
  addDocument(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreateDocumentDto) {
    return this.employees.addDocument(user, id, dto);
  }

  @Delete('documents/:docId')
  @Roles('Super Admin', 'HR Admin')
  @Scopes('employees:write')
  removeDocument(@CurrentUser() user: AuthUser, @Param('docId') docId: string) {
    return this.employees.removeDocument(user, docId);
  }

  @Get(':id/lifecycle')
  @Scopes('employees:read')
  lifecycle(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.employees.lifecycle(user, id);
  }

  @Get(':id/lifecycle-events')
  @Scopes('employees:read')
  lifecycleEvents(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.employees.lifecycle(user, id);
  }

  @Post(':id/lifecycle')
  @Roles('Super Admin', 'HR Admin')
  @Scopes('employees:write')
  addLifecycleEvent(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateLifecycleEventDto,
  ) {
    return this.employees.addLifecycleEvent(user, id, dto);
  }

  @Post('bulk/import')
  @Roles('Super Admin', 'HR Admin')
  @Scopes('employees:write')
  bulkImport(@CurrentUser() user: AuthUser, @Body() dto: BulkImportEmployeesDto) {
    return this.employees.bulkImport(user, dto);
  }

  @Post('bulk/update')
  @Roles('Super Admin', 'HR Admin')
  @Scopes('employees:write')
  bulkUpdate(@CurrentUser() user: AuthUser, @Body() dto: BulkUpdateEmployeesDto) {
    return this.employees.bulkUpdate(user, dto);
  }

  @Post('bulk/documents')
  @Roles('Super Admin', 'HR Admin')
  @Scopes('employees:write')
  bulkDocuments(@CurrentUser() user: AuthUser, @Body() dto: BulkDocumentDto) {
    return this.employees.bulkDocuments(user, dto);
  }

  @Post('bulk/manager')
  @Roles('Super Admin', 'HR Admin')
  @Scopes('employees:write')
  bulkManager(@CurrentUser() user: AuthUser, @Body() dto: BulkManagerChangeDto) {
    return this.employees.bulkManager(user, dto);
  }

  @Post('bulk/salary-structure')
  @Roles('Super Admin', 'HR Admin', 'Payroll Admin')
  @Scopes('employees:write')
  bulkSalary(@CurrentUser() user: AuthUser, @Body() dto: BulkSalaryAssignmentDto) {
    return this.employees.bulkSalary(user, dto);
  }

  @Post('bulk/assign-policies')
  @Roles('Super Admin', 'HR Admin')
  @Scopes('employees:write')
  bulkAssignPolicies(
    @CurrentUser() user: AuthUser,
    @Body() body: { employeeIds: string[]; policyType: string; policyId: string },
  ) {
    return this.employees.bulkAssignPolicies(user, body);
  }
}
