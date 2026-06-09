import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { User, UserRole, UserStatus } from '../users/entities/user.entity';
import { PlayerProfile } from '../users/entities/player-profile.entity';
import { TrainerPlayerAssociation, AssociationStatus } from './entities/trainer-player-association.entity';
import { ChildLogin } from '../child-account/entities/child-login.entity';
import { ShareLink } from '../sharelinks/entities/share-link.entity';
import { PlayersRepository } from './players.repository';
import { PasswordService } from '../../shared/crypto/password.service';
import { CreateChildDto } from './dto/create-child.dto';
import { SwitchContextDto } from './dto/switch-context.dto';
import { SessionContextService, ActiveContext } from '../auth/session-context.service';
import type { Request } from 'express';
import { deriveAge, deriveAgeGroup, AgeGroup } from '../../shared/utils/age.util';

export interface ContextItem {
  profileId: string;
  profileName: string;
  trainerId: string;
  trainerName: string;
  isSelf: boolean;
}

export interface ChildProfileResponse {
  id: string;
  name: string;
  dateOfBirth: string | null;
  /** Derived from dateOfBirth at read time */
  age: number | null;
  /** Derived age group (U6–U18) */
  ageGroup: AgeGroup | null;
  gender: string | null;
  school: string | null;
  isChild: boolean;
  parentUserId: string | null;
  allowTokenSpendWithoutApproval: boolean;
  hasLogin: boolean;
  trainers: Array<{ trainerId: string; status: string; connectedAt: Date }>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * PlayersChildService — D2/D3/D4.
 *
 * Handles child profile creation, child↔trainer management, and context switching.
 * Split from PlayersService to keep files manageable.
 */
@Injectable()
export class PlayersChildService {
  private readonly logger = new Logger(PlayersChildService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(PlayerProfile)
    private readonly playerProfileRepo: Repository<PlayerProfile>,
    @InjectRepository(TrainerPlayerAssociation)
    private readonly assocRepo: Repository<TrainerPlayerAssociation>,
    @InjectRepository(ChildLogin)
    private readonly childLoginRepo: Repository<ChildLogin>,
    @InjectRepository(ShareLink)
    private readonly shareLinkRepo: Repository<ShareLink>,
    private readonly playersRepo: PlayersRepository,
    private readonly passwordService: PasswordService,
    private readonly sessionCtx: SessionContextService,
    private readonly dataSource: DataSource,
  ) {}

  // ─── D2: Create child profile ────────────────────────────────────────────────

