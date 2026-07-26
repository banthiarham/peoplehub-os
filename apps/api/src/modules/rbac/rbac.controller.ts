import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthUser } from '../../common/types/auth-user';
import {
  AssignUserRolesDto,
  CreateRoleDto,
  ListRoleUsersDto,
  SetFieldPermissionDto,
  SetRolePermissionsDto,
  UpdateRoleDto,
} from './dto/rbac.dto';
import { RbacService } from './rbac.service';

/** May read RBAC data and assign roles to users. */
const RBAC_ADMIN_ROLES = ['Super Admin', 'Tenant Owner', 'HR Admin'];

/** May change RBAC configuration itself: roles, role permissions and sensitive-field access. */
const RBAC_CONFIG_ROLES = ['Super Admin', 'Tenant Owner'];

@ApiTags('Roles & Permissions')
@ApiBearerAuth()
@Controller('roles')
@Roles(...RBAC_ADMIN_ROLES)
export class RbacController {
  constructor(private readonly rbac: RbacService) {}

  // NOTE: static paths must stay declared before the `:id` routes below, otherwise
  // requests such as `PATCH /roles/field-permissions` are captured by `PATCH /roles/:id`.

  @Get()
  @ApiOperation({ summary: 'List roles with permissions and member counts' })
  roles(@CurrentUser() user: AuthUser) {
    return this.rbac.roles(user.tenantId);
  }

  @Get('users')
  @ApiOperation({ summary: 'List tenant users with their currently assigned roles' })
  users(@CurrentUser() user: AuthUser, @Query() query: ListRoleUsersDto) {
    return this.rbac.users(user.tenantId, query);
  }

  @Get('field-permissions')
  fieldPermissions(@CurrentUser() user: AuthUser) {
    return this.rbac.fieldPermissions(user.tenantId);
  }

  @Post()
  @Roles(...RBAC_CONFIG_ROLES)
  @ApiOperation({ summary: 'Create a custom role' })
  createRole(@CurrentUser() user: AuthUser, @Body() dto: CreateRoleDto) {
    return this.rbac.createRole(user.tenantId, dto, user.userId);
  }

  @Patch('users/:userId')
  @ApiOperation({ summary: 'Replace the roles assigned to a user in the current tenant' })
  assignUserRoles(
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
    @Body() dto: AssignUserRolesDto,
  ) {
    return this.rbac.assignUserRoles(user, userId, dto);
  }

  @Patch('field-permissions')
  @Roles(...RBAC_CONFIG_ROLES)
  setFieldPermission(@CurrentUser() user: AuthUser, @Body() dto: SetFieldPermissionDto) {
    return this.rbac.setFieldPermission(user.tenantId, dto, user.userId);
  }

  @Patch(':id/permissions')
  @Roles(...RBAC_CONFIG_ROLES)
  setPermissions(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SetRolePermissionsDto,
  ) {
    return this.rbac.setPermissions(user.tenantId, id, dto, user.userId);
  }

  @Patch(':id')
  @Roles(...RBAC_CONFIG_ROLES)
  updateRole(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.rbac.updateRole(user.tenantId, id, dto, user.userId);
  }
}
