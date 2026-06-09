/**
 * Notification — in-app notification record (Q-01.06, GR4).
 *
 * Persisted in the `notifications` table.
 * Per-user; userId references the recipient (e.g. coachUserId for override notifications).
 *
 * All columns explicitly typed per project convention (lesson from PR #4).
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export enum NotificationType {
  AVAILABILITY_OVERRIDE = 'AVAILABILITY_OVERRIDE',
  GENERAL = 'GENERAL',
}

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Recipient user ID */
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({
    type: 'enum',
    enum: NotificationType,
    default: NotificationType.GENERAL,
  })
  type!: NotificationType;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text' })
  body!: string;

  @Column({ type: 'boolean', default: false })
  read: boolean = false;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;
}
