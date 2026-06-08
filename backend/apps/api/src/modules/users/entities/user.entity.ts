import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  TRAINER = 'TRAINER',
  COACH = 'COACH',
  PLAYER = 'PLAYER',
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  DELETED = 'DELETED',
}

/**
 * Core user account — global entity (not tenant-filtered).
 *
 * This entity carries only account-level fields: email, passwordHash, role,
 * status, and lifecycle timestamps. It has NO firstName/lastName/phone columns —
 * those live exclusively on role-specific profile tables (TrainerProfile,
 * CoachProfile, PlayerProfile).
 *
 * GDPR anonymization target (D7 / US-01.13): both this row AND the matching
 * role-profile row(s) must be scrubbed in the same transaction.
 * See UsersRepository.anonymizeInTransaction for the authoritative implementation.
 */
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ length: 255 })
  email!: string;

  @Column({ name: 'password_hash' })
  passwordHash!: string;

  @Column({
    type: 'enum',
    enum: UserRole,
  })
  role!: UserRole;

  @Column({
    type: 'enum',
    enum: UserStatus,
    default: UserStatus.ACTIVE,
  })
  status: UserStatus = UserStatus.ACTIVE;

  /**
   * Nullable timestamp — set when GDPR anonymization runs (D7).
   * Once set, the user can never be reactivated.
   */
  @Column({ name: 'anonymized_at', type: 'timestamp', nullable: true, default: null })
  anonymizedAt: Date | null = null;

  @Column({ name: 'email_verified', default: false })
  emailVerified: boolean = false;

  /**
   * True for temp-password users created by SA — forces change on first login (FR-006).
   */
  @Column({ name: 'must_change_password', default: false })
  mustChangePassword: boolean = false;

  @Column({ name: 'last_login_at', type: 'timestamp', nullable: true, default: null })
  lastLoginAt: Date | null = null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
