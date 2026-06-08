import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum ShareLinkType {
  STATIC = 'STATIC',
  UNIQUE = 'UNIQUE',
}

/**
 * ShareLink — opaque random CSPRNG token (D4).
 * The DB row is the single source of truth (not a signed token).
 *
 * Org-bound entity: carries `trainerId` → trainer management must go through
 * TenantAwareRepository. Public code lookup by `code` is the documented global
 * escape hatch (C5 withoutTenantScope).
 *
 * STATIC links: unlimited use, used for player family registrations.
 * UNIQUE links: 1-use + 7d expiry, used for coach invitations.
 */
@Entity('share_links')
@Index('IDX_share_links_trainer_id', ['trainerId'])
export class ShareLink {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Opaque CSPRNG token — URL-safe base64, ~256 bits of entropy (C2). */
  @Column({ unique: true })
  code!: string;

  @Column({ type: 'enum', enum: ShareLinkType })
  type!: ShareLinkType;

  /** Org scope — trainer who owns this link. */
  @Column({ name: 'trainer_id' })
  trainerId!: string;

  /** User who created the link (trainer or SA). */
  @Column({ name: 'created_by' })
  createdBy!: string;

  /** Required for UNIQUE (coach invite) links; null for STATIC (player) links. */
  @Column({ name: 'target_email', nullable: true, default: null })
  targetEmail: string | null = null;

  /**
   * Expiry timestamp — null for STATIC links (no expiry).
   * Set to now+7d for UNIQUE links.
   */
  @Column({ name: 'expires_at', type: 'timestamp', nullable: true, default: null })
  expiresAt: Date | null = null;

  /**
   * Maximum number of uses:
   *   - STATIC: null (unlimited)
   *   - UNIQUE: 1 (single-use enforcement via C9 atomic consume)
   */
  @Column({ name: 'max_uses', type: 'int', nullable: true, default: null })
  maxUses: number | null = null;

  /** Usage counter — analytics + enforcement for UNIQUE links. */
  @Column({ name: 'use_count', type: 'int', default: 0 })
  useCount: number = 0;

  /** Revoke = flip to false. */
  @Column({ default: true })
  active: boolean = true;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
