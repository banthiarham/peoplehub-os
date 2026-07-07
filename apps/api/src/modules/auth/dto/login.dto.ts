import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MinLength } from 'class-validator';

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

export class SignupDto {
  @ApiProperty({ example: 'Acme India Pvt Ltd' })
  @IsString()
  @IsNotEmpty()
  companyName!: string;

  @ApiPropertyOptional({ example: 'acme-india' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'Workspace URL can contain lowercase letters, numbers, and hyphens only',
  })
  tenantSlug?: string;

  @ApiPropertyOptional({ example: 'Acme India Private Limited' })
  @IsOptional()
  @IsString()
  legalName?: string;

  @ApiPropertyOptional({ example: 'IT Services' })
  @IsOptional()
  @IsString()
  industry?: string;

  @ApiPropertyOptional({ example: '51-200' })
  @IsOptional()
  @IsString()
  companySize?: string;

  @ApiPropertyOptional({ example: 'Bengaluru' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'Karnataka' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ example: 'IN' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiProperty({ example: 'Priya Nair' })
  @IsString()
  @IsNotEmpty()
  ownerName!: string;

  @ApiProperty({ example: 'priya@acme.example' })
  @IsEmail()
  ownerEmail!: string;

  @ApiProperty({ example: 'Demo@1234' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiPropertyOptional({ example: 'payroll', enum: ['payroll', 'attendance', 'hr', 'hiring', 'explore'] })
  @IsOptional()
  @IsIn(['payroll', 'attendance', 'hr', 'hiring', 'explore'])
  primaryGoal?: string;
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
