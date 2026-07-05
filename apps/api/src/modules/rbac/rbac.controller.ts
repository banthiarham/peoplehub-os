import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthUser } from '../../common/types/auth-user';
import {
  AssignUserRolesDto,
  CreateRoleDto,
  SetFieldPermissionDto,
  SetRolePermissionsDto,
  UpdateRoleDto,
} from './dto/rbac.dto';
import { RbacService } from './rbac.service';

const RBAC_ADMIN_ROLES = ['Super Admin', 'Tenant Owner', 'HR Admin'];

@ApiTags('Roles & Permissions')
@ApiBearerAuth()
@Controller('roles')
@Roles(...RBAC_ADMIN_ROLES)
export class RbacController {
  constructor(private readonly rbac: RbacService) {}

  @Get()
  @ApiOperation({ summary: 'List roles with permissions and member counts' })
  roles(@CurrentUser() user: AuthUser) {
    return this.rbac.roles(user.tenantId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a custom role' })
  createRole(@CurrentUser() user: AuthUser, @Body() dto: CreateRoleDto) {
    return this.rbac.createRole(user.tenantId, dto, user.userId);
  }

  @Patch(':id')
  updateRole(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.rbac.updateRole(user.tenantId, id, dto, user.userId);
  }

  @Patch(':id/permissions')
  setPermissions(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SetRolePermissionsDto,
  ) {
    return this.rbac.setPermissions(user.tenantId, id, dto, user.userId);
  }

  @Get('users')
  users(@CurrentUser() user: AuthUser) {
    return this.rbac.users(user.tenantId);
  }

  @Patch('users/:userId')
  assignUserRoles(
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
    @Body() dto: AssignUserRolesDto,
  ) {
    return this.rbac.assignUserRoles(user.tenantId, userId, dto, user.userId);
  }

  @Get('field-permissions')
  fieldPermissions(@CurrentUser() user: AuthUser) {
    return this.rbac.fieldPermissions(user.tenantId);
  }

  @Patch('field-permissions')
  setFieldPermission(@CurrentUser() user: AuthUser, @Body() dto: SetFieldPermissionDto) {
    return this.rbac.setFieldPermission(user.tenantId, dto, user.userId);
  }
}
