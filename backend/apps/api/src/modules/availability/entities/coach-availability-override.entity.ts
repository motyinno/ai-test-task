import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * CoachAvailabilityOverride — audit log for overriding a coach's availability conflict.
 *
 * BR-016: Every override requires a reason (non-empty string, enforced at service layer).
 * Epic-02: event assignment is out-of-scope here; eventId is stored for future use when
 *          Epic-02 event domain is built.
 *
 * Q-01.06 (OPEN GAP): Coach notification on override — LEFT AS STUB in AvailabilityService.
 * The method stub is documented and must be wired up when Epic-02 is integrated.
 *
 * Global entity: no trainerId (the override is a cross-context audit record).
 * Indexed on coachId + eventId for future Epic-02 join queries.
 */
@Entity('coach_availability_overrides')
@Index('IDX_cao_coach_id', ['coachId'])
@Index('IDX_cao_trainer_id', ['overriddenByTrainerId'])
export class CoachAvailabilityOverride {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * The CoachProfile.id whose availability is being overridden.
   */
  @Column({ name: 'coach_id', type: 'varchar' })
  coachId!: string;

  /**
   * The TrainerProfile/User.id (trainer role) who approved the override.
   * BR-016: only a trainer can authorize an override.
   */
  @Column({ name: 'overridden_by_trainer_id', type: 'varchar' })
  overriddenByTrainerId!: string;

  /**
   * Epic-02 reference: the event this override relates to.
   * Nullable until Epic-02 event domain is available.
   */
  @Column({ name: 'event_id', type: 'varchar', nullable: true, default: null })
  eventId: string | null = null;

  /**
   * BR-016: Reason is REQUIRED. Empty string is rejected at service layer.
   */
  @Column({ name: 'reason', type: 'text' })
  reason!: string;

  /**
   * When the override was logged (immutable audit timestamp).
   */
  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
