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

/**
 * Session data returned from joinViaLink for new registrations.
 * Used by PlayersController to establish the session without bracket-accessing
 * private service internals (M-3 fix).
 */
export interface NewPrincipalSession {
  id: string;
  email: string;
  role: string;
  status: string;
  emailVerified: boolean;
  mustChangePassword: boolean;
}

export interface JoinResult {
  alreadyAssociated: boolean;
  userId: string;
  playerProfileId?: string;
  coachProfileId?: string;
  /** Set for new anonymous registrations — used by controller to establish session (M-3). */
  newPrincipal?: NewPrincipalSession;
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
    // Step 1: Gate D — block child principals BEFORE link resolution (FR-027).
    // Child block must fire regardless of link validity so a child can never
    // consume a link even if they somehow know a valid code.
    if (ctx.isChild) {
      // Send best-effort parent notification email
      if (ctx.parentUserId) {
        const parentUser = await this.usersRepo.findById(ctx.parentUserId);
        if (parentUser) {
          this.emailService.send({
            to: parentUser.email,
            subject: 'Your child attempted to join a trainer',
            text: `Your child tried to join a trainer via a share link (code: ${code}). Please register on their behalf.`,
            data: { linkCode: code },
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

    // Step 2: Validate and resolve the link (throws for LINK_NOT_FOUND/REVOKED/EXPIRED/USED)
    const link = await this.shareLinksService.resolveLink(code);

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
    // Note: missing fields result in 409 VALIDATION_ERROR here; ideally these should be
    // caught at DTO validation level (class-validator) for a 400 response.
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

    const { userId, playerProfileId, newPrincipal } = await this.dataSource.transaction(async (em) => {
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

      return {
        userId: user.id,
        playerProfileId: profile.id,
        // Return session data inline to avoid needing a second DB query in the controller (M-3)
        newPrincipal: {
          id: user.id,
          email: user.email,
          role: user.role,
          status: user.status,
          emailVerified: user.emailVerified,
          mustChangePassword: user.mustChangePassword,
        } as NewPrincipalSession,
      };
    });

    // Best-effort static link use count increment (analytics only, never blocks join)
    // NOTE: intentionally unscoped and fire-and-forget — do NOT move into the tx above.
    this.shareLinksRepo.incrementUseCountBestEffort(link.id).catch((err) => {
      this.logger.warn(`[ANALYTICS] Failed to increment use_count for link ${link.id}: ${(err as Error).message}`);
    });

    return { alreadyAssociated: false, userId, playerProfileId, newPrincipal };
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
      // NOTE: intentionally unscoped and fire-and-forget — do NOT move into the tx.
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
      // NOTE: intentionally unscoped and fire-and-forget — do NOT move into the tx.
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
   *
   * M-4: UNIQUE (coach) links may only be accepted by the intended invitee.
   * A logged-in principal whose role/email doesn't match the invite target is rejected.
   *
   * M-1: concurrent accept race — if two requests race on a brand-new coach (no existing
   * CoachProfile), both see null and both try to INSERT. One wins; the other gets a raw
   * Postgres 23505 unique violation (coach_profiles.user_id is UNIQUE per entity).
   * BR-006 relies on this constraint as the race backstop: we catch 23505 and map to
   * 409 COACH_ALREADY_ACTIVE_ELSEWHERE instead of letting a raw 500 escape.
   */
  private async handleCoachAcceptance(
    link: { id: string; trainerId: string; type: ShareLinkType; targetEmail?: string | null },
    dto: JoinViaLinkDto,
    ctx: JoinContext,
    code: string,
  ): Promise<JoinResult> {
    // M-4: Enforce that UNIQUE (coach) links are only accepted by the intended invitee.
    // Reject a logged-in principal whose role/email doesn't match the invite intent.
    if (ctx.principalId) {
      // Look up the logged-in user to get their email
      const principalUser = await this.usersRepo.findById(ctx.principalId);
      if (principalUser) {
        const isCoach = principalUser.role === UserRole.COACH;
        const emailMatches = link.targetEmail && principalUser.email === link.targetEmail;
        // Reject if the principal is not a coach AND their email doesn't match the invite
        if (!isCoach && !emailMatches) {
          this.logger.warn(
            `[SECURITY] M-4: logged-in principal role=${principalUser.role} email=${principalUser.email} ` +
            `attempted to consume coach UNIQUE link targeting ${link.targetEmail}`,
          );
          throw new ForbiddenException({
            message: 'This invite link is intended for a specific coach. Your account does not match the invite.',
            errorCode: 'INVITE_RECIPIENT_MISMATCH',
          });
        }
      }
    }

    // Pre-hash password outside tx (expensive, avoid repeating inside tx)
    let passwordHash: string | undefined;
    let existingUserId: string | undefined;

    if (!ctx.principalId) {
      // Anonymous: check if email already exists
      const existingUser = await this.usersRepo.findByEmail(dto.email!);
      if (existingUser) {
        existingUserId = existingUser.id;
      } else {
        // Note: missing password results in 409 VALIDATION_ERROR here; ideally DTO-level 400.
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
    let newPrincipal: NewPrincipalSession | undefined;

    try {
      const { userId, coachProfileId, createdUser } = await this.dataSource.transaction(async (em) => {
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
        let createdUserData: NewPrincipalSession | undefined;

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
          createdUserData = {
            id: newUser.id,
            email: newUser.email,
            role: newUser.role,
            status: newUser.status,
            emailVerified: newUser.emailVerified,
            mustChangePassword: newUser.mustChangePassword,
          };
        }

        // Step 3: BR-006 re-check inside tx for newly-created users (race safety)
        // BR-006 relies on the unique user_id constraint on coach_profiles as the race
        // backstop — concurrent accepts will have one INSERT fail with 23505 (M-1 fix).
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

        return { userId: resolvedUserId, coachProfileId: profileId, createdUser: createdUserData };
      });

      newPrincipal = createdUser;
      return { alreadyAssociated: false, userId, coachProfileId, newPrincipal };
    } catch (err: any) {
      // M-1: catch Postgres 23505 on the CoachProfile INSERT (race condition where two
      // concurrent accepts for different trainers both see null CoachProfile and both try
      // to INSERT). BR-006 relies on the unique user_id constraint as the race backstop.
      // Map to 409 COACH_ALREADY_ACTIVE_ELSEWHERE instead of letting a raw 500 escape.
      if (err?.code === '23505' || err?.driverError?.code === '23505') {
        this.logger.warn(
          `[BR-006] M-1 race: concurrent coach accept 23505 for code=${code} — mapping to 409`,
        );
        throw new ConflictException({
          message: 'Coach is already active under another trainer',
          errorCode: 'COACH_ALREADY_ACTIVE_ELSEWHERE',
        });
      }
      throw err;
    }
  }
}
