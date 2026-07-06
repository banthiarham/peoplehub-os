import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsDateString, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';

export class RespondSurveyDto {
  @ApiProperty({ description: 'Map of questionId -> answer' })
  @IsObject()
  responses!: Record<string, unknown>;
}

export class RecognizeDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  recipientId!: string;

  @ApiPropertyOptional({ example: 'TEAM_PLAYER' })
  @IsOptional()
  @IsString()
  badge?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  message!: string;

  @ApiPropertyOptional({ default: 10, minimum: 0, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  points?: number;
}

export class CreateAnnouncementDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  body!: string;

  @ApiPropertyOptional({ default: 'ALL' })
  @IsOptional()
  @IsString()
  audience?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  publishAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class CreatePollDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  question!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  options!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
