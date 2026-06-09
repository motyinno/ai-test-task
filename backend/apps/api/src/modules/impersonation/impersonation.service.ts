import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Request } from 'express';
import { User, UserRole } from '../users/entities/user.entity';
import { ImpersonationRepository } from './impersonation.repository';
import { SessionContextService } from '../auth/session-context.service';
import { AuditService } from '../../shared/audit/audit.service';
import {
  StartImpersonationResponseDto,
  ImpersonationLogDto,
  ImpersonationHistoryQueryDto,
  PaginatedImpersonationHistoryDto,
} from './dto/impersonation.dto';
import { MeResponseDto } from '../auth/dto/me-response.dto';
import { ImpersonationLog } from './entities/impersonation-log.entity';

/** 1-hour hard cap in milliseconds (F3/F4) */
export const IMPERSONATION_CAP_MS = 60 * 60 * 1000;

@Injectable()
export class ImpersonationService {
  private readonly logger = new Logger(ImpersonationService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly impersonationRepo: ImpersonationRepository,
    private readonly sessionCtx: SessionContextService,
    private readonly auditService: AuditService,
  ) {}

  // ─── F3: POST /impersonation/:userId ────────────────────────────────────────

  /**
   * Begin impersonating a user.
   *
   * Business rules:
   *   - SEC-008: CANNOT impersonate another SUPER_ADMIN → 403 CANNOT_IMPERSONATE_SUPER_ADMIN
   *   - Target must exist → 404 USER_NOT_FOUND
   *   - Opens an ImpersonationLog bracket (endAt = null, open)
   *   - Writes impersonation pair into session: { realAdminId, impersonatedSubjectId, startedAt }
   *   - Returns StartImpersonationResponseDto with actingAs (subject MeResponseDto) + expiresAt
   *   - Audit: IMPERSONATION_START (dual-actor: actorId = admin, no impersonation context yet)
   */
  async startImpersonation(
    req: Request,
    adminId: string,
    targetUserId: string,
  ): Promise<StartImpersonationResponseDto> {
    // 404 if target not found
    const targetUser = await this.userRepo.findOne({ where: { id: targetUserId } });
    if (!targetUser) {
      throw new NotFoundException({
        message: `User ${targetUserId} not found`,
        errorCode: 'USER_NOT_FOUND',
      });
    }

    // SEC-008: Forbid SA→SA impersonation
    if (targetUser.role === UserRole.SUPER_ADMIN) {
      throw new ForbiddenException({
        message: 'Cannot impersonate a Super Admin',
        errorCode: 'CANNOT_IMPERSONATE_SUPER_ADMIN',
      });
    }

    const startAt = new Date();
    const expiresAt = new Date(startAt.getTime() + IMPERSONATION_CAP_MS);

    // Open the bracket in the database
    const log = await this.impersonationRepo.openBracket({
      adminId,
      impersonatedUserId: targetUserId,
      startAt,
    });

    // Write impersonation pair into session
    this.sessionCtx.setImpersonation(req, {
      realAdminId: adminId,
      impersonatedSubjectId: targetUserId,
      impersonationStartedAt: startAt.toISOString(),
    });

    // Audit: IMPERSONATION_START — actor is the real admin (not yet impersonating for attribution)
    await this.auditService.write({
      actorId: adminId,
      actingAdminId: null,
      viaImpersonationLogId: null,
      action: 'IMPERSONATION_START',
      targetType: 'ImpersonationLog',
      targetId: log.id,
      metadata: {
        impersonatedUserId: targetUserId,
        impersonatedUserRole: targetUser.role,
        expiresAt: expiresAt.toISOString(),
      },
    });

    this.logger.log(
      `[IMPERSONATION] SA ${adminId} started impersonating user ${targetUserId} (logId=${log.id})`,
    );

    // Build the subject's MeResponseDto (what the SA now sees)
    const actingAs: MeResponseDto = {
      id: targetUser.id,
      role: targetUser.role,
      email: targetUser.email,
      isChild: false,
      emailVerified: targetUser.emailVerified,
      mustChangePassword: targetUser.mustChangePassword,
      impersonatedBy: adminId,
    };

    return {
      impersonationLogId: log.id,
      actingAs,
      expiresAt: expiresAt.toISOString(),
    };
  }

  // ─── F4: POST /impersonation/exit ─────────────────────────────────────────

