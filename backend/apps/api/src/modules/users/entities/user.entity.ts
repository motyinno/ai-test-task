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
 * PII columns (email, firstName, lastName, phone) are the anonymization target (D7).
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
