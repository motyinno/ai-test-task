import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

/**
 * Invitation token — single-use, used to onboard a newly-created account
 * (e.g. a trainer invited by a Super Admin) by letting the invitee set their
 * own password. 7-day expiry. Accepting also marks the email as verified,
 * since possession of the token proves control of the mailbox it was sent to.
 */
@Entity('invitation_tokens')
export class InvitationToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column()
  token!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ name: 'expires_at', type: 'timestamp' })
  expiresAt!: Date;

  @Column({ name: 'used_at', type: 'timestamp', nullable: true, default: null })
  usedAt: Date | null = null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
