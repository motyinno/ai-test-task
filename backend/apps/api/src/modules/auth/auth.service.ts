import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
  ) {}

  /**
   * Sets the session principal after successful login.
   */
  login(req: Request, principal: SessionPrincipal): MeResponseDto {
    this.sessionCtx.setPrincipal(req, principal);
    return this.buildMeResponse(principal, req);
  }

  async logout(req: Request): Promise<void> {
    await this.sessionCtx.destroySession(req);
  }

  getMe(req: Request): MeResponseDto {
    const principal = this.sessionCtx.getPrincipal(req);
    if (!principal) {
      throw new Error('Not authenticated');
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
   */
  async confirmPasswordReset(token: string, newPassword: string): Promise<void> {
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

    const newHash = await this.passwordService.hash(newPassword);
    await this.userRepo.update(record.userId, {
      passwordHash: newHash,
      mustChangePassword: false,
    });

    // Mark token as used
    await this.resetTokenRepo.update(record.id, { usedAt: new Date() });
  }

  /**
   * A17: Verify email with token (non-blocking).
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

    await this.userRepo.update(record.userId, { emailVerified: true });
    await this.verifyTokenRepo.update(record.id, { usedAt: new Date() });
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
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
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
