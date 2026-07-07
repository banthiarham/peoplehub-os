import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

export class CreateApiKeyDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ type: [String], default: ['read'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopes?: string[];
}

export class CreateWebhookDto {
  @ApiProperty()
  @IsUrl({ require_tld: false })
  url!: string;

  @ApiProperty({ type: [String], example: ['employee.created', 'leave.approved'] })
  @IsArray()
  @IsString({ each: true })
  events!: string[];
}

export class UpdateWebhookDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  events?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false })
  url?: string;
}

export class CreateOAuthClientDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ type: [String], example: ['employees.read', 'attendance.read'] })
  @IsArray()
  @IsString({ each: true })
  scopes!: string[];

  @ApiProperty({ type: [String], example: ['https://app.example.com/oauth/callback'] })
  @IsArray()
  @IsString({ each: true })
  redirectUris!: string[];
}

export class UpdateOAuthClientDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopes?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  redirectUris?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
