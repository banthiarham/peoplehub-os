import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
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

// `isSystem` is deliberately not exposed here: system/custom status is controlled
// internally by tenant provisioning and the role catalog, never by API callers.
export class UpdateRoleDto extends PartialType(CreateRoleDto) {}

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
  @ArrayNotEmpty()
  @IsString({ each: true })
  roleIds!: string[];

  @ApiPropertyOptional({ description: 'Optional justification recorded in the audit log' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ListRoleUsersDto {
  @ApiPropertyOptional({ description: 'Filter by name, email or employee code' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ description: 'Maximum users to return (default 200, max 500)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

export class SetFieldPermissionDto {
  @ApiProperty()
  @IsString()
  fieldKey!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  roleIds!: string[];
}
