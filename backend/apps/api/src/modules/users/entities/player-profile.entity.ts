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

/**
 * PlayerProfile — 1:1 with User (role=PLAYER), also used for child accounts.
 * Global entity (spans multiple trainer orgs via TrainerPlayerAssociation).
 *
 * parentUserId: set for child profiles created by a parent player (FR-023).
 * When null = standalone player account.
 *
 * Open gaps:
 *   Q-01.01  skillLevel enum values not yet defined — stored as varchar
 *   Q-01.02  age-group model (D2) — `age` stored as plain int for now
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
  @Column({ name: 'parent_user_id', nullable: true, default: null })
  parentUserId: string | null = null;

  /** Display name (may differ from User.email prefix) */
  @Column({ length: 200 })
  name!: string;

  /** Age in years — BR-017: 1–18 for child profiles */
  @Column({ type: 'int', nullable: true, default: null })
  age: number | null = null;

  @Column({
    type: 'enum',
    enum: ['MALE', 'FEMALE', 'OTHER'],
    nullable: true,
    default: null,
  })
  gender: 'MALE' | 'FEMALE' | 'OTHER' | null = null;

  /** School name (optional) */
  @Column({ length: 200, nullable: true, default: null })
  school: string | null = null;

  /** Jersey number (string to allow "00", "#7", etc.) */
  @Column({ name: 'jersey_number', length: 20, nullable: true, default: null })
  jerseyNumber: string | null = null;

  /**
   * Skill level — Q-01.01 open gap: enum values TBD.
   * Stored as varchar until the enum is defined.
   */
  @Column({ name: 'skill_level', length: 50, nullable: true, default: null })
  skillLevel: string | null = null;

  /** URL to profile photo */
  @Column({ name: 'photo_url', nullable: true, default: null })
  photoUrl: string | null = null;

  /**
   * Per-child token spend approval setting (FR-029).
   * When true: TOKEN purchases for this child do NOT require parent approval.
   */
  @Column({ name: 'allow_token_spend_without_approval', default: false })
  allowTokenSpendWithoutApproval: boolean = false;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