  /**
   * Exit impersonation — close the bracket, restore admin context.
   *
   * Auto-1h-cap enforcement: if the session impersonation pair is still open
   * but startedAt + 1h has passed, we auto-exit (lazy check on each request
   * while impersonating — callers call this when they detect the cap is exceeded).
   *
   * Returns the closed ImpersonationLog (bracket end view).
   */
  async exitImpersonation(
    req: Request,
    opts?: { autoExit?: boolean },
  ): Promise<{ ok: boolean; message: string; impersonationLogId?: string }> {
    const pair = this.sessionCtx.getImpersonation(req);
    if (!pair) {
      // Not currently impersonating — idempotent ok
      return { ok: true, message: 'Not impersonating' };
    }

    const { realAdminId, impersonatedSubjectId, impersonationStartedAt } = pair;
    const endAt = new Date();

    // Find the open bracket by matching admin + subject + null endAt
    // We find the most-recent open bracket for this pair.
    const openLog = await this.findOpenBracket(realAdminId, impersonatedSubjectId);

    if (openLog) {
      // Close the bracket
      await this.impersonationRepo.closeBracket(openLog.id, endAt);

      // Audit: IMPERSONATION_EXIT
      // While exiting we are still technically under impersonation, so we include
      // dual-actor attribution for the audit entry itself.
      await this.auditService.write({
        actorId: impersonatedSubjectId,
        actingAdminId: realAdminId,
        viaImpersonationLogId: openLog.id,
        action: opts?.autoExit ? 'IMPERSONATION_AUTO_EXIT_1H' : 'IMPERSONATION_EXIT',
        targetType: 'ImpersonationLog',
        targetId: openLog.id,
        metadata: {
          autoExit: opts?.autoExit ?? false,
          startedAt: impersonationStartedAt,
          endAt: endAt.toISOString(),
        },
      });

      this.logger.log(
        `[IMPERSONATION] SA ${realAdminId} exited impersonation of ${impersonatedSubjectId} ` +
        `(logId=${openLog.id}, autoExit=${opts?.autoExit ?? false})`,
      );
    }

    // Clear session pair regardless (even if no open bracket found — idempotent cleanup)
    this.sessionCtx.clearImpersonation(req);

    return {
      ok: true,
      message: opts?.autoExit ? 'Impersonation session expired (1h cap)' : 'Impersonation ended',
      impersonationLogId: openLog?.id,
    };
  }

  /**
   * F4: 1h hard-cap lazy check.
   *
   * Called by the controller before every impersonation-protected request.
   * If the session shows an impersonation pair that has exceeded the 1h cap,
   * auto-exit is triggered and the method returns true (caller should return 403).
   *
   * Design: lazy check on request (not scheduler) — simpler, no background job
   * needed. The cap is enforced the moment the next request arrives after expiry.
   */
  async checkAndEnforceCapIfNeeded(req: Request): Promise<boolean> {
    const pair = this.sessionCtx.getImpersonation(req);
    if (!pair) return false;

    const startedAt = new Date(pair.impersonationStartedAt);
    const now = new Date();
    if (now.getTime() - startedAt.getTime() >= IMPERSONATION_CAP_MS) {
      await this.exitImpersonation(req, { autoExit: true });
      return true; // cap was exceeded → session was auto-exited
    }
    return false;
  }

  // ─── F6: GET /impersonation/history ───────────────────────────────────────

  async getHistory(
    query: ImpersonationHistoryQueryDto,
  ): Promise<PaginatedImpersonationHistoryDto> {
    const { data, total } = await this.impersonationRepo.findPaginated(query);
    const { page, limit } = query;
    return {
      data: data.map((log) => this.toDto(log)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ─── F5: Dual-actor attribution helper (exposed for cross-module use) ───────

  /**
   * F5: Build dual-actor attribution context from the current request.
   *
   * When under impersonation:
   *   actorId        = impersonatedSubjectId (apparent actor)
   *   actingAdminId  = realAdminId
   *   viaImpersonationLogId = open bracket id (looked up from active log)
   *
   * When NOT under impersonation:
   *   actorId        = principalId
   *   actingAdminId  = null
   *   viaImpersonationLogId = null
   */
  async buildDualActorContext(
    req: Request,
    principalId: string,
  ): Promise<{
    actorId: string;
    actingAdminId: string | null;
    viaImpersonationLogId: string | null;
  }> {
    const pair = this.sessionCtx.getImpersonation(req);
    if (!pair) {
      return { actorId: principalId, actingAdminId: null, viaImpersonationLogId: null };
    }

    const openLog = await this.findOpenBracket(
      pair.realAdminId,
      pair.impersonatedSubjectId,
    );

    return {
      actorId: pair.impersonatedSubjectId,
      actingAdminId: pair.realAdminId,
      viaImpersonationLogId: openLog?.id ?? null,
    };
  }

  // ─── Internal helpers ──────────────────────────────────────────────────────

  /**
   * Find the most-recent open bracket for the given admin + subject pair.
   * Open = endAt IS NULL.
   */
  private async findOpenBracket(
    adminId: string,
    impersonatedUserId: string,
  ): Promise<ImpersonationLog | null> {
    // Use the TypeORM repository directly via the injected repo's internal
    // We expose this through the ImpersonationRepository.
    return this.impersonationRepo.findOpenBracket(adminId, impersonatedUserId);
  }

  private toDto(log: ImpersonationLog): ImpersonationLogDto {
    return {
      id: log.id,
      adminId: log.adminId,
      impersonatedUserId: log.impersonatedUserId,
      startAt: log.startAt.toISOString(),
      endAt: log.endAt ? log.endAt.toISOString() : undefined,
      durationSeconds: log.durationSeconds ?? undefined,
      createdAt: log.createdAt.toISOString(),
    };
  }
}
