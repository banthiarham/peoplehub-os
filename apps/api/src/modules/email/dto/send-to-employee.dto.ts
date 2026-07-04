import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SendToEmployeeDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  subject!: string;

  @ApiProperty({ description: 'HTML body of the message' })
  @IsString()
  @IsNotEmpty()
  bodyHtml!: string;

  @ApiPropertyOptional({ type: [String], description: 'Optional CC addresses' })
  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  cc?: string[];
}
