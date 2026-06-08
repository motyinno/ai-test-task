import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';

/**
 * CoachProfile — 1:1 with User (role=COACH).
 * Org-bound entity: carries `trainerId` (the trainer whose org this coach belongs to).
 * BR-006: A coach can be active under exactly ONE trainer at a time.
 *
 * Note: trainerId is the FK to the User with role=TRAINER (not TrainerProfile.id).
 * This matches the TenantAwareRepository contract which filters by trainerId.
 */
@Entity('coach_profiles')
export class CoachProfile {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', unique: true })
  userId!: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  /**
   * The trainer org this coach belongs to (BR-006 — exactly one active).
   * Indexed for tenant-scope hot path.
   */
  @Index()
  @Column({ name: 'trainer_id' })
  trainerId!: string;

  /** Short biography for public profile */
  @Column({ type: 'text', nullable: true, default: null })
  bio: string | null = null;

  /** Credentials / certifications */
  @Column({ type: 'varchar', nullable: true, default: null })
  credentials: string | null = null;

  /** Whether the coach's profile is publicly visible */
  @Column({ name: 'public_profile', default: false })
  publicProfile: boolean = false;

  /** URL to profile photo */
  @Column({ name: 'photo_url', type: 'varchar', nullable: true, default: null })
  photoUrl: string | null = null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
