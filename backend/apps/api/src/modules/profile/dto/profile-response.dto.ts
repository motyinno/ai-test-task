import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../../users/entities/user.entity';
import { SkillLevel } from '../../users/entities/skill-level.enum';
import { AgeGroup } from '../../../shared/utils/age.util';

/**
 * ProfileResponseDto — role-specific fields populated based on the caller's role.
 * email and role are read-only.
 */
export class ProfileResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty({ enum: UserRole })
  role!: UserRole;

  // ── Read-only from User entity ──────────────────────────────────────────

  @ApiProperty({ description: 'Read-only' })
  email!: string;

  @ApiProperty()
  createdAt!: string;

  // ── Common profile fields ───────────────────────────────────────────────

  @ApiPropertyOptional()
  firstName?: string;

  @ApiPropertyOptional()
  lastName?: string;

  @ApiPropertyOptional()
  phone?: string;

  @ApiPropertyOptional()
  photoUrl?: string;

  // ── Trainer-specific ────────────────────────────────────────────────────

  @ApiPropertyOptional()
  businessName?: string;

  @ApiPropertyOptional()
  trainerName?: string;

  // ── Coach-specific ──────────────────────────────────────────────────────

  @ApiPropertyOptional()
  bio?: string;

  @ApiPropertyOptional()
  credentials?: string;

  @ApiPropertyOptional()
  publicProfile?: boolean;

  @ApiPropertyOptional()
  trainerId?: string;

  // ── Player-specific ─────────────────────────────────────────────────────

  @ApiPropertyOptional()
  name?: string;

  @ApiPropertyOptional({ description: 'Date of birth (ISO date, YYYY-MM-DD)' })
  dateOfBirth?: string;

  @ApiPropertyOptional({ description: 'Derived age in years from dateOfBirth' })
  age?: number;

  @ApiPropertyOptional({ description: 'Derived age-group bucket (U6–U18)' })
  ageGroup?: AgeGroup;

  @ApiPropertyOptional()
  gender?: string;

  @ApiPropertyOptional()
  school?: string;

  @ApiPropertyOptional()
  jerseyNumber?: string;

  @ApiPropertyOptional({ enum: SkillLevel })
  skillLevel?: SkillLevel;

  @ApiPropertyOptional()
  parentUserId?: string;
}
