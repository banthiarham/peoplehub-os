import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class RaiseApprovalDto {
  @ApiProperty({ example: 'expenses' })
  @IsString()
  @IsNotEmpty()
  module!: string;

  @ApiProperty({ example: 'ExpenseClaim' })
  @IsString()
  @IsNotEmpty()
  objectType!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  objectId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  requestData?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  approverId?: string;
}

export class DecideDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;
}
