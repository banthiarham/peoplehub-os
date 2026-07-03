import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

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
}
