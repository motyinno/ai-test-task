import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength, IsInt, IsOptional, IsIn, Min, Max } from 'class-validator';

/**
 * Body for POST /join/:code
 * Used when an anonymous (unauthenticated) visitor registers via a share link.
 *
 * For already-authenticated players/coaches, the body fields (email, password,
 * playerName) are ignored — association is created from the existing session principal.
 * All fields are optional at the DTO level; the service validates presence for the
 * anonymous-registration path.
 */
export class JoinViaLinkDto {
  @ApiProperty({ description: 'Account holder email (required for anonymous registration)' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ description: 'Account password (required for anonymous registration)' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiProperty({ description: 'Display name for the player profile (required for anonymous registration)' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  playerName?: string;

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
