import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * ImpersonationLog entity (F2) — bracket-style audit for impersonation sessions.
 *
 * Design (Q8/D6):
 *   - On POST /impersonation/:userId: a row is inserted with endAt=null (open bracket).
 *   - On POST /impersonation/exit (or 1h auto-cap): endAt + durationSeconds are set.
 *   - Drives the "Impersonation History" report (FR-016, SEC-006).
 *
 * Column types are explicitly declared per hard rule (boot safety requirement).
 */
@Entity('impersonation_logs')
export class ImpersonationLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** UUID of the Super Admin who initiated the impersonation session. */
  @Index()
  @Column({ name: 'admin_id', type: 'varchar', length: 255 })
  adminId!: string;

  /** UUID of the user being impersonated. */
  @Index()
  @Column({ name: 'impersonated_user_id', type: 'varchar', length: 255 })
  impersonatedUserId!: string;

  /** When impersonation started (bracket open). */
  @Column({ name: 'start_at', type: 'timestamp' })
  startAt!: Date;

  /**
   * When impersonation ended (bracket close).
   * NULL while the session is still active.
   */
  @Column({ name: 'end_at', type: 'timestamp', nullable: true, default: null })
  endAt: Date | null = null;

  /**
   * Duration in seconds (endAt - startAt).
   * NULL while the session is still active; set when the bracket is closed.
   */
  @Column({ name: 'duration_seconds', type: 'int', nullable: true, default: null })
  durationSeconds: number | null = null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
