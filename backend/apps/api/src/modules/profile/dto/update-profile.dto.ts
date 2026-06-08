import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  MaxLength,
  IsPhoneNumber,
  IsBoolean,
  IsString,
} from 'class-validator';

/**
 * UpdateProfileDto — email and role are read-only (omitted from this DTO).
 * Fields validated on a best-effort basis; role-specific fields are saved
 * only when the caller's role matches (validated in service layer).
 */
export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'John' })
  @IsOptional()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Smith' })
  @IsOptional()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({ example: '+12025551234' })
  @IsOptional()
  @IsPhoneNumber()
  phone?: string;

  // ── Coach-specific ──────────────────────────────────────────────────────

  @ApiPropertyOptional({ example: 'Former D1 college coach with 10 years experience' })
  @IsOptional()
  @MaxLength(2000)
  bio?: string;

  @ApiPropertyOptional({ example: 'NSCAA Advanced National Diploma, USSF A License' })
  @IsOptional()
  @IsString()
  credentials?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  publicProfile?: boolean;

  // ── Player-specific ─────────────────────────────────────────────────────

  @ApiPropertyOptional({ example: 'Lincoln Middle School' })
  @IsOptional()
  @MaxLength(200)
  school?: string;

  @ApiPropertyOptional({ example: '7' })
  @IsOptional()
  jerseyNumber?: string;

  // ── Parent-specific ─────────────────────────────────────────────────────

  @ApiPropertyOptional({ example: '{"name":"Jane Doe","phone":"+15555551234"}' })
  @IsOptional()
  emergencyContact?: string;
}
