import {
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChildLogin } from './entities/child-login.entity';
import { PlayerProfile } from '../users/entities/player-profile.entity';
import { PasswordService } from '../../shared/crypto/password.service';

export interface ChildPrincipal {
  /** Virtual ID used in session: the child-profile UUID prefixed with "child:" */
  id: string;
  role: string;
  isChild: boolean;
  parentUserId: string;
  childProfileId: string;
  tokenSpendAllowed: boolean;
  email: string;
  emailVerified: boolean;
  mustChangePassword: boolean;
  status: string;
}

/**
 * ChildAccountService — D5.
 *
 * Handles child sub-login authentication.
 * A child authenticates with childUsername + password; on success, a constrained
 * principal is established in the session (isChild=true, parentUserId set).
 *
 * This is NOT a Passport strategy — child login hits the same POST /auth/login
 * endpoint with a flag or the LocalStrategy checks for child credentials.
 * For Phase D we expose validateChildCredentials() for integration into the
 * existing auth flow (LocalStrategy extended or AuthController branching).
 */
@Injectable()
export class ChildAccountService {
  private readonly logger = new Logger(ChildAccountService.name);

  constructor(
    @InjectRepository(ChildLogin)
    private readonly childLoginRepo: Repository<ChildLogin>,
    @InjectRepository(PlayerProfile)
    private readonly playerProfileRepo: Repository<PlayerProfile>,
    private readonly passwordService: PasswordService,
  ) {}

  /**
   * Validate child credentials (childUsername + password).
   * Returns a constrained ChildPrincipal on success, throws UnauthorizedException otherwise.
   *
   * D5: The child principal carries isChild=true and parentUserId — the CASL AbilityFactory
   * uses isChild=true to enforce child constraints (D6/A15).
   */
  async validateChildCredentials(
    childUsername: string,
    password: string,
  ): Promise<ChildPrincipal> {
    const childLogin = await this.childLoginRepo.findOne({
      where: { childUsername, isActive: true },
    });

    if (!childLogin) {
      throw new UnauthorizedException('Invalid child credentials');
    }

    const isValid = await this.passwordService.verify(childLogin.passwordHash, password);
    if (!isValid) {
      throw new UnauthorizedException('Invalid child credentials');
    }

    const profile = await this.playerProfileRepo.findOne({
      where: { id: childLogin.childProfileId },
    });

    if (!profile) {
      this.logger.warn(`[D5] ChildLogin ${childLogin.id} has no matching PlayerProfile — disabling`);
      throw new UnauthorizedException('Child account misconfigured');
    }

    return {
      id: `child:${childLogin.childProfileId}`,
      role: 'PLAYER',
      isChild: true,
      parentUserId: childLogin.parentUserId,
      childProfileId: childLogin.childProfileId,
      tokenSpendAllowed: childLogin.tokenSpendAllowed,
      email: `child-${childLogin.childProfileId}@child.local`, // virtual email for session
      emailVerified: true,
      mustChangePassword: false,
      status: 'ACTIVE',
    };
  }

  async findChildLogin(childProfileId: string): Promise<ChildLogin | null> {
    return this.childLoginRepo.findOne({ where: { childProfileId } });
  }
}
