import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsString, IsOptional, MinLength } from 'class-validator';

export class InviteCoachDto {
  @ApiProperty({ description: 'Email address to send the invitation to' })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ description: 'Coach display name (optional)' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({ description: 'Personal invite message' })
  @IsOptional()
  @IsString()
  message?: string;
}
