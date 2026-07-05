import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { PermissionType, ScopeType } from '@prisma/client';

export class CreateRoleDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateRoleDto extends PartialType(CreateRoleDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isSystem?: boolean;
}

export class UpsertPermissionDto {
  @ApiProperty()
  @IsString()
  module!: string;

  @ApiProperty({ enum: PermissionType })
  @IsEnum(PermissionType)
  permissionType!: PermissionType;

  @ApiProperty({ enum: ScopeType })
  @IsEnum(ScopeType)
  scopeType!: ScopeType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scopeValue?: string;
}

export class SetRolePermissionsDto {
  @ApiProperty({ type: [UpsertPermissionDto] })
  @IsArray()
  permissions!: UpsertPermissionDto[];
}

export class AssignUserRolesDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  roleIds!: string[];
}

export class SetFieldPermissionDto {
  @ApiProperty()
  @IsString()
  fieldKey!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  roleIds!: string[];
}
