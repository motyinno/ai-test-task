import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiCookieAuth, ApiOperation } from '@nestjs/swagger';
import type { Request } from 'express';
import { Roles } from '../../shared/authz/roles.decorator';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { ImpersonationService } from './impersonation.service';
import {
  StartImpersonationResponseDto,
  ImpersonationHistoryQueryDto,
  PaginatedImpersonationHistoryDto,
} from './dto/impersonation.dto';

type SessionRecord = Record<string, unknown>;

/**
 * ImpersonationController (F3/F4/F6)
 *
 * All routes require:
 *   - Authenticated session (@UseGuards(SessionAuthGuard))
 *   - SUPER_ADMIN role (@Roles('SUPER_ADMIN'))
 *
 * Route ordering matters in NestJS for /impersonation/:userId vs /impersonation/exit —
 * the literal path /impersonation/exit is declared BEFORE the parameterised route
 * so that "exit" is not incorrectly matched as a :userId.
 */
@ApiTags('impersonation')
@ApiCookieAuth('session')
@UseGuards(SessionAuthGuard)
@Roles('SUPER_ADMIN')
@Controller('impersonation')
export class ImpersonationController {
  constructor(private readonly impersonationService: ImpersonationService) {}

  /**
   * POST /impersonation/exit — end the active impersonation session (F4).
   *
   * Must be declared BEFORE /:userId to avoid NestJS routing the literal
   * string "exit" as a userId parameter.
   *
   * 1h auto-cap: if the cap is already exceeded when this endpoint is called,
   * it is treated as an auto-exit (same result, flag in audit).
   */
  @Post('exit')
  @HttpCode(200)
  @ApiOperation({ summary: 'Exit impersonation, restore admin session' })
  async exitImpersonation(
    @Req() req: Request,
  ): Promise<{ ok: boolean; message: string; impersonationLogId?: string }> {
    const principal = this.getSessionPrincipal(req);
    if (!principal) throw new UnauthorizedException('Not authenticated');

    // Check and enforce 1h cap on exit request too (no-op if not expired)
    return this.impersonationService.exitImpersonation(req);
  }

  /**
   * POST /impersonation/:userId — begin impersonating a user (F3).
   *
   * Returns 201 with StartImpersonationResponseDto.
   * 403 CANNOT_IMPERSONATE_SUPER_ADMIN if target is a SUPER_ADMIN (SEC-008).
   * 404 USER_NOT_FOUND if the target does not exist.
   *
   * F4 lazy 1h cap: if the SA is already impersonating someone and their session
   * is past the 1h cap, auto-exit is triggered first and a 403 is returned.
   */
  @Post(':userId')
  @HttpCode(201)
  @ApiOperation({ summary: 'Start impersonating a user (SUPER_ADMIN only)' })
  async startImpersonation(
    @Req() req: Request,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ): Promise<StartImpersonationResponseDto> {
    const principal = this.getSessionPrincipal(req);
    if (!principal) throw new UnauthorizedException('Not authenticated');

    // F4 lazy cap: enforce 1h cap before allowing a new impersonation start
    const wasExpired = await this.impersonationService.checkAndEnforceCapIfNeeded(req);
    if (wasExpired) {
      throw new ForbiddenException({
        message: 'Previous impersonation session expired (1h cap). Session cleared.',
        errorCode: 'IMPERSONATION_EXPIRED',
      });
    }

    return this.impersonationService.startImpersonation(req, principal.id, userId);
  }

  /**
   * GET /impersonation/history — paginated audit report (F6).
   *
   * Query params: page, limit, adminId, impersonatedUserId.
   * Returns { data: ImpersonationLogDto[], meta: { page, limit, total, totalPages } }.
   */
  @Get('history')
  @ApiOperation({ summary: 'Paginated impersonation history (SUPER_ADMIN only)' })
  async getHistory(
    @Query() query: ImpersonationHistoryQueryDto,
  ): Promise<PaginatedImpersonationHistoryDto> {
    return this.impersonationService.getHistory(query);
  }

  // ─── Internal helpers ────────────────────────────────────────────────────

  private getSessionPrincipal(req: Request): { id: string; role: string } | undefined {
    const session = req.session as unknown as SessionRecord;
    return session['principal'] as { id: string; role: string } | undefined;
  }
}
