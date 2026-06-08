import {
  Controller,
  Post,
  Get,
  UseGuards,
  Req,
  Body,
  HttpCode,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiCookieAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import 'express-session';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { SessionAuthGuard } from './guards/session-auth.guard';
import { LoginDto } from './dto/login.dto';
import { MeResponseDto } from './dto/me-response.dto';
import { SessionContextService } from './session-context.service';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ConfirmPasswordResetDto } from './dto/confirm-password-reset.dto';

type SessionRecord = Record<string, unknown>;

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionCtx: SessionContextService,
  ) {}

  /**
   * POST /auth/login — validate credentials, create session, return MeResponseDto.
   * Rate limited: 5 attempts per minute per IP (SEC-004).
   */
  @Throttle({ default: { ttl: 60_000, limit: process.env['NODE_ENV'] === 'test' ? 10000 : 5 } })
  @UseGuards(LocalAuthGuard)
  @Post('login')
  @HttpCode(200)
  login(@Req() req: Request, @Body() _dto: LoginDto): MeResponseDto {
    const principal = (req as unknown as { user: Parameters<AuthService['login']>[1] }).user;
    return this.authService.login(req, principal);
  }

  /**
   * POST /auth/logout — destroy the session.
   */
  @UseGuards(SessionAuthGuard)
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request): Promise<{ ok: boolean }> {
    await this.authService.logout(req);
    return { ok: true };
  }

  /**
   * GET /auth/me — return the current principal from session.
   */
  @ApiCookieAuth('session')
  @UseGuards(SessionAuthGuard)
  @Get('me')
  me(@Req() req: Request): MeResponseDto {
    const session = req.session as unknown as SessionRecord;
    const principal = session['principal'];
    if (!principal) {
      throw new UnauthorizedException('Not authenticated');
    }
    return this.authService.getMe(req);
  }

  /**
   * GET /auth/csrf — mint a CSRF token (A12).
   */
  @Get('csrf')
  getCsrfToken(@Req() req: Request): { token: string } {
    const session = req.session as unknown as SessionRecord;
    if (!session['csrfToken']) {
      session['csrfToken'] = crypto.randomBytes(24).toString('base64url');
    }
    return { token: session['csrfToken'] as string };
  }

  /**
   * POST /auth/password-reset — request reset email (always 204, no enumeration).
   */
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @Post('password-reset')
  @HttpCode(204)
  async requestPasswordReset(@Body() dto: RequestPasswordResetDto): Promise<void> {
    await this.authService.requestPasswordReset(dto.email);
  }

  /**
   * POST /auth/password-reset/confirm — confirm with token, set new password.
   */
  @Post('password-reset/confirm')
  @HttpCode(200)
  async confirmPasswordReset(@Body() dto: ConfirmPasswordResetDto): Promise<{ ok: boolean }> {
    await this.authService.confirmPasswordReset(dto.token, dto.newPassword);
    return { ok: true };
  }

  /**
   * POST /auth/verify-email — confirm email via token (non-blocking, 24h).
   */
  @Post('verify-email')
  @HttpCode(200)
  async verifyEmail(@Body() body: { token: string }): Promise<{ ok: boolean }> {
    await this.authService.verifyEmail(body.token);
    return { ok: true };
  }

  /**
   * POST /auth/verify-email/resend — resend verification email.
   */
  @UseGuards(SessionAuthGuard)
  @Post('verify-email/resend')
  @HttpCode(200)
  async resendVerification(@Req() req: Request): Promise<{ ok: boolean }> {
    const session = req.session as unknown as SessionRecord;
    const principal = session['principal'] as { id: string; email: string } | undefined;
    if (!principal) throw new UnauthorizedException();
    await this.authService.sendVerificationEmail(principal.id, principal.email);
    return { ok: true };
  }

  /**
   * POST /auth/first-login/change-password — forced password change (FR-006).
   */
  @UseGuards(SessionAuthGuard)
  @Post('first-login/change-password')
  @HttpCode(200)
  async changePassword(
    @Req() req: Request,
    @Body() body: { currentPassword: string; newPassword: string },
  ): Promise<{ ok: boolean }> {
    const session = req.session as unknown as SessionRecord;
    const principal = session['principal'] as { id: string } | undefined;
    if (!principal) throw new UnauthorizedException();
    await this.authService.changePassword(principal.id, body.currentPassword, body.newPassword);
    return { ok: true };
  }
}
