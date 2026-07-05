import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthUser } from '../../common/types/auth-user';
import {
  CreateLegalEntityDto,
  CreateOrgUnitDto,
  CreateTenantDto,
  UpdateLegalEntityDto,
  UpdateOrgUnitDto,
  UpdateTenantDto,
} from './dto/organization.dto';
import { OrganizationService } from './organization.service';

const ORG_ADMIN_ROLES = ['Super Admin', 'Tenant Owner', 'HR Admin'];
type OrgUnitKind = 'departments' | 'designations' | 'cost-centers' | 'business-units';

@ApiTags('Organization')
@ApiBearerAuth()
@Controller()
export class OrganizationController {
  constructor(private readonly organization: OrganizationService) {}

  @Get('organization')
  @ApiOperation({ summary: 'Current tenant organization summary' })
  current(@CurrentUser() user: AuthUser) {
    return this.organization.currentTenant(user.tenantId);
  }

  @Patch('organization')
  @Roles(...ORG_ADMIN_ROLES)
  @ApiOperation({ summary: 'Update current tenant company settings' })
  updateTenant(@CurrentUser() user: AuthUser, @Body() dto: UpdateTenantDto) {
    return this.organization.updateTenant(user.tenantId, dto, user.userId);
  }

  @Post('tenants')
  @Roles('Super Admin')
  @ApiOperation({ summary: 'Create a new tenant' })
  createTenant(@CurrentUser() user: AuthUser, @Body() dto: CreateTenantDto) {
    return this.organization.createTenant(dto, user.userId);
  }

  @Get('legal-entities')
  listLegalEntities(@CurrentUser() user: AuthUser) {
    return this.organization.legalEntities(user.tenantId);
  }

  @Post('legal-entities')
  @Roles(...ORG_ADMIN_ROLES)
  createLegalEntity(@CurrentUser() user: AuthUser, @Body() dto: CreateLegalEntityDto) {
    return this.organization.createLegalEntity(user.tenantId, dto, user.userId);
  }

  @Patch('legal-entities/:id')
  @Roles(...ORG_ADMIN_ROLES)
  updateLegalEntity(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateLegalEntityDto,
  ) {
    return this.organization.updateLegalEntity(user.tenantId, id, dto, user.userId);
  }

  @Get('departments')
  departments(@CurrentUser() user: AuthUser) {
    return this.organization.listOrgUnits(user.tenantId, 'departments');
  }

  @Post('departments')
  @Roles(...ORG_ADMIN_ROLES)
  createDepartment(@CurrentUser() user: AuthUser, @Body() dto: CreateOrgUnitDto) {
    return this.organization.createOrgUnit(user.tenantId, 'departments', dto, user.userId);
  }

  @Patch('departments/:id')
  @Roles(...ORG_ADMIN_ROLES)
  updateDepartment(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateOrgUnitDto) {
    return this.organization.updateOrgUnit(user.tenantId, 'departments', id, dto, user.userId);
  }

  @Get('designations')
  designations(@CurrentUser() user: AuthUser) {
    return this.organization.listOrgUnits(user.tenantId, 'designations');
  }

  @Post('designations')
  @Roles(...ORG_ADMIN_ROLES)
  createDesignation(@CurrentUser() user: AuthUser, @Body() dto: CreateOrgUnitDto) {
    return this.organization.createOrgUnit(user.tenantId, 'designations', dto, user.userId);
  }

  @Patch('designations/:id')
  @Roles(...ORG_ADMIN_ROLES)
  updateDesignation(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateOrgUnitDto) {
    return this.organization.updateOrgUnit(user.tenantId, 'designations', id, dto, user.userId);
  }

  @Get('cost-centers')
  costCenters(@CurrentUser() user: AuthUser) {
    return this.organization.listOrgUnits(user.tenantId, 'cost-centers');
  }

  @Post('cost-centers')
  @Roles(...ORG_ADMIN_ROLES)
  createCostCenter(@CurrentUser() user: AuthUser, @Body() dto: CreateOrgUnitDto) {
    return this.organization.createOrgUnit(user.tenantId, 'cost-centers', dto, user.userId);
  }

  @Patch('cost-centers/:id')
  @Roles(...ORG_ADMIN_ROLES)
  updateCostCenter(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateOrgUnitDto) {
    return this.organization.updateOrgUnit(user.tenantId, 'cost-centers', id, dto, user.userId);
  }

  @Get('business-units')
  businessUnits(@CurrentUser() user: AuthUser) {
    return this.organization.listOrgUnits(user.tenantId, 'business-units');
  }

  @Post('business-units')
  @Roles(...ORG_ADMIN_ROLES)
  createBusinessUnit(@CurrentUser() user: AuthUser, @Body() dto: CreateOrgUnitDto) {
    return this.organization.createOrgUnit(user.tenantId, 'business-units', dto, user.userId);
  }

  @Patch('business-units/:id')
  @Roles(...ORG_ADMIN_ROLES)
  updateBusinessUnit(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateOrgUnitDto) {
    return this.organization.updateOrgUnit(user.tenantId, 'business-units', id, dto, user.userId);
  }

  @Get('org-chart')
  @ApiOperation({ summary: 'Organization chart by manager and department' })
  orgChart(
    @CurrentUser() user: AuthUser,
    @Query('search') search?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.organization.orgChart(user.tenantId, search, departmentId);
  }

  @Get('organization/:kind')
  organizationUnitAlias(@CurrentUser() user: AuthUser, @Param('kind') kind: OrgUnitKind) {
    return this.organization.listOrgUnits(user.tenantId, kind);
  }
}
