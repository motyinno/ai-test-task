import { Injectable, ConflictException, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CoachProfile } from '../users/entities/coach-profile.entity';
import { ShareLink, ShareLinkType } from '../sharelinks/entities/share-link.entity';
import { ShareLinksService } from '../sharelinks/sharelinks.service';
import { EmailService } from '../../shared/integrations/email/email.service';
import { InviteCoachDto } from './dto/invite-coach.dto';
import { CoachInvitationDto, InvitationStatus } from './dto/coach-invitation.dto';
import { generateShareLinkCode } from '../sharelinks/share-link-code.util';

@Injectable()
export class CoachesService {
  private readonly logger = new Logger(CoachesService.name);

  constructor(
    @InjectRepository(CoachProfile)
    private readonly coachProfileRepo: Repository<CoachProfile>,
    @InjectRepository(ShareLink)
    private readonly shareLinkRepo: Repository<ShareLink>,
    private readonly shareLinksService: ShareLinksService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Invite a coach by email — creates a UNIQUE ShareLink and sends an email.
   *
   * BR-006: If the email maps to an existing coach already ACTIVE under another
   * trainer, reject with COACH_ALREADY_ACTIVE_ELSEWHERE.
   *
   * Idempotent (edge A): if there's already an outstanding (unconsumed, unexpired)
   * UNIQUE link for this targetEmail under this trainer, refresh it rather than
   * creating a duplicate (handled in C12 resend; here we just create fresh).
   */
  async inviteCoach(
    dto: InviteCoachDto,
    ctx: { trainerId: string; userId: string },
  ): Promise<ShareLink> {
    // BR-006: check if the email belongs to a coach already active under another trainer
    // We need to look up via users/coach_profiles — find by email
    // This is a pre-check; the final BR-006 enforcement is in the acceptance tx (C9/C11)
    const existingCoach = await this.coachProfileRepo
      .createQueryBuilder('cp')
      .innerJoin('users', 'u', 'u.id = cp.user_id')
      .where('u.email = :email', { email: dto.email })
      .andWhere('cp.trainer_id != :trainerId', { trainerId: ctx.trainerId })
      .getOne();

    if (existingCoach) {
      throw new ConflictException({
        message: 'Coach is already active under another trainer',
        errorCode: 'COACH_ALREADY_ACTIVE_ELSEWHERE',
      });
    }

    // Generate a UNIQUE share link for this coach
    const link = await this.shareLinksService.generate(
      { type: ShareLinkType.UNIQUE, targetEmail: dto.email },
      ctx,
    );

    // Send invite email (best-effort)
    this.emailService.send({
      to: dto.email,
      subject: `You have been invited to join as a coach`,
      text: `You have been invited to join as a coach. ${dto.message ? dto.message + '\n' : ''}Accept your invitation at: /join/${link.code}`,
      data: { linkCode: link.code, trainerId: ctx.trainerId, targetEmail: dto.email },
    }).catch((err) => {
      this.logger.warn(`[EMAIL] Coach invite email failed for ${dto.email}: ${(err as Error).message}`);
    });

    return link;
  }

  /**
   * List coach invitations for the calling trainer.
   * Derives status from the underlying ShareLink.
   */
  async listInvitations(trainerId: string): Promise<CoachInvitationDto[]> {
    const links = await this.shareLinkRepo.find({
      where: { trainerId, type: ShareLinkType.UNIQUE },
      order: { createdAt: 'DESC' },
    });

    return links.map((link) => this.toLinkDto(link));
  }

  /**
   * Resend a coach invitation — refreshes the underlying UNIQUE link.
   * Idempotent (edge A): one active link per targetEmail; resend reuses/refreshes.
   */
  async resendInvitation(
    shareLinkId: string,
    trainerId: string,
  ): Promise<CoachInvitationDto> {
    const link = await this.shareLinkRepo.findOne({
      where: { id: shareLinkId, trainerId, type: ShareLinkType.UNIQUE },
    });

    if (!link) {
      throw new NotFoundException({
        message: 'Invitation not found',
        errorCode: 'LINK_NOT_FOUND',
      });
    }

    // Refresh: reset useCount to 0, new 7d expiry, keep active=true
    link.useCount = 0;
    link.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    link.active = true;
    link.code = generateShareLinkCode(); // new code for security
    await this.shareLinkRepo.save(link);

    // Resend email
    this.emailService.send({
      to: link.targetEmail!,
      subject: `Coach invitation reminder`,
      text: `Your invitation has been refreshed. Accept at: /join/${link.code}`,
      data: { linkCode: link.code, trainerId, targetEmail: link.targetEmail },
    }).catch((err) => {
      this.logger.warn(`[EMAIL] Resend failed for ${link.targetEmail}: ${(err as Error).message}`);
    });

    return this.toLinkDto(link);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private toLinkDto(link: ShareLink): CoachInvitationDto {
    const now = new Date();
    let status: InvitationStatus;

    if (link.useCount >= (link.maxUses ?? 1)) {
      status = 'ACCEPTED';
    } else if (link.expiresAt && link.expiresAt < now) {
      status = 'EXPIRED';
    } else {
      status = 'PENDING';
    }

    return {
      id: link.id,
      targetEmail: link.targetEmail!,
      status,
      expiresAt: link.expiresAt ? link.expiresAt.toISOString() : null,
      createdAt: link.createdAt.toISOString(),
      useCount: link.useCount,
      active: link.active,
    };
  }
}
