import { Injectable, ConflictException, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CoachProfile } from '../users/entities/coach-profile.entity';
import { ShareLink, ShareLinkType } from '../sharelinks/entities/share-link.entity';
import { ShareLinksService } from '../sharelinks/sharelinks.service';
import { ShareLinksRepository } from '../sharelinks/sharelinks.repository';
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
    private readonly shareLinkRepo: ShareLinksRepository,
    private readonly shareLinksService: ShareLinksService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Invite a coach by email — creates a UNIQUE ShareLink and sends an email.
   *
   * BR-006: If the email maps to an existing coach already ACTIVE under another
   * trainer, reject with COACH_ALREADY_ACTIVE_ELSEWHERE.
   *
   * Idempotent (edge A / C-2): if there's already an outstanding (unconsumed, unexpired)
   * UNIQUE link for this targetEmail under this trainer, REFRESH it (reuse same row)
   * rather than inserting a duplicate. inviteCoach and resendInvitation share one
   * code path via the private refreshLink() method.
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

    // C-2 Idempotency: look up any outstanding UNIQUE link for this trainer+email.
    // If one exists, refresh it instead of inserting a duplicate row.
    const outstandingLink = await this.shareLinkRepo.findOutstandingUniqueLink(
      ctx.trainerId,
      dto.email,
    );

    let link: ShareLink;
    if (outstandingLink) {
      // Refresh the existing link (same as resend logic — DRY via shared method)
      link = await this.refreshLink(outstandingLink);
    } else {
      // No outstanding link — generate a new one
      link = await this.shareLinksService.generate(
        { type: ShareLinkType.UNIQUE, targetEmail: dto.email },
        ctx,
      );
    }

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
   * M-2: routed through ShareLinksRepository (tenant-scoped) instead of raw repo.
   */
  async listInvitations(trainerId: string): Promise<CoachInvitationDto[]> {
    // Use the scoped repository method — trainerId is passed explicitly through
    // the findOutstandingUniqueLink escape hatch, and here we use scopedFind via
    // the tenant-aware repository which requires the trainerId to be set in context.
    // Since this controller method is called with the authenticated trainer's ID,
    // we use a direct raw lookup with explicit trainerId for structural tenant isolation.
    const links = await this.shareLinkRepo.findAllForTrainer(trainerId);
    return links.map((link) => this.toLinkDto(link));
  }

  /**
   * Resend a coach invitation — refreshes the underlying UNIQUE link.
   * Idempotent (edge A): one active link per targetEmail; resend reuses/refreshes.
   * M-2: routed through ShareLinksRepository (tenant-scoped).
   */
  async resendInvitation(
    shareLinkId: string,
    trainerId: string,
  ): Promise<CoachInvitationDto> {
    const link = await this.shareLinkRepo.findUniqueForTrainer(shareLinkId, trainerId);

    if (!link) {
      throw new NotFoundException({
        message: 'Invitation not found',
        errorCode: 'LINK_NOT_FOUND',
      });
    }

    const refreshed = await this.refreshLink(link);

    // Resend email
    this.emailService.send({
      to: refreshed.targetEmail!,
      subject: `Coach invitation reminder`,
      text: `Your invitation has been refreshed. Accept at: /join/${refreshed.code}`,
      data: { linkCode: refreshed.code, trainerId, targetEmail: refreshed.targetEmail },
    }).catch((err) => {
      this.logger.warn(`[EMAIL] Resend failed for ${refreshed.targetEmail}: ${(err as Error).message}`);
    });

    return this.toLinkDto(refreshed);
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Shared refresh logic used by both inviteCoach (idempotent resend on existing link)
   * and resendInvitation. Resets useCount to 0, sets new 7d expiry, keeps active=true,
   * and rotates the code for security.
   *
   * DRY: both code paths share this one implementation.
   */
  private async refreshLink(link: ShareLink): Promise<ShareLink> {
    link.useCount = 0;
    link.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    link.active = true;
    link.code = generateShareLinkCode(); // rotate code for security
    return this.shareLinkRepo.saveLink(link);
  }

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
