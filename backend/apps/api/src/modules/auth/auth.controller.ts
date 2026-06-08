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
import { ApiTags, ApiCookieAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import 'express-session';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { SessionAuthGuard } from './guards/session-auth.guard';
import { LoginDto } from './dto/login.dto';
import { MeResponseDto } from './dto/me-response.dto';
import { SessionContextService } from './session-context.service';

type SessionRecord = Record<string, unknown>;

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionCtx: SessionContextService,
  ) {}

  /**
   * POST /auth/login — validate credentials via Passport local strategy,
   * store principal in session, return MeResponseDto.
   */
  @UseGuards(LocalAuthGuard)
  @Post('login')
  @HttpCode(200)
  login(@Req() req: Request, @Body() _dto: LoginDto): MeResponseDto {
    // req.user is set by Passport LocalStrategy.validate()
    const principal = (req as unknown as { user: ReturnType<typeof Object> }).user as Parameters<AuthService['login']>[1];
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
      session['csrfToken'] = this.generateToken();
    }
    return { token: session['csrfToken'] as string };
  }

  private generateToken(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 32; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}