  /**
   * POST /players/me/children — create a child profile under the current parent.
   *
   * BR-017: age must be 1–18 (enforced by DTO, double-checked here).
   * Optionally creates a ChildLogin for child sub-login auth (D5).
   * Optionally creates TrainerPlayerAssociation for listed trainerIds.
   */
  async createChild(
    parentUserId: string,
    dto: CreateChildDto,
  ): Promise<ChildProfileResponse> {
    // BR-017: derived age from dateOfBirth must be 1–18 (DTO validates, double-check here)
    const derivedAge = deriveAge(dto.dateOfBirth);
    if (derivedAge === null || derivedAge < 1 || derivedAge > 18) {
      throw new BadRequestException({
        message: 'Derived age from dateOfBirth must be between 1 and 18 (BR-017)',
        errorCode: 'INVALID_CHILD_AGE',
      });
    }

    // Check createLogin requirements
    if (dto.createLogin && (!dto.childUsername || !dto.childPassword)) {
      throw new BadRequestException({
        message: 'childUsername and childPassword are required when createLogin=true',
        errorCode: 'CHILD_LOGIN_FIELDS_REQUIRED',
      });
    }

    // Check username uniqueness before entering tx
    if (dto.childUsername) {
      const existingLogin = await this.childLoginRepo.findOne({
        where: { childUsername: dto.childUsername },
      });
      if (existingLogin) {
        throw new ConflictException({
          message: 'Child username is already taken',
          errorCode: 'CHILD_USERNAME_EXISTS',
        });
      }
    }

    let passwordHash: string | undefined;
    if (dto.createLogin && dto.childPassword) {
      passwordHash = await this.passwordService.hash(dto.childPassword);
    }

    // Validate trainerIds — ensure the parent has associations with each
    const trainerIds = dto.trainerIds ?? [];
    if (trainerIds.length > 0) {
      // Verify parent is associated with each trainer (parent's own PlayerProfile)
      const parentProfile = await this.playerProfileRepo.findOne({ where: { userId: parentUserId } });
      if (parentProfile) {
        for (const tid of trainerIds) {
          const assoc = await this.playersRepo.findAssociation(tid, parentProfile.id);
          if (!assoc || assoc.status !== AssociationStatus.ACTIVE) {
            throw new BadRequestException({
              message: `Parent is not associated with trainer ${tid}`,
              errorCode: 'PARENT_NOT_ASSOCIATED_WITH_TRAINER',
            });
          }
        }
      }
    }

    const { childProfile, childLogin } = await this.dataSource.transaction(async (em) => {
      // Create a synthetic "user" record for the child
      // The child PlayerProfile is linked to the parent's user for org purposes
      // but gets its own virtual user for the child-login path.
      // For Phase D: child profiles use the parent's userId as their user root;
      // the parentUserId field on PlayerProfile distinguishes them.
      // We create a minimal User record for the child to satisfy the FK.
      const childUser = await em.save(
        User,
        em.create(User, {
          email: `child-${Date.now()}-${Math.random().toString(36).slice(2)}@child.internal`,
          passwordHash: passwordHash ?? '$argon2id$v=19$m=65536,t=3,p=4$placeholder', // placeholder; real hash in ChildLogin
          role: UserRole.PLAYER,
          status: UserStatus.ACTIVE,
          emailVerified: true,
          mustChangePassword: false,
        }),
      );

      // Create child PlayerProfile
      const profile = await em.save(
        PlayerProfile,
        em.create(PlayerProfile, {
          userId: childUser.id,
          parentUserId,
          name: dto.name,
          dateOfBirth: dto.dateOfBirth,
          gender: dto.gender,
          school: dto.school ?? null,
          isChild: true,
          allowTokenSpendWithoutApproval: false,
        }),
      );

      // Create TrainerPlayerAssociations for listed trainerIds
      for (const tid of trainerIds) {
        await em.save(
          TrainerPlayerAssociation,
          em.create(TrainerPlayerAssociation, {
            trainerId: tid,
            playerProfileId: profile.id,
            viaShareLinkId: null,
            status: AssociationStatus.ACTIVE,
          }),
        ).catch((err: any) => {
          if (err?.code === '23505') {
            // Already associated — skip (idempotent)
            return;
          }
          throw err;
        });
      }

      // Optionally create ChildLogin
      let login: ChildLogin | undefined;
      if (dto.createLogin && dto.childUsername && passwordHash) {
        login = await em.save(
          ChildLogin,
          em.create(ChildLogin, {
            childProfileId: profile.id,
            parentUserId,
            childUsername: dto.childUsername,
            passwordHash,
            tokenSpendAllowed: false,
            isActive: true,
          }),
        );
      }

      return { childProfile: profile, childLogin: login };
    });

    // Fetch associations
    const trainers = await this.assocRepo.find({
      where: { playerProfileId: childProfile.id },
    });

    return {
      id: childProfile.id,
      name: childProfile.name,
      dateOfBirth: childProfile.dateOfBirth,
      age: deriveAge(childProfile.dateOfBirth),
      ageGroup: deriveAgeGroup(childProfile.dateOfBirth),
      gender: childProfile.gender,
      school: childProfile.school,
      isChild: childProfile.isChild,
      parentUserId: childProfile.parentUserId,
      allowTokenSpendWithoutApproval: childProfile.allowTokenSpendWithoutApproval,
      hasLogin: !!childLogin,
      trainers: trainers.map((a) => ({
        trainerId: a.trainerId,
        status: a.status,
        connectedAt: a.connectedAt,
      })),
      createdAt: childProfile.createdAt,
      updatedAt: childProfile.updatedAt,
    };
  }

  /**
   * GET /players/me/children — list children of the current parent.
   */
  async listChildren(parentUserId: string): Promise<ChildProfileResponse[]> {
    const profiles = await this.playerProfileRepo.find({
      where: { parentUserId, isChild: true },
    });

    const results: ChildProfileResponse[] = [];
    for (const profile of profiles) {
      const trainers = await this.assocRepo.find({
        where: { playerProfileId: profile.id, status: AssociationStatus.ACTIVE },
      });
      const login = await this.childLoginRepo.findOne({ where: { childProfileId: profile.id } });

      results.push({
        id: profile.id,
        name: profile.name,
        dateOfBirth: profile.dateOfBirth,
        age: deriveAge(profile.dateOfBirth),
        ageGroup: deriveAgeGroup(profile.dateOfBirth),
        gender: profile.gender,
        school: profile.school,
        isChild: profile.isChild,
        parentUserId: profile.parentUserId,
        allowTokenSpendWithoutApproval: profile.allowTokenSpendWithoutApproval,
        hasLogin: !!login,
        trainers: trainers.map((a) => ({
          trainerId: a.trainerId,
          status: a.status,
          connectedAt: a.connectedAt,
        })),
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
      });
    }

    return results;
  }

