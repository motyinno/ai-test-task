import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

/**
 * TrainerProfile — 1:1 with User (role=TRAINER).
 * Global entity (not tenant-filtered — the trainer IS the tenant root).
 *
 * Open gaps:
 *   Q-01.01  skill-level enum (placeholder: string for now)
 *   Epic-05  payment fields (Stripe/subscription) — placeholder nullable columns
 */
@Entity('trainer_profiles')
export class TrainerProfile {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', unique: true })
  userId!: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  /** Business / organization name */
  @Column({ name: 'business_name', length: 200 })
  businessName!: string;

  /** Display name for the trainer individual */
  @Column({ name: 'trainer_name', length: 100 })
  trainerName!: string;

  @Column({ length: 20, nullable: true, default: null })
  phone: string | null = null;

  /** URL to profile/logo photo */
  @Column({ name: 'photo_url', nullable: true, default: null })
  photoUrl: string | null = null;

  /**
   * Epic-05 placeholder: Stripe account / subscription fields.
   * Ownership boundary TBD — nullable until Epic-05 defines the schema.
   */
  @Column({ name: 'stripe_account_id', nullable: true, default: null })
  stripeAccountId: string | null = null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
