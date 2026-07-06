import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@democorp.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Demo@123' })
  @IsString()
  @IsNotEmpty()
  password!: string;

  @ApiPropertyOptional({ example: 'demo-corp', description: 'Tenant slug (optional if email is unique across tenants)' })
  @IsOptional()
  @IsString()
  tenantSlug?: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  newPassword!: string;
}

export class OAuthTokenDto {
  @ApiProperty({ example: 'client_credentials' })
  @IsString()
  @IsNotEmpty()
  grant_type!: string;

  @ApiProperty({ example: 'phc_xxxxxxxxxxxx' })
  @IsString()
  @IsNotEmpty()
  client_id!: string;

  @ApiProperty({ example: 'phs_xxxxxxxxxxxx' })
  @IsString()
  @IsNotEmpty()
  client_secret!: string;

  @ApiPropertyOptional({ example: 'employees.read attendance.read' })
  @IsOptional()
  @IsString()
  scope?: string;
}
