import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm';

/**
 * ChildLogin — constrained sub-credential tied to a parent account (D2/D5).
 *
 * A parent (PLAYER role) may create one child sub-login per child PlayerProfile.
 * The child authenticates with childUsername (unique) + password, and receives
 * a constrained principal (isChild=true) in the session.
 *
 * tokenSpendAllowed (FR-029): when true, TOKEN purchases bypass approval (auto-approved).
 * Hard rule: every new column must have an explicit `type:` to survive tsc startup.
 */
@Entity('child_logins')
@Unique('UQ_child_login_username', ['childUsername'])
@Unique('UQ_child_login_profile', ['childProfileId'])  // one login per child profile
export class ChildLogin {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * FK to PlayerProfile.id of the child.
   * No TypeORM relation to avoid cascade complexity; FK enforced in migration.
   */
  @Column({ name: 'child_profile_id', type: 'varchar' })
  childProfileId!: string;

  /**
   * FK to User.id of the parent (PLAYER role) who created this child login.
   */
  @Column({ name: 'parent_user_id', type: 'varchar' })
  parentUserId!: string;

  /**
   * Unique username for child login (e.g. "maya_smith").
   */
  @Index('IDX_child_login_username')
  @Column({ name: 'child_username', type: 'varchar', length: 50 })
  childUsername!: string;

  /**
   * argon2-hashed password for the child sub-login.
   */
  @Column({ name: 'password_hash', type: 'text' })
  passwordHash!: string;

  /**
   * When true: TOKEN purchases for this child do NOT require parent approval (FR-029).
   * Default false — parents must explicitly enable.
   */
  @Column({ name: 'token_spend_allowed', type: 'boolean', default: false })
  tokenSpendAllowed: boolean = false;

  /** Whether this sub-login is active (parent can disable). */
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean = true;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;
}