  // ─── D3: Manage child↔trainer ────────────────────────────────────────────────

  /**
   * POST /players/me/children/:childId/trainers — add a trainer to a child.
   * Option A: via ShareLink code, Option B: via trainerId directly.
   * FR-024: parent must already be associated with the trainer.
   */
  async addChildTrainer(
    parentUserId: string,
    childId: string,
    opts: { shareLinkCode?: string; trainerId?: string },
  ): Promise<{ trainerId: string; status: string }> {
    // Verify child belongs to parent
    const childProfile = await this.playerProfileRepo.findOne({
      where: { id: childId, parentUserId, isChild: true },
    });
    if (!childProfile) {
      throw new NotFoundException({
        message: 'Child profile not found or does not belong to this parent',
        errorCode: 'CHILD_NOT_FOUND',
      });
    }

    let resolvedTrainerId: string;
    // Set when the trainer was resolved from a share-link code — the link is the
    // trainer's consent, so it doubles as the grant that connects the parent.
    let resolvedLinkId: string | null = null;

    if (opts.shareLinkCode) {
      // Option A: resolve trainerId from ShareLink
      const link = await this.shareLinkRepo.findOne({ where: { code: opts.shareLinkCode, active: true } });
      if (!link) {
        throw new NotFoundException({ message: 'Share link not found or inactive', errorCode: 'LINK_NOT_FOUND' });
      }
      resolvedTrainerId = link.trainerId;
      resolvedLinkId = link.id;
    } else if (opts.trainerId) {
      // Option B: direct trainerId
      resolvedTrainerId = opts.trainerId;
    } else {
      throw new BadRequestException({
        message: 'Either shareLinkCode or trainerId is required',
        errorCode: 'MISSING_TRAINER_REFERENCE',
      });
    }

    // FR-024: the parent must be associated with the trainer before adding a child.
    // A valid share-link code IS the trainer's consent, so when the trainer was
    // resolved from a code we auto-connect the parent (one-step family onboarding)
    // instead of rejecting. The direct-trainerId path keeps the original gate.
    const parentProfile = await this.playerProfileRepo.findOne({ where: { userId: parentUserId } });
    if (parentProfile) {
      const parentAssoc = await this.playersRepo.findAssociation(resolvedTrainerId, parentProfile.id);
      const parentActive = !!parentAssoc && parentAssoc.status === AssociationStatus.ACTIVE;

      if (!parentActive) {
        if (!resolvedLinkId) {
          throw new ForbiddenException({
            message: 'Parent must be associated with this trainer to add child',
            errorCode: 'PARENT_NOT_ASSOCIATED_WITH_TRAINER',
          });
        }

        // Auto-connect the parent via the same share link.
        if (parentAssoc) {
          parentAssoc.status = AssociationStatus.ACTIVE;
          parentAssoc.viaShareLinkId = resolvedLinkId;
          await this.playersRepo.saveAssociation(parentAssoc);
        } else {
          try {
            await this.playersRepo.saveAssociation({
              trainerId: resolvedTrainerId,
              playerProfileId: parentProfile.id,
              viaShareLinkId: resolvedLinkId,
              status: AssociationStatus.ACTIVE,
            });
          } catch (err: unknown) {
            // Ignore unique-violation races — another request connected the parent.
            if ((err as { code?: string })?.code !== '23505') throw err;
          }
        }
      }
    }

    // Check existing association
    const existing = await this.playersRepo.findAssociation(resolvedTrainerId, childProfile.id);
    if (existing) {
      if (existing.status === AssociationStatus.ACTIVE) {
        return { trainerId: resolvedTrainerId, status: 'ALREADY_ASSOCIATED' };
      }
      // Reactivate
      existing.status = AssociationStatus.ACTIVE;
      await this.playersRepo.saveAssociation(existing);
      return { trainerId: resolvedTrainerId, status: 'REACTIVATED' };
    }

    // Create new association (race-safe via unique constraint)
    try {
      await this.playersRepo.saveAssociation({
        trainerId: resolvedTrainerId,
        playerProfileId: childProfile.id,
        viaShareLinkId: opts.shareLinkCode
          ? (await this.shareLinkRepo.findOne({ where: { code: opts.shareLinkCode } }))?.id ?? null
          : null,
        status: AssociationStatus.ACTIVE,
      });
    } catch (err: any) {
      if (err?.code === '23505') {
        return { trainerId: resolvedTrainerId, status: 'ALREADY_ASSOCIATED' };
      }
      throw err;
    }

    return { trainerId: resolvedTrainerId, status: 'ASSOCIATED' };
  }

