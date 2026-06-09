import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApprovalsRepository, ListApprovalsOptions } from './approvals.repository';
import {
  ApprovalRequest,
  ApprovalStatus,
  PaymentType,
} from './entities/approval-request.entity';
import { PlayerProfile } from '../users/entities/player-profile.entity';
import { ChildLogin } from '../child-account/entities/child-login.entity';
import { EmailService } from '../../shared/integrations/email/email.service';

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

export interface CreateApprovalParams {
  childProfileId: string;
  parentUserId: string;
  paymentType: PaymentType;
  eventRef?: string;
  amount?: number;
}

export interface ApprovalListResult {
  data: ApprovalRequest[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * ApprovalsService — D8/D9.
 *
 * Manages the ApprovalRequest lifecycle:
 *   - createApproval: USD always creates Pending (BR-008);
 *     TOKEN with tokenSpendAllowed=true → instant auto-approved informational record (BR-009).
 *   - approve/deny: race-safe guarded transition (409 APPROVAL_NOT_PENDING if terminal).
 *   - expireStale: called by D10 scheduler sweep.
 *
 * NOTE: ApprovalRequest rows are created by the checkout/RSVP flow (Epic-02/05).
 * Phase D exposes createApproval() as an internal/tested service method only.
 * No public POST /approvals creation endpoint.
 */
@Injectable()
export class ApprovalsService {
  private readonly logger = new Logger(ApprovalsService.name);

  constructor(
    private readonly approvalsRepo: ApprovalsRepository,
    private readonly emailService: EmailService,
    @InjectRepository(PlayerProfile)
    private readonly playerProfileRepo: Repository<PlayerProfile>,
    @InjectRepository(ChildLogin)
    private readonly childLoginRepo: Repository<ChildLogin>,
  ) {}

  /**
   * Create an ApprovalRequest.
   *
   * D9 Payment-type branch:
   *   USD:   always creates status=PENDING, expiresAt=now+48h
   *   TOKEN + tokenSpendAllowed=true:  status=APPROVED, autoApproved=true, expiresAt=null
   *   TOKEN + tokenSpendAllowed=false: status=PENDING, expiresAt=now+48h
   */
  async createApproval(params: CreateApprovalParams): Promise<ApprovalRequest> {
    // Resolve child's token-spend setting from ChildLogin (if one exists)
    const childLogin = await this.childLoginRepo.findOne({
      where: { childProfileId: params.childProfileId },
    });
    const tokenSpendAllowed = childLogin?.tokenSpendAllowed ?? false;

    const isAutoApproved =
      params.paymentType === PaymentType.TOKEN && tokenSpendAllowed;

    const now = new Date();
    const expiresAt = isAutoApproved ? null : new Date(now.getTime() + FORTY_EIGHT_HOURS_MS);

    const approval = await this.approvalsRepo.create({
      childProfileId: params.childProfileId,
      parentUserId: params.parentUserId,
      paymentType: params.paymentType,
      eventRef: params.eventRef ?? null,
      amount: params.amount ?? null,
      status: isAutoApproved ? ApprovalStatus.APPROVED : ApprovalStatus.PENDING,
      autoApproved: isAutoApproved,
      expiresAt,
    });

    if (isAutoApproved) {
      // Send informational notification to parent (best-effort)
      this.emailService
        .send({
          to: params.parentUserId, // Note: parent email resolved by caller or via query; using userId here as placeholder
          subject: 'Token spend auto-approved for your child',
          text: `An auto-approved token spend was recorded for child profile ${params.childProfileId}. Amount: ${params.amount ?? 'N/A'} tokens.`,
          data: { approvalId: approval.id, childProfileId: params.childProfileId },
        })
        .catch((err) => {
          this.logger.warn(`[EMAIL] Auto-approval notification failed: ${(err as Error).message}`);
        });
    }

    return approval;
  }

  async findById(id: string, parentUserId: string): Promise<ApprovalRequest> {
    const approval = await this.approvalsRepo.findById(id);
    if (!approval) {
      throw new NotFoundException({ message: 'Approval not found', errorCode: 'APPROVAL_NOT_FOUND' });
    }
    if (approval.parentUserId !== parentUserId) {
      throw new ForbiddenException({ message: 'Access denied', errorCode: 'APPROVAL_ACCESS_DENIED' });
    }
    return approval;
  }

  async listByParent(
    parentUserId: string,
    opts: { status?: ApprovalStatus; childProfileId?: string; page: number; limit: number },
  ): Promise<ApprovalListResult> {
    const [data, total] = await this.approvalsRepo.findByParent({
      parentUserId,
      status: opts.status,
      childProfileId: opts.childProfileId,
      page: opts.page,
      limit: opts.limit,
    } as ListApprovalsOptions);

    return {
      data,
      meta: {
        page: opts.page,
        limit: opts.limit,
        total,
        totalPages: Math.ceil(total / opts.limit),
      },
    };
  }

  /**
   * Approve a pending request.
   * Race-safe: 409 APPROVAL_NOT_PENDING if the row is already in a terminal state.
   */
  async approve(
    id: string,
    parentUserId: string,
    parentNotes?: string,
  ): Promise<ApprovalRequest> {
    const approval = await this.findById(id, parentUserId);
    const affected = await this.approvalsRepo.guardedTransition(
      id,
      ApprovalStatus.APPROVED,
      parentUserId,
      parentNotes ?? null,
    );

    if (affected === 0) {
      throw new ConflictException({
        message: 'Approval request is not in Pending state',
        errorCode: 'APPROVAL_NOT_PENDING',
      });
    }

    return { ...approval, status: ApprovalStatus.APPROVED, resolvedAt: new Date(), resolvedBy: parentUserId };
  }

  /**
   * Deny a pending request.
   * Race-safe: 409 APPROVAL_NOT_PENDING if the row is already in a terminal state.
   */
  async deny(
    id: string,
    parentUserId: string,
    parentNotes?: string,
  ): Promise<ApprovalRequest> {
    const approval = await this.findById(id, parentUserId);
    const affected = await this.approvalsRepo.guardedTransition(
      id,
      ApprovalStatus.DENIED,
      parentUserId,
      parentNotes ?? null,
    );

    if (affected === 0) {
      throw new ConflictException({
        message: 'Approval request is not in Pending state',
        errorCode: 'APPROVAL_NOT_PENDING',
      });
    }

    return { ...approval, status: ApprovalStatus.DENIED, resolvedAt: new Date(), resolvedBy: parentUserId };
  }

  /**
   * Cancel a pending request (e.g. child/parent abandons checkout).
   */
  async cancel(id: string, requesterId: string): Promise<ApprovalRequest> {
    const affected = await this.approvalsRepo.guardedTransition(
      id,
      ApprovalStatus.CANCELLED,
      requesterId,
      null,
    );

    if (affected === 0) {
      throw new ConflictException({
        message: 'Approval request is not in Pending state',
        errorCode: 'APPROVAL_NOT_PENDING',
      });
    }

    const updated = await this.approvalsRepo.findById(id);
    return updated!;
  }

  /**
   * D10: Expire stale Pending rows (called by the scheduler sweep).
   * Returns the count of rows transitioned to Expired.
   */
  async expireStaleApprovals(): Promise<number> {
    const count = await this.approvalsRepo.expireStale();
    if (count > 0) {
      this.logger.log(`[SWEEP] Expired ${count} stale approval request(s)`);
      // Notifications would be sent here; stub for Epic-02/05 integration
      await this.notifyExpired(count);
    }
    return count;
  }

  private async notifyExpired(count: number): Promise<void> {
    // Stub: In production, fetch the expired rows and email each parent.
    // For Phase D this is a best-effort stub — Epic-02/05 will flesh out.
    this.logger.log(`[SWEEP] Would notify parents for ${count} expired approval(s)`);
  }

  /**
   * D9: Toggle per-child token-spend setting.
   * Parent can toggle this on/off per child's ChildLogin.
   */
  async setTokenSetting(
    childProfileId: string,
    parentUserId: string,
    allowTokenSpendWithoutApproval: boolean,
  ): Promise<{ childProfileId: string; allowTokenSpendWithoutApproval: boolean }> {
    // Verify the child belongs to this parent
    const childProfile = await this.playerProfileRepo.findOne({
      where: { id: childProfileId, parentUserId },
    });
    if (!childProfile) {
      throw new NotFoundException({
        message: 'Child profile not found or does not belong to this parent',
        errorCode: 'CHILD_NOT_FOUND',
      });
    }

    // Update both PlayerProfile (for display) and ChildLogin (for auth)
    childProfile.allowTokenSpendWithoutApproval = allowTokenSpendWithoutApproval;
    await this.playerProfileRepo.save(childProfile);

    // Also update ChildLogin if it exists
    const childLogin = await this.childLoginRepo.findOne({ where: { childProfileId } });
    if (childLogin) {
      childLogin.tokenSpendAllowed = allowTokenSpendWithoutApproval;
      await this.childLoginRepo.save(childLogin);
    }

    return { childProfileId, allowTokenSpendWithoutApproval };
  }
}
