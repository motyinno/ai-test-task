import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { SkillLevel } from './skill-level.enum';

/**
 * PlayerProfile — 1:1 with User (role=PLAYER), also used for child accounts.
 * Global entity (spans multiple trainer orgs via TrainerPlayerAssociation).
 *
 * parentUserId: set for child profiles created by a parent player (FR-023).
 * When null = standalone player account.
 *
 * Resolved:
 *   Q-01.01  skillLevel — Postgres enum (BEGINNER | INTERMEDIATE | ADVANCED | ELITE)
 *   Q-01.02  dateOfBirth — stores ISO date; age + ageGroup derived on read
 */
@Entity('player_profiles')
export class PlayerProfile {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', unique: true })
  userId!: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  /**
   * FK to the parent User (role=PLAYER) who created this child profile.
   * NULL for standalone (adult) player accounts.
   * FKs are preserved even after GDPR anonymization of the parent (D7).
   */
  @Column({ name: 'parent_user_id', type: 'varchar', nullable: true, default: null })
  parentUserId: string | null = null;

  /** Display name (may differ from User.email prefix) */
  @Column({ length: 200 })
  name!: string;

  /**
   * Date of birth (ISO date string, e.g. '2012-05-15') — Q-01.02.
   * Age and ageGroup are derived at read time (see age.util.ts).
   * BR-017: derived age must be 1–18 for child profiles.
   * Replaces the deprecated `age` integer column.
   */
  @Column({ name: 'date_of_birth', type: 'date', nullable: true, default: null })
  dateOfBirth: string | null = null;

  @Column({
    type: 'enum',
    enum: ['MALE', 'FEMALE', 'OTHER'],
    nullable: true,
    default: null,
  })
  gender: 'MALE' | 'FEMALE' | 'OTHER' | null = null;

  /** School name (optional) */
  @Column({ length: 200, type: 'varchar', nullable: true, default: null })
  school: string | null = null;

  /** Jersey number (string to allow "00", "#7", etc.) */
  @Column({ name: 'jersey_number', length: 20, type: 'varchar', nullable: true, default: null })
  jerseyNumber: string | null = null;

  /**
   * Skill level — trainer-assigned; Q-01.01 resolved.
   * Postgres enum column (BEGINNER | INTERMEDIATE | ADVANCED | ELITE).
   */
  @Column({
    name: 'skill_level',
    type: 'enum',
    enum: SkillLevel,
    nullable: true,
    default: null,
  })
  skillLevel: SkillLevel | null = null;

  /** URL to profile photo */
  @Column({ name: 'photo_url', type: 'varchar', nullable: true, default: null })
  photoUrl: string | null = null;

  /**
   * True when this profile belongs to a child account (age 1–18, parentUserId set).
   * False for standalone (adult) player accounts.
   */
  @Column({ name: 'is_child', type: 'boolean', default: false })
  isChild: boolean = false;

  /**
   * Per-child token spend approval setting (FR-029).
   * When true: TOKEN purchases for this child do NOT require parent approval.
   */
  @Column({ name: 'allow_token_spend_without_approval', type: 'boolean', default: false })
  allowTokenSpendWithoutApproval: boolean = false;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
