import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  MaxLength,
  Matches,
  IsEnum,
} from 'class-validator';
import { UserStatus } from '../entities/user.entity';

/**
 * UpdateUserDto — email and role are intentionally omitted (immutable via this endpoint).
 *
 * M5: Honest contract — only fields that are actually persisted are listed here.
 *
 * - status: updates User.status (all roles)
 * - firstName: maps to TrainerProfile.trainerName (TRAINER) or PlayerProfile.name (PLAYER)
 * - phone: maps to TrainerProfile.phone (TRAINER only; ignored for other roles — not in their schema)
 *
 * lastName is intentionally absent: no role-profile table has a dedicated lastName column.
 * Callers needing a last name should use PATCH /me/profile which has role-aware fields.
 */
export class UpdateUserDto {
  @ApiPropertyOptional({
    example: 'John',
    description: 'Display name: trainerName for TRAINER, player name for PLAYER',
  })
  @IsOptional()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({
    example: '+12025551234',
    description: 'Phone number — applied to TrainerProfile only',
  })
  @IsOptional()
  @Matches(/^[+\d][\d\s().-]{6,19}$/, {
    message: 'phone must be a valid phone number',
  })
  phone?: string;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}
