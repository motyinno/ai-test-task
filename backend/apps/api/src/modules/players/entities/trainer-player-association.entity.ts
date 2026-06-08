import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  Unique,
} from 'typeorm';

export enum AssociationStatus {
  ACTIVE = 'ACTIVE',
  REMOVED = 'REMOVED',
}

/**
 * TrainerPlayerAssociation — org-bound join between a trainer and a player profile.
 *
 * BR-005: unique (trainerId, playerProfileId) at the DB level.
 * ACTIVE → player is currently associated; REMOVED → soft-deleted (can be reactivated).
 * viaShareLinkId tracks which ShareLink was used to create this association.
 *
 * Note: Phase D will add child-specific fields to PlayerProfile and reuse this entity.
 */
@Entity('trainer_player_associations')
@Unique('UQ_trainer_player', ['trainerId', 'playerProfileId'])
@Index('IDX_tpa_trainer_id', ['trainerId'])
export class TrainerPlayerAssociation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Org scope — trainer who owns this association. */
  @Column({ name: 'trainer_id' })
  trainerId!: string;

  /** The player profile being associated. */
  @Column({ name: 'player_profile_id' })
  playerProfileId!: string;

  /** The ShareLink that was used to create this association (for audit). */
  @Column({ name: 'via_share_link_id', type: 'varchar', nullable: true, default: null })
  viaShareLinkId: string | null = null;

  @Column({
    type: 'enum',
    enum: AssociationStatus,
    default: AssociationStatus.ACTIVE,
  })
  status: AssociationStatus = AssociationStatus.ACTIVE;

  @CreateDateColumn({ name: 'connected_at' })
  connectedAt!: Date;
}
