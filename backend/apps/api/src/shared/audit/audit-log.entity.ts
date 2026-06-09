import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Generic audit log entity (F1).
 *
 * Centralized audit channel for cross-cutting concerns:
 *   - Impersonation start/exit
 *   - User deletion (in addition to UserDeletionLog for GDPR)
 *   - Override events
 *   - Any mutation requiring dual-actor attribution (D6)
 *
 * actorId      — the apparent actor (may be the impersonated subject during impersonation)
 * actingAdminId — the real Super Admin (populated during impersonation; D6 dual-actor)
 * viaImpersonationLogId — links to the ImpersonationLog bracket (D6)
 */
@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** The apparent actor performing the action (or the SA when not impersonating). */
  @Index()
  @Column({ name: 'actor_id', type: 'varchar', length: 255 })
  actorId!: string;

  /**
   * D6 dual-actor: the real Super Admin when the action was performed under impersonation.
   * NULL when acting directly (not via impersonation).
   */
  @Index()
  @Column({ name: 'acting_admin_id', type: 'varchar', length: 255, nullable: true, default: null })
  actingAdminId: string | null = null;

  /**
   * Links this audit entry to the open ImpersonationLog bracket (D6).
   * NULL when not under impersonation.
   */
  @Column({
    name: 'via_impersonation_log_id',
    type: 'varchar',
    length: 255,
    nullable: true,
    default: null,
  })
  viaImpersonationLogId: string | null = null;

  /** Action verb, e.g. "IMPERSONATION_START", "IMPERSONATION_EXIT", "USER_DELETED" */
  @Column({ name: 'action', type: 'varchar', length: 100 })
  action!: string;

  /** The kind of entity this action targets, e.g. "User", "ImpersonationLog" */
  @Column({ name: 'target_type', type: 'varchar', length: 100, nullable: true, default: null })
  targetType: string | null = null;

  /** The UUID of the targeted entity row */
  @Column({ name: 'target_id', type: 'varchar', length: 255, nullable: true, default: null })
  targetId: string | null = null;

  /** Arbitrary JSON metadata for the action (e.g. changed fields, reason). */
  @Column({ name: 'metadata', type: 'jsonb', nullable: true, default: null })
  metadata: Record<string, unknown> | null = null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
