import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength, IsInt, IsOptional, IsIn, Min, Max } from 'class-validator';

/**
 * Body for POST /join/:code
 * Used when an anonymous (unauthenticated) visitor registers via a share link.
 *
 * For already-authenticated players, the body fields are ignored — association
 * is created from the existing session principal.
 */
export class JoinViaLinkDto {
  @ApiProperty({ description: 'Account holder email' })
  @IsEmail()
  email!: string;

  @ApiProperty({ description: 'Account password (will be argon2-hashed)' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ description: 'Display name for the player profile' })
  @IsString()
  @MinLength(1)
  playerName!: string;

  @ApiPropertyOptional({ description: 'Age in years' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  age?: number;

  @ApiPropertyOptional({ enum: ['MALE', 'FEMALE', 'OTHER'] })
  @IsOptional()
  @IsIn(['MALE', 'FEMALE', 'OTHER'])
  gender?: 'MALE' | 'FEMALE' | 'OTHER';
}
