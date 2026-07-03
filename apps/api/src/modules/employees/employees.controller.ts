import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthUser } from '../../common/types/auth-user';
import {
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
  list(@CurrentUser() user: AuthUser, @Query() q: ListEmployeesDto) {
    return this.employees.list(user.tenantId, q);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Headcount statistics' })
  stats(@CurrentUser() user: AuthUser) {
    return this.employees.stats(user.tenantId);
  }

  @Get('meta/options')
  @ApiOperation({ summary: 'Dropdown options for employee forms' })
  options(@CurrentUser() user: AuthUser) {
    return this.employees.options(user.tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Full employee profile' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.employees.get(user.tenantId, id);
  }

  @Post()
  @Roles('Super Admin', 'HR Admin')
  @ApiOperation({ summary: 'Create employee' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateEmployeeDto) {
    return this.employees.create(user.tenantId, dto, user.userId);
  }

  @Patch(':id')
  @Roles('Super Admin', 'HR Admin')
  @ApiOperation({ summary: 'Update employee (audited)' })
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateEmployeeDto) {
    return this.employees.update(user.tenantId, id, dto, user.userId);
  }

  @Delete(':id')
  @Roles('Super Admin', 'HR Admin')
  @ApiOperation({ summary: 'Deactivate employee (soft delete)' })
  deactivate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.employees.deactivate(user.tenantId, id, user.userId);
  }

  @Get(':id/documents')
  listDocuments(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.employees.listDocuments(user.tenantId, id);
  }

  @Post(':id/documents')
  addDocument(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreateDocumentDto) {
    return this.employees.addDocument(user.tenantId, id, dto, user.userId);
  }

  @Delete('documents/:docId')
  @Roles('Super Admin', 'HR Admin')
  removeDocument(@CurrentUser() user: AuthUser, @Param('docId') docId: string) {
    return this.employees.removeDocument(user.tenantId, docId);
  }

  @Get(':id/lifecycle')
  lifecycle(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.employees.lifecycle(user.tenantId, id);
  }

  @Post(':id/lifecycle')
  @Roles('Super Admin', 'HR Admin')
  addLifecycleEvent(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateLifecycleEventDto,
  ) {
    return this.employees.addLifecycleEvent(user.tenantId, id, dto, user.userId);
  }
}
