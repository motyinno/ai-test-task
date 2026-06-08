import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * UserDeletionLog — GDPR audit trail for anonymized users (B6/D7/US-01.13).
 *
 * Written atomically in the same transaction as the PII wipe.
 * Global entity (not tenant-filtered).
 *
 * FKs to users are intentionally NOT enforced here because the user row
 * remains (with PII stripped) after anonymization — we want a hard record
 * even if someone later cleans up the users table.
 */
@Entity('user_deletion_log')
export class UserDeletionLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** UUID of the anonymized user (FK not enforced — see above) */
  @Index()
  @Column({ name: 'original_user_id', type: 'uuid' })
  originalUserId!: string;

  /** Last-known email before anonymization (captured before wipe) */
  @Column({ name: 'original_email', type: 'text' })
  originalEmail!: string;

  /** UUID of the SA who triggered the deletion */
  @Column({ name: 'deleted_by', type: 'uuid' })
  deletedBy!: string;

  /** Freeform reason provided by the SA (required) */
  @Column({ type: 'text' })
  reason!: string;

  /** Optional reference to a backup / export archive */
  @Column({ name: 'backup_ref', type: 'text', nullable: true, default: null })
  backupRef: string | null = null;

  @CreateDateColumn({ name: 'deleted_at' })
  deletedAt!: Date;
}
