import {
  Injectable,
  ConflictException,
  ForbiddenException,
  GoneException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { User, UserRole, UserStatus } from '../users/entities/user.entity';
import { PlayerProfile } from '../users/entities/player-profile.entity';
import { CoachProfile } from '../users/entities/coach-profile.entity';
import { TrainerPlayerAssociation, AssociationStatus } from './entities/trainer-player-association.entity';
import { ShareLinksService } from '../sharelinks/sharelinks.service';
import { ShareLinksRepository } from '../sharelinks/sharelinks.repository';
import { ShareLinkType } from '../sharelinks/entities/share-link.entity';
import { JoinViaLinkDto } from './dto/join-via-link.dto';
import { PasswordService } from '../../shared/crypto/password.service';
import { EmailService } from '../../shared/integrations/email/email.service';
import { PlayersRepository } from './players.repository';
import { UsersRepository } from '../users/users.repository';

export interface JoinContext {
  /** If set, this is an already-authenticated user joining via a share link. */
  principalId?: string;
  principalRole?: string;
  isChild?: boolean;
  parentUserId?: string;
}

export interface JoinResult {
  alreadyAssociated: boolean;
  userId: string;
  playerProfileId?: string;
  coachProfileId?: string;
}

@Injectable()
export class PlayersService {
  private readonly logger = new Logger(PlayersService.name);

  constructor(
    private readonly shareLinksService: ShareLinksService,
    private readonly shareLinksRepo: ShareLinksRepository,
    private readonly playersRepo: PlayersRepository,
    private readonly usersRepo: UsersRepository,
    private readonly passwordService: PasswordService,
    private readonly emailService: EmailService,
    private readonly dataSource: DataSource,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(PlayerProfile)
    private readonly playerProfileRepo: Repository<PlayerProfile>,
    @InjectRepository(CoachProfile)
    private readonly coachProfileRepo: Repository<CoachProfile>,
  ) {}

  /**
   * Process POST /join/:code — main join flow.
   *
   * Branch logic:
   *   1. Child block (FR-027) — if isChild=true → 403 + parent email
   *   2. UNIQUE link (coach invite) → coach acceptance flow
   *   3. STATIC link (player) + anonymous → new registration
   *   4. STATIC link (player) + logged-in → association only
   */
  async joinViaLink(
    code: string,
    dto: JoinViaLinkDto,
    ctx: JoinContext,
  ): Promise<JoinResult> {
    // Step 1: Validate and resolve the link (throws for LINK_NOT_FOUND/REVOKED/EXPIRED/USED)
    const link = await this.shareLinksService.resolveLink(code);

    // Step 2: Gate D — block child principals (FR-027)
    if (ctx.isChild) {
      // Send best-effort parent notification email
      if (ctx.parentUserId) {
        const parentUser = await this.usersRepo.findById(ctx.parentUserId);
        if (parentUser) {
          this.emailService.send({
            to: parentUser.email,
            subject: 'Your child attempted to join a trainer',
            text: `Your child tried to join a trainer via a share link. Trainer ID: ${link.trainerId}. If you want to enroll your child, please register yourself as the account holder.`,
            data: { trainerId: link.trainerId, linkCode: code },
          }).catch((err) => {
            this.logger.warn(`[EMAIL] Parent notification failed: ${(err as Error).message}`);
          });
        }
      }
      this.logger.warn(`[AUDIT] Child principal blocked from sharelink join: code=${code}`);
      throw new ForbiddenException({
        message: 'Child accounts cannot join via share link. A parent must register.',
        errorCode: 'CHILD_SHARELINK_BLOCKED',
      });
    }

    // Step 3: Route based on link type
    if (link.type === ShareLinkType.UNIQUE) {
      return this.handleCoachAcceptance(link, dto, ctx, code);
    } else {
      return this.handlePlayerJoin(link, dto, ctx, code);
    }
  }

  /**
   * Handle STATIC link player join:
   *   - Anonymous: create User + PlayerProfile + association atomically
   *   - Logged-in PLAYER: create association only (BR-005)
   */
  private async handlePlayerJoin(
    link: { id: string; trainerId: string; type: ShareLinkType },
    dto: JoinViaLinkDto,
    ctx: JoinContext,
    code: string,
  ): Promise<JoinResult> {
    if (ctx.principalId) {
      // Logged-in player — association only
      return this.associateExistingPlayer(link, ctx.principalId, code);
    } else {
      // Anonymous — full registration
      return this.registerNewPlayer(link, dto, code);
    }
  }

  /**
   * Register a new anonymous player via a static share link.
   * Atomic: User + PlayerProfile + association in one transaction.
   */
  private async registerNewPlayer(
    link: { id: string; trainerId: string; type: ShareLinkType },
    dto: JoinViaLinkDto,
    code: string,
  ): Promise<JoinResult> {
    // Validate required fields for anonymous registration
    if (!dto.email || !dto.password || !dto.playerName) {
      throw new ConflictException({
        message: 'email, password, and playerName are required for anonymous registration',
        errorCode: 'VALIDATION_ERROR',
      });
    }

    // Check for duplicate email before beginning the transaction
    const existing = await this.usersRepo.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException({
        message: 'Email already in use',
        errorCode: 'EMAIL_EXISTS',
      });
    }

    const passwordHash = await this.passwordService.hash(dto.password);

    const { userId, playerProfileId } = await this.dataSource.transaction(async (em) => {
      // Create user
      const user = await em.save(User, em.create(User, {
        email: dto.email,
        passwordHash,
        role: UserRole.PLAYER,
        status: UserStatus.ACTIVE,
        emailVerified: false,
      }));

      // Create player profile
      const profile = await em.save(PlayerProfile, em.create(PlayerProfile, {
        userId: user.id,
        name: dto.playerName,
        age: dto.age ?? null,
        gender: dto.gender ?? null,
      }));

      // Create association
      await em.save(TrainerPlayerAssociation, em.create(TrainerPlayerAssociation, {
        trainerId: link.trainerId,
        playerProfileId: profile.id,
        viaShareLinkId: link.id,
        status: AssociationStatus.ACTIVE,
      }));

      return { userId: user.id, playerProfileId: profile.id };
    });

    // Best-effort static link use count increment (analytics only, never blocks join)
    this.shareLinksRepo.incrementUseCountBestEffort(link.id).catch((err) => {
      this.logger.warn(`[ANALYTICS] Failed to increment use_count for link ${link.id}: ${(err as Error).message}`);
    });

    return { alreadyAssociated: false, userId, playerProfileId };
  }

  /**
   * Associate an already-logged-in player to a trainer via a static share link.
   * BR-005: no-duplicate; reactivates REMOVED associations.
   */
  private async associateExistingPlayer(
    link: { id: string; trainerId: string; type: ShareLinkType },
    userId: string,
    code: string,
  ): Promise<JoinResult> {
    const profile = await this.playerProfileRepo.findOne({ where: { userId } });
    if (!profile) {
      throw new ConflictException({ message: 'Player profile not found', errorCode: 'PROFILE_NOT_FOUND' });
    }

    const existing = await this.playersRepo.findAssociation(link.trainerId, profile.id);

    if (existing) {
      if (existing.status === AssociationStatus.ACTIVE) {
        // BR-005: already associated — no-op
        return { alreadyAssociated: true, userId, playerProfileId: profile.id };
      }
      // Reactivate REMOVED association
      existing.status = AssociationStatus.ACTIVE;
      existing.viaShareLinkId = link.id;
      await this.playersRepo.saveAssociation(existing);

      // Best-effort static link increment
      this.shareLinksRepo.incrementUseCountBestEffort(link.id).catch((err) => {
        this.logger.warn(`[ANALYTICS] Failed to increment use_count: ${(err as Error).message}`);
      });

      return { alreadyAssociated: false, userId, playerProfileId: profile.id };
    }

    // New association — catch unique violation race (BR-005)
    try {
      await this.playersRepo.saveAssociation({
        trainerId: link.trainerId,
        playerProfileId: profile.id,
        viaShareLinkId: link.id,
        status: AssociationStatus.ACTIVE,
      });

      // Best-effort static link increment
      this.shareLinksRepo.incrementUseCountBestEffort(link.id).catch((err) => {
        this.logger.warn(`[ANALYTICS] Failed to increment use_count: ${(err as Error).message}`);
      });

      return { alreadyAssociated: false, userId, playerProfileId: profile.id };
    } catch (err: any) {
      if (err?.code === '23505') {
        // Race condition: another request inserted the association — treat as already associated
        return { alreadyAssociated: true, userId, playerProfileId: profile.id };
      }
      throw err;
    }
  }

  /**
   * Handle UNIQUE link (coach invite) acceptance.
   * Atomic: consume the link + create User (if anonymous) + create/link CoachProfile
   * all in ONE transaction. If consume fails, the whole tx rolls back — no orphan users.
   * BR-006: coach can only be ACTIVE under one trainer at a time.
   */
  private async handleCoachAcceptance(
    link: { id: string; trainerId: string; type: ShareLinkType },
    dto: JoinViaLinkDto,
    ctx: JoinContext,
    code: string,
  ): Promise<JoinResult> {
    // Pre-hash password outside tx (expensive, avoid repeating inside tx)
    let passwordHash: string | undefined;
    let existingUserId: string | undefined;

    if (!ctx.principalId) {
      // Anonymous: check if email already exists
      const existingUser = await this.usersRepo.findByEmail(dto.email!);
      if (existingUser) {
        existingUserId = existingUser.id;
      } else {
        if (!dto.password) {
          throw new ConflictException({ message: 'password is required', errorCode: 'VALIDATION_ERROR' });
        }
        passwordHash = await this.passwordService.hash(dto.password);
      }
    }

    // Pre-check BR-006 for existing users (before entering tx, fast path)
    const checkUserId = ctx.principalId ?? existingUserId;
    if (checkUserId) {
      const existingCoachProfile = await this.coachProfileRepo.findOne({ where: { userId: checkUserId } });
      if (existingCoachProfile && existingCoachProfile.trainerId !== link.trainerId) {
        throw new ConflictException({
          message: 'Coach is already active under another trainer',
          errorCode: 'COACH_ALREADY_ACTIVE_ELSEWHERE',
        });
      }
    }

    // Atomic: consume link + (create user if anonymous) + create/update CoachProfile
    const { userId, coachProfileId } = await this.dataSource.transaction(async (em) => {
      // Step 1: Atomic single-use consume (C9): conditional UPDATE where use_count < max_uses
      const consumed = await this.shareLinksRepo.consumeUnique(em, code);
      if (!consumed) {
        throw new GoneException({
          message: 'Link has already been used',
          errorCode: 'LINK_USED',
        });
      }

      // Step 2: Resolve user ID (create new user if anonymous)
      let resolvedUserId: string;
      if (ctx.principalId) {
        resolvedUserId = ctx.principalId;
      } else if (existingUserId) {
        resolvedUserId = existingUserId;
      } else {
        // Create new coach user inside the transaction (atomic with consume)
        const newUser = await em.save(User, em.create(User, {
          email: dto.email!,
          passwordHash: passwordHash!,
          role: UserRole.COACH,
          status: UserStatus.ACTIVE,
          emailVerified: false,
        }));
        resolvedUserId = newUser.id;
      }

      // Step 3: BR-006 re-check inside tx for newly-created users (race safety)
      const coachProfileInTx = await em.findOne(CoachProfile, { where: { userId: resolvedUserId } });
      if (coachProfileInTx && coachProfileInTx.trainerId !== link.trainerId) {
        throw new ConflictException({
          message: 'Coach is already active under another trainer',
          errorCode: 'COACH_ALREADY_ACTIVE_ELSEWHERE',
        });
      }

      // Step 4: Create or update CoachProfile
      let profileId: string;
      if (coachProfileInTx) {
        coachProfileInTx.trainerId = link.trainerId;
        await em.save(CoachProfile, coachProfileInTx);
        profileId = coachProfileInTx.id;
      } else {
        const profile = await em.save(CoachProfile, em.create(CoachProfile, {
          userId: resolvedUserId,
          trainerId: link.trainerId,
        }));
        profileId = profile.id;
      }

      return { userId: resolvedUserId, coachProfileId: profileId };
    });

    return { alreadyAssociated: false, userId, coachProfileId };
  }
}
