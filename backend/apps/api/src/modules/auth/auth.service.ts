import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import { SessionContextService } from './session-context.service';
import { SessionPrincipal } from './strategies/local.strategy';
import { MeResponseDto } from './dto/me-response.dto';
import { UserRole } from '../users/entities/user.entity';

@Injectable()
export class AuthService {
  constructor(private readonly sessionCtx: SessionContextService) {}

  /**
   * Sets the session principal after successful login.
   * Called by AuthController after the local guard validates credentials.
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
