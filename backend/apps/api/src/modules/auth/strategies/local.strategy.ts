import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole, UserStatus } from '../../users/entities/user.entity';
import { PasswordService } from '../../../shared/crypto/password.service';
import { ChildLogin } from '../../child-account/entities/child-login.entity';
import { PlayerProfile } from '../../users/entities/player-profile.entity';

export interface SessionPrincipal {
  id: string;
  email: string;
  role: string;
  status: UserStatus | string;
  emailVerified: boolean;
  mustChangePassword: boolean;
  /** For TRAINER role: the trainer's own userId is their org scope. */
  trainerId?: string;
  /** True for child sub-login principals (D5). */
  isChild?: boolean;
  /** Parent account UUID when isChild = true. */
  parentUserId?: string;
  /** Child profile UUID when isChild = true. */
  childProfileId?: string;
}

/**
 * CHILD_USERNAME_PREFIX — sentinel prefix in the "email" field of LoginDto
 * that routes the authentication to child sub-login resolution (D5).
 *
 * Frontend sends: email = "child:<childUsername>", password = <child password>
 * This avoids changing the Passport strategy interface.
 */
export const CHILD_USERNAME_PREFIX = 'child:';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(ChildLogin)
    private readonly childLoginRepo: Repository<ChildLogin>,
    @InjectRepository(PlayerProfile)
    private readonly playerProfileRepo: Repository<PlayerProfile>,
    private readonly passwordService: PasswordService,
  ) {
    super({ usernameField: 'email' });
  }

  async validate(email: string, password: string): Promise<SessionPrincipal> {
    // D5: Route child sub-login authentication
    if (email.startsWith(CHILD_USERNAME_PREFIX)) {
      const childUsername = email.slice(CHILD_USERNAME_PREFIX.length);
      return this.validateChildLogin(childUsername, password);
    }

    // Standard user login
    const user = await this.userRepo.findOne({ where: { email } });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValid = await this.passwordService.verify(user.passwordHash, password);
    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status === UserStatus.INACTIVE || user.status === UserStatus.DELETED) {
      throw new UnauthorizedException({
        message: 'Account is deactivated',
        errorCode: 'ACCOUNT_DEACTIVATED',
      });
    }

    const principal: SessionPrincipal = {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      emailVerified: user.emailVerified,
      mustChangePassword: user.mustChangePassword,
    };

    // For TRAINER: the trainer's own userId is the org scope (trainerId = userId).
    // TenantMiddleware reads trainerId from the session principal.
    if (user.role === UserRole.TRAINER) {
      principal.trainerId = user.id;
    }

    return principal;
  }

  /**
   * D5: Validate child sub-login credentials.
   * Returns a constrained SessionPrincipal with isChild=true.
   * The CASL AbilityFactory uses isChild=true to enforce child constraints (D6/A15).
   */
  private async validateChildLogin(
    childUsername: string,
    password: string,
  ): Promise<SessionPrincipal> {
    const childLogin = await this.childLoginRepo.findOne({
      where: { childUsername, isActive: true },
    });

    if (!childLogin) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValid = await this.passwordService.verify(childLogin.passwordHash, password);
    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify the associated profile exists
    const profile = await this.playerProfileRepo.findOne({
      where: { id: childLogin.childProfileId },
    });

    if (!profile) {
      throw new UnauthorizedException('Child account misconfigured');
    }

    // Return constrained child principal
    return {
      id: `child:${childLogin.childProfileId}`,
      email: `child-${childLogin.childProfileId}@child.local`,
      role: 'PLAYER',
      status: 'ACTIVE',
      emailVerified: true,
      mustChangePassword: false,
      isChild: true,
      parentUserId: childLogin.parentUserId,
      childProfileId: childLogin.childProfileId,
    };
  }
}
