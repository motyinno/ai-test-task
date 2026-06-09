import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum PaymentType {
  USD = 'USD',
  TOKEN = 'TOKEN',
}

export enum ApprovalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  DENIED = 'DENIED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

/**
 * ApprovalRequest — D5/D7. Explicit state machine for child purchase approval.
 *
 * State machine (D5 / Q6):
 *   create → Pending → { Approved | Denied | Expired | Cancelled }
 *   All non-Pending states are terminal (no resurrection).
 *
 * expiresAt = createdAt + 48h (set at creation).
 * autoApproved = true when token spend is allowed (no 48h timer applies).
 *
 * Indexes per spec:
 *   (status, expiresAt) — cheap expiry sweep
 *   (parentUserId, status) — parent queue view
 *   (childProfileId, status) — per-child view
 *
 * Hard rule: every column has explicit `type:` for tsc boot safety.
 */
@Entity('approval_requests')
@Index('IDX_approval_status_expires', ['status', 'expiresAt'])
@Index('IDX_approval_parent_status', ['parentUserId', 'status'])
@Index('IDX_approval_child_status', ['childProfileId', 'status'])
export class ApprovalRequest {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** FK to PlayerProfile.id of the child (not a TypeORM relation to keep migration simple). */
  @Column({ name: 'child_profile_id', type: 'varchar' })
  childProfileId!: string;

  /** FK to User.id of the parent (PLAYER role). */
  @Column({ name: 'parent_user_id', type: 'varchar' })
  parentUserId!: string;

  /**
   * Opaque event/order reference — set by checkout/RSVP flow (Epic-02/05).
   * May reference an event UUID or order ID.
   */
  @Column({ name: 'event_ref', type: 'varchar', nullable: true, default: null })
  eventRef: string | null = null;

  /** Amount requested (in cents for USD, or token count for TOKEN). */
  @Column({ name: 'amount', type: 'numeric', precision: 12, scale: 2, nullable: true, default: null })
  amount: number | null = null;

  @Column({
    name: 'payment_type',
    type: 'enum',
    enum: PaymentType,
  })
  paymentType!: PaymentType;

  @Column({
    name: 'status',
    type: 'enum',
    enum: ApprovalStatus,
    default: ApprovalStatus.PENDING,
  })
  status: ApprovalStatus = ApprovalStatus.PENDING;

  /**
   * True when the approval was auto-created (TOKEN + tokenSpendAllowed=true).
   * Auto-approved rows skip the 48h timer and the expiry sweep.
   */
  @Column({ name: 'auto_approved', type: 'boolean', default: false })
  autoApproved: boolean = false;

  /**
   * 48h from createdAt for Pending rows. NULL for autoApproved rows.
   */
  @Column({ name: 'expires_at', type: 'timestamp', nullable: true, default: null })
  expiresAt: Date | null = null;

  /** Set when status transitions to Approved, Denied, or Cancelled. */
  @Column({ name: 'resolved_at', type: 'timestamp', nullable: true, default: null })
  resolvedAt: Date | null = null;

  /** User.id of the parent who approved/denied (or null for scheduler-expired). */
  @Column({ name: 'resolved_by', type: 'varchar', nullable: true, default: null })
  resolvedBy: string | null = null;

  @Column({ name: 'parent_notes', type: 'text', nullable: true, default: null })
  parentNotes: string | null = null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;
}
