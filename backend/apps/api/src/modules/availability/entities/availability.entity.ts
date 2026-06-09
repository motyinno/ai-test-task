import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Availability — per-profile (player or coach) weekly recurring time slots.
 *
 * subjectType: 'COACH' uses coachProfileId; 'PLAYER' uses playerProfileId.
 * subjectId: UUID of the CoachProfile or PlayerProfile.
 * trainerId: required for org-bound tenant isolation (A1 / TenantAwareRepository contract).
 *   - For PLAYER slots: trainerId = the trainer the player is associated with.
 *   - For COACH slots: trainerId = the trainer this coach belongs to.
 *
 * isAvailable: true = this slot is available; false = blocked (override slot).
 * Advisory data (BR-015): used for scheduling guidance only, not hard constraints.
 *
 * Phase E: coach availability override is handled by CoachAvailabilityOverride (E5).
 * Phase G: indexes will be verified with EXPLAIN.
 */
export enum AvailabilitySubjectType {
  COACH = 'COACH',
  PLAYER = 'PLAYER',
}

export enum DayOfWeek {
  MON = 'MON',
  TUE = 'TUE',
  WED = 'WED',
  THU = 'THU',
  FRI = 'FRI',
  SAT = 'SAT',
  SUN = 'SUN',
}

@Entity('availability_slots')
@Index('IDX_availability_subject', ['subjectType', 'subjectId'])
@Index('IDX_availability_trainer', ['trainerId'])
@Index('IDX_availability_trainer_subject', ['trainerId', 'subjectType'])
export class Availability {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * Tenant scope — the trainer org this availability belongs to.
   * Required for TenantAwareRepository structural filtering (A1).
   */
  @Column({ name: 'trainer_id', type: 'varchar' })
  trainerId!: string;

  /**
   * Discriminator: whether this slot belongs to a COACH or PLAYER.
   */
  @Column({
    name: 'subject_type',
    type: 'enum',
    enum: AvailabilitySubjectType,
  })
  subjectType!: AvailabilitySubjectType;

  /**
   * FK to CoachProfile.id or PlayerProfile.id depending on subjectType.
   * Intentionally a loose reference (no DB FK) so GDPR anonymization
   * of users does not cascade-delete advisory availability data.
   */
  @Column({ name: 'subject_id', type: 'varchar' })
  subjectId!: string;

  /**
   * Day of week for this recurring slot (MON..SUN).
   */
  @Column({
    name: 'day_of_week',
    type: 'enum',
    enum: DayOfWeek,
  })
  dayOfWeek!: DayOfWeek;

  /**
   * Start time in HH:MM format (24-hour). Stored as varchar for portability.
   * Validated by DTO: /^\d{2}:\d{2}$/
   */
  @Column({ name: 'start_time', type: 'varchar', length: 5 })
  startTime!: string;

  /**
   * End time in HH:MM format (24-hour). Must be after startTime (service-layer check).
   */
  @Column({ name: 'end_time', type: 'varchar', length: 5 })
  endTime!: string;

  /**
   * True = available during this slot; false = explicitly blocked.
   * Default: true (most slots are availability declarations).
   */
  @Column({ name: 'is_available', type: 'boolean', default: true })
  isAvailable: boolean = true;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