  /**
   * DELETE /players/me/children/:childId/trainers/:trainerId — remove trainer from child.
   * Soft-deletes the association; history is preserved.
   * Note: Cancelling upcoming RSVPs is Epic-02; we just soft-delete here.
   */
  async removeChildTrainer(
    parentUserId: string,
    childId: string,
    trainerId: string,
  ): Promise<{ removed: boolean }> {
    // Verify child belongs to parent
    const childProfile = await this.playerProfileRepo.findOne({
      where: { id: childId, parentUserId, isChild: true },
    });
    if (!childProfile) {
      throw new NotFoundException({
        message: 'Child profile not found or does not belong to this parent',
        errorCode: 'CHILD_NOT_FOUND',
      });
    }

    const assoc = await this.playersRepo.findAssociation(trainerId, childProfile.id);
    if (!assoc || assoc.status === AssociationStatus.REMOVED) {
      return { removed: false };
    }

    // Soft-delete: set status to REMOVED
    assoc.status = AssociationStatus.REMOVED;
    await this.playersRepo.saveAssociation(assoc);

    this.logger.log(
      `[D3] Removed child ${childId} from trainer ${trainerId} (parent ${parentUserId}). ` +
      `Note: RSVP cancellation is Epic-02.`,
    );

    return { removed: true };
  }

  // ─── D4: Context switching ───────────────────────────────────────────────────

  /**
   * GET /players/me/contexts — list all available contexts.
   * For the parent: Me × each trainer + each child × each trainer.
   * For a child principal: only own contexts (own child profile × trainers).
   */
  async listContexts(
    userId: string,
    isChild: boolean,
    childProfileId?: string,
  ): Promise<{ data: ContextItem[] }> {
    const contexts: ContextItem[] = [];

    if (isChild && childProfileId) {
      // Child principal: only their own trainer associations
      const assocs = await this.assocRepo.find({
        where: { playerProfileId: childProfileId, status: AssociationStatus.ACTIVE },
      });
      for (const assoc of assocs) {
        contexts.push({
          profileId: childProfileId,
          profileName: 'Me (child)',
          trainerId: assoc.trainerId,
          trainerName: assoc.trainerId, // Real name lookup is Epic-02; using ID as placeholder
          isSelf: false,
        });
      }
      return { data: contexts };
    }

    // Parent principal: own profile + children profiles, each × their trainers
    const parentProfile = await this.playerProfileRepo.findOne({ where: { userId } });
    if (parentProfile) {
      // Parent's own associations
      const parentAssocs = await this.assocRepo.find({
        where: { playerProfileId: parentProfile.id, status: AssociationStatus.ACTIVE },
      });
      for (const assoc of parentAssocs) {
        contexts.push({
          profileId: parentProfile.id,
          profileName: parentProfile.name,
          trainerId: assoc.trainerId,
          trainerName: assoc.trainerId, // Placeholder — trainer name lookup is Epic-02
          isSelf: true,
        });
      }

      // Children's associations
      const children = await this.playerProfileRepo.find({
        where: { parentUserId: userId, isChild: true },
      });
      for (const child of children) {
        const childAssocs = await this.assocRepo.find({
          where: { playerProfileId: child.id, status: AssociationStatus.ACTIVE },
        });
        for (const assoc of childAssocs) {
          contexts.push({
            profileId: child.id,
            profileName: child.name,
            trainerId: assoc.trainerId,
            trainerName: assoc.trainerId, // Placeholder
            isSelf: false,
          });
        }
      }
    }

    return { data: contexts };
  }

  /**
   * POST /players/me/context — switch active context.
   * Validates the requested context is accessible to the principal.
   * Persists the new active context in the session.
   */
  async switchContext(
    req: Request,
    userId: string,
    isChild: boolean,
    childProfileId: string | undefined,
    dto: SwitchContextDto,
  ): Promise<ActiveContext> {
    // Resolve what profiles this principal may access
    const { data: contexts } = await this.listContexts(userId, isChild, childProfileId);

    const match = contexts.find(
      (c) =>
        c.profileId === dto.profileId &&
        (dto.trainerId === undefined || c.trainerId === dto.trainerId),
    );

    if (!match) {
      throw new ForbiddenException({
        message: 'Context not accessible to this principal',
        errorCode: 'CONTEXT_NOT_ACCESSIBLE',
      });
    }

    const newContext: ActiveContext = {
      profileId: match.profileId,
      trainerId: match.trainerId,
      label: `${match.profileName} → ${match.trainerName}`,
    };

    // Persist in session (D2 spec: active context persists in session)
    this.sessionCtx.setActiveContext(req, newContext);

    return newContext;
  }
}
