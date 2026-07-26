import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { TenantStatus } from '@prisma/client';

export class CreateTenantDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'name should not be empty' })
  @MaxLength(160)
  name!: string;

  @ApiProperty()
  @IsString()
  slug!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  legalName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 2)
  @Matches(/^[A-Z]{2}$/, { message: 'country must be a 2-letter uppercase ISO country code' })
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  industry?: string;

  // Not clearable: an empty value is rejected rather than stored or nulled.
  @ApiPropertyOptional({ example: '51-200' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'companySize should not be empty' })
  @MaxLength(50)
  companySize?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  billingPlan?: string;

  @ApiPropertyOptional({ enum: TenantStatus })
  @IsOptional()
  @IsIn(Object.values(TenantStatus))
  status?: TenantStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(/^(?:UTC|[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)+)$/, { message: 'timezone must be a valid IANA timezone name' })
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter uppercase ISO currency code' })
  currency?: string;

  // An empty value clears the stored value, so format checks are skipped for it.
  @ApiPropertyOptional({ example: 'https://cdn.example.com/logo.png' })
  @IsOptional()
  @ValidateIf((dto: CreateTenantDto) => dto.logoUrl !== '')
  @IsString()
  @IsUrl({ require_tld: false, require_protocol: true, protocols: ['http', 'https'] })
  @MaxLength(500)
  logoUrl?: string;

  @ApiPropertyOptional({ example: '#2F6D5C' })
  @IsOptional()
  @ValidateIf((dto: CreateTenantDto) => dto.brandColor !== '')
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'brandColor must be a 6-digit hex color such as #2F6D5C',
  })
  brandColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  primaryAdminEmail?: string;
}

/**
 * Company settings update contract. `slug`, `billingPlan`, `status`, and `primaryAdminEmail` are
 * set during tenant provisioning and are not editable from Settings, so they are omitted here and
 * rejected by the global validation pipe.
 */
export class UpdateTenantDto extends PartialType(
  OmitType(CreateTenantDto, ['slug', 'billingPlan', 'status', 'primaryAdminEmail'] as const),
) {}

export class CreateLegalEntityDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  legalName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{5}[0-9]{4}[A-Z]$/, { message: 'pan must be a valid PAN' })
  pan?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{4}[0-9]{5}[A-Z]$/, { message: 'tan must be a valid TAN' })
  tan?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/, { message: 'gstin must be a valid GSTIN' })
  gstin?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(/^[A-Z0-9/.-]+$/, { message: 'pfRegistrationNumber contains invalid characters' })
  pfRegistrationNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^\d{17}$/, { message: 'esiRegistrationNumber must contain 17 digits' })
  esiRegistrationNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(/^[A-Z0-9/.-]+$/, { message: 'ptRegistrationNumber contains invalid characters' })
  ptRegistrationNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 2)
  @Matches(/^[A-Z]{2}$/, { message: 'country must be a 2-letter uppercase ISO country code' })
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  payrollSettings?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  bankDetails?: Record<string, unknown>;
}

export class UpdateLegalEntityDto extends PartialType(CreateLegalEntityDto) {}

export class CreateOrgUnitDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  headId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  grade?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  level?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateOrgUnitDto extends PartialType(CreateOrgUnitDto) {}
