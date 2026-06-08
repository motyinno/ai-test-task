import { Injectable, BadRequestException, UnauthorizedException, Logger } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, IsNull } from 'typeorm';
import { Request } from 'express';
import * as crypto from 'crypto';
import { SessionContextService } from './session-context.service';
import { SessionPrincipal } from './strategies/local.strategy';
import { MeResponseDto } from './dto/me-response.dto';
import { User, UserRole } from '../users/entities/user.entity';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { EmailVerificationToken } from './entities/email-verification-token.entity';
import { PasswordService } from '../../shared/crypto/password.service';
import { EmailService } from '../../shared/integrations/email/email.service';

const ONE_HOUR_MS = 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * ONE_HOUR_MS;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly sessionCtx: SessionContextService,
    private readonly passwordService: PasswordService,
    private readonly emailService: EmailService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(PasswordResetToken)
    private readonly resetTokenRepo: Repository<PasswordResetToken>,
    @InjectRepository(EmailVerificationToken)
    private readonly verifyTokenRepo: Repository<EmailVerificationToken>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Sets the session principal after successful login.
   * H1: Regenerates the session ID before writing the principal to prevent
   * session fixation attacks. Also rotates the CSRF token on auth-state change.
   */
  login(req: Request, principal: SessionPrincipal): Promise<MeResponseDto> {
    return new Promise((resolve, reject) => {
      req.session.regenerate((err) => {
        if (err) {
          reject(err);
          return;
        }
        // Write principal and fresh CSRF token into the new session
        this.sessionCtx.setPrincipal(req, principal);
        // Rotate CSRF token on auth-state change (H1)
        (req.session as unknown as Record<string, unknown>)['csrfToken'] =
          crypto.randomBytes(24).toString('base64url');
        req.session.save((saveErr) => {
          if (saveErr) {
            reject(saveErr);
            return;
          }
          resolve(this.buildMeResponse(principal, req));
        });
      });
    });
  }

  async logout(req: Request): Promise<void> {
    await this.sessionCtx.destroySession(req);
  }

  getMe(req: Request): MeResponseDto {
    const principal = this.sessionCtx.getPrincipal(req);
    if (!principal) {
      throw new UnauthorizedException('Not authenticated');
    }
    return this.buildMeResponse(principal, req);
  }

  /**
   * A16: Request password reset — always 204 (no enumeration).
   */
  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user) {
      // No enumeration — silently return
      return;
    }

    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + ONE_HOUR_MS);

    const record = this.resetTokenRepo.create({
      token,
      userId: user.id,
      expiresAt,
      usedAt: null,
    });
    await this.resetTokenRepo.save(record);

    await this.emailService.send({
      to: email,
      subject: 'Password Reset Request',
      text: `Your password reset token is: ${token} (expires in 1 hour)`,
      data: { token, expiresAt },
    });
  }

  /**
   * A16: Confirm password reset with token.
   * H3: Atomic single-use consumption — UPDATE ... WHERE usedAt IS NULL to prevent
   * race conditions. Only proceeds if exactly 1 row was affected.
   * H4: Invalidates all existing sessions for the user after password reset.
   */
  async confirmPasswordReset(token: string, newPassword: string): Promise<void> {
    // First verify the token exists and is valid (for error reporting)
    const record = await this.resetTokenRepo.findOne({ where: { token } });

    if (!record) {
      throw new BadRequestException({
        message: 'Token is invalid',
        errorCode: 'TOKEN_INVALID',
      });
    }

    if (record.usedAt) {
      throw new BadRequestException({
        message: 'Token has already been used',
        errorCode: 'TOKEN_USED',
      });
    }

    if (record.expiresAt < new Date()) {
      throw new BadRequestException({
        message: 'Token has expired',
        errorCode: 'TOKEN_EXPIRED',
      });
    }

    // H3: Atomic consumption — conditional UPDATE WHERE usedAt IS NULL
    // Prevents race: two concurrent requests for the same token can only get 1 success.
    const consumeResult = await this.resetTokenRepo.update(
      { id: record.id, usedAt: IsNull() },
      { usedAt: new Date() },
    );

    if (!consumeResult.affected || consumeResult.affected === 0) {
      // Another request already consumed this token concurrently
      throw new BadRequestException({
        message: 'Token has already been used',
        errorCode: 'TOKEN_USED',
      });
    }

    const newHash = await this.passwordService.hash(newPassword);
    await this.userRepo.update(record.userId, {
      passwordHash: newHash,
      mustChangePassword: false,
    });

    // H4: Invalidate all existing sessions for this user
    await this.invalidateUserSessions(record.userId);
  }

  /**
   * A17: Verify email with token (non-blocking).
   * H3: Atomic single-use consumption to prevent race conditions.
   */
  async verifyEmail(token: string): Promise<void> {
    const record = await this.verifyTokenRepo.findOne({ where: { token } });

    if (!record) {
      throw new BadRequestException({
        message: 'Token is invalid',
        errorCode: 'TOKEN_INVALID',
      });
    }

    if (record.usedAt) {
      throw new BadRequestException({
        message: 'Token has already been used',
        errorCode: 'TOKEN_USED',
      });
    }

    if (record.expiresAt < new Date()) {
      throw new BadRequestException({
        message: 'Token has expired',
        errorCode: 'TOKEN_EXPIRED',
      });
    }

    // H3: Atomic consumption — conditional UPDATE WHERE usedAt IS NULL
    const consumeResult = await this.verifyTokenRepo.update(
      { id: record.id, usedAt: IsNull() },
      { usedAt: new Date() },
    );

    if (!consumeResult.affected || consumeResult.affected === 0) {
      throw new BadRequestException({
        message: 'Token has already been used',
        errorCode: 'TOKEN_USED',
      });
    }

    await this.userRepo.update(record.userId, { emailVerified: true });
  }

  /**
   * A17: Send email verification (resend).
   */
  async sendVerificationEmail(userId: string, email: string): Promise<void> {
    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + TWENTY_FOUR_HOURS_MS);

    const record = this.verifyTokenRepo.create({
      token,
      userId,
      expiresAt,
      usedAt: null,
    });
    await this.verifyTokenRepo.save(record);

    await this.emailService.send({
      to: email,
      subject: 'Verify Your Email',
      text: `Your email verification token is: ${token} (expires in 24 hours)`,
      data: { token, expiresAt },
    });
  }

  /**
   * A17: First-login forced password change.
   * H4: Invalidates all existing sessions for the user after password change.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    currentReq?: Request,
  ): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException({ message: 'User not found', errorCode: 'USER_NOT_FOUND' });
    }

    const isValid = await this.passwordService.verify(user.passwordHash, currentPassword);
    if (!isValid) {
      throw new BadRequestException({
        message: 'Current password is incorrect',
        errorCode: 'INVALID_CURRENT_PASSWORD',
      });
    }

    const newHash = await this.passwordService.hash(newPassword);
    await this.userRepo.update(userId, {
      passwordHash: newHash,
      mustChangePassword: false,
    });

    // H4: Invalidate all existing sessions for this user
    await this.invalidateUserSessions(userId, currentReq);
  }

  /**
   * H4: Delete all Postgres session store rows where the session JSON contains
   * the given userId in `principal.id`.
   *
   * connect-pg-simple stores sessions as JSON in the `sess` column.
   * We use a JSONB cast to efficiently match by principal.id.
   *
   * If the sessions table does not exist yet (test env with synchronize=true
   * on a fresh DB), we log a warning and continue rather than crashing.
   *
   * @param excludeCurrentSessionId - If provided, the current request's session
   *   is NOT deleted so the caller can still send a response (optional: callers
   *   that want to log the user out immediately should pass undefined).
   */
  async invalidateUserSessions(userId: string, currentReq?: Request): Promise<void> {
    try {
      const excludeSid = currentReq?.session?.id;
      const params: unknown[] = [userId];
      let query = `DELETE FROM sessions WHERE sess->'principal'->>'id' = $1`;
      if (excludeSid) {
        params.push(excludeSid);
        query += ` AND sid != $2`;
      }
      await this.dataSource.query(query, params);
    } catch (err) {
      // Log but do not throw — session invalidation failure is a security degradation
      // but not a fatal error for the password change operation itself.
      this.logger.warn(`Failed to invalidate sessions for user ${userId}: ${String(err)}`);
    }
  }

  private buildMeResponse(principal: SessionPrincipal, req: Request): MeResponseDto {
    const activeContext = this.sessionCtx.getActiveContext(req);
    const impersonation = this.sessionCtx.getImpersonation(req);

    return {
      id: principal.id,
      role: principal.role as UserRole,
      email: principal.email,
      isChild: false,
      emailVerified: principal.emailVerified,
      mustChangePassword: principal.mustChangePassword,
      impersonatedBy: impersonation?.realAdminId,
      activeContext: activeContext
        ? {
            profileId: activeContext.profileId,
            trainerId: activeContext.trainerId,
            label: activeContext.label,
          }
        : undefined,
    };
  }
}
