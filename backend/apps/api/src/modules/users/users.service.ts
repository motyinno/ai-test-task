import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { UsersRepository } from './users.repository';
import { User, UserRole, UserStatus } from './entities/user.entity';
import { TrainerProfile } from './entities/trainer-profile.entity';
import { CoachProfile } from './entities/coach-profile.entity';
import { PlayerProfile } from './entities/player-profile.entity';
import { InvitationToken } from '../auth/entities/invitation-token.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PasswordService } from '../../shared/crypto/password.service';
import { EmailService } from '../../shared/integrations/email/email.service';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { CreateTrainerDto } from './dto/create-trainer.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto, PaginatedUsersDto } from './dto/user-response.dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly usersRepo: UsersRepository,
    private readonly passwordService: PasswordService,
    private readonly emailService: EmailService,
    private readonly dataSource: DataSource,
    @InjectRepository(TrainerProfile)
    private readonly trainerProfileRepo: Repository<TrainerProfile>,
    @InjectRepository(CoachProfile)
    private readonly coachProfileRepo: Repository<CoachProfile>,
    @InjectRepository(PlayerProfile)
    private readonly playerProfileRepo: Repository<PlayerProfile>,
    @InjectRepository(InvitationToken)
    private readonly invitationTokenRepo: Repository<InvitationToken>,
  ) {}

  /** Invitation links live for 7 days. */
  private static readonly INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

  /**
   * Public base URL of the web app, used to build absolute invite links.
   * Falls back to the dev Vite origin when APP_BASE_URL is unset.
   */
  private get appBaseUrl(): string {
    return (process.env['APP_BASE_URL'] ?? 'http://localhost:5173').replace(/\/$/, '');
  }

  // ─── B2: GET /users (SA directory) ─────────────────────────────────────────

  async listUsers(query: ListUsersQueryDto): Promise<PaginatedUsersDto> {
    const { data, total } = await this.usersRepo.findPaginated(query);
    const { page, limit } = query;
    return {
      data: data.map((u) => this.toResponseDto(u)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ─── B4: GET /users/:id ────────────────────────────────────────────────────

  async getUser(id: string): Promise<UserResponseDto> {
    const user = await this.usersRepo.findById(id);
    if (!user) {
      throw new NotFoundException({ message: `User ${id} not found`, errorCode: 'USER_NOT_FOUND' });
    }
    return this.toResponseDto(user);
  }

  // ─── B3: POST /users (create trainer, SA-only) ────────────────────────────

  async createTrainer(
    dto: CreateTrainerDto,
    createdByUserId: string,
  ): Promise<UserResponseDto> {
    // BR-001: 409 on duplicate email
    const existing = await this.usersRepo.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException({
        message: 'Email already in use',
        errorCode: 'EMAIL_EXISTS',
      });
    }

    let passwordHash: string;
    let tempPassword: string | undefined;
    let inviteToken: string | undefined;

    if (dto.onboardingMode === 'TEMP_PASSWORD') {
      tempPassword = crypto.randomBytes(8).toString('base64url');
      passwordHash = await this.passwordService.hash(tempPassword);
    } else {
      // INVITE_LINK: generate a secure invite token, set placeholder password
      inviteToken = crypto.randomBytes(32).toString('base64url');
      passwordHash = await this.passwordService.hash(crypto.randomBytes(32).toString('hex'));
    }

    // M1: Wrap User insert + TrainerProfile insert in ONE transaction.
    // If TrainerProfile save fails, the User is rolled back — no orphaned accounts.
    const user = await this.dataSource.transaction(async (em) => {
      const newUser = em.create(User, {
        email: dto.email,
        passwordHash,
        role: UserRole.TRAINER,
        status: UserStatus.ACTIVE,
        mustChangePassword: dto.onboardingMode === 'TEMP_PASSWORD',
        emailVerified: false,
      });
      const savedUser = await em.save(User, newUser);

      const profile = em.create(TrainerProfile, {
        userId: savedUser.id,
        businessName: dto.businessName,
        trainerName: dto.trainerName,
        phone: dto.phone ?? null,
      });
      await em.save(TrainerProfile, profile);

      return savedUser;
    });

    // INVITE_LINK: persist the single-use invitation token so /join-invite/:token
    // can validate it and let the trainer set their own password.
    if (inviteToken) {
      await this.invitationTokenRepo.save(
        this.invitationTokenRepo.create({
          token: inviteToken,
          userId: user.id,
          expiresAt: new Date(Date.now() + UsersService.INVITE_EXPIRY_MS),
          usedAt: null,
        }),
      );
    }

    // M2: Send email AFTER commit, best-effort — mail failure must never fail the request.
    // Any send error is caught-and-logged, not propagated to the caller.
    this.sendOnboardingEmail(dto, tempPassword, inviteToken).catch((err) => {
      this.logger.warn(
        `[EMAIL] Onboarding email failed for ${dto.email}: ${(err as Error).message}`,
      );
    });

    // Audit: log the creation (simplified — full AuditModule is Phase F)
    this.logger.log(`[AUDIT] Trainer created: userId=${user.id} by SA=${createdByUserId}`);

    return this.toResponseDto(user);
  }

  /** M2: Best-effort email send — called after DB commit. Never throws to the caller. */
  private async sendOnboardingEmail(
    dto: CreateTrainerDto,
    tempPassword: string | undefined,
    inviteToken: string | undefined,
  ): Promise<void> {
    if (dto.onboardingMode === 'TEMP_PASSWORD' && tempPassword) {
      await this.emailService.send({
        to: dto.email,
        subject: 'Your new trainer account',
        text: `Welcome ${dto.trainerName}! Your temporary password is: ${tempPassword}. Please change it on first login.`,
        data: { tempPassword, email: dto.email },
      });
    } else if (inviteToken) {
      const inviteUrl = `${this.appBaseUrl}/join-invite/${inviteToken}`;
      await this.emailService.send({
        to: dto.email,
        subject: 'You have been invited to join',
        text: `Welcome ${dto.trainerName}! Set your password to activate your account: ${inviteUrl} (link expires in 7 days)`,
        data: { inviteToken, inviteUrl, email: dto.email },
      });
    }
  }

  // ─── B4: PATCH /users/:id ─────────────────────────────────────────────────

  async updateUser(id: string, dto: UpdateUserDto): Promise<UserResponseDto> {
    const user = await this.usersRepo.findById(id);
    if (!user) {
      throw new NotFoundException({ message: `User ${id} not found`, errorCode: 'USER_NOT_FOUND' });
    }

    // email and role are immutable here per spec
    const updates: Partial<User> = {};
    if (dto.status !== undefined) updates.status = dto.status;

    // M5: Per-role profile field mapping — firstName and phone are applied
    // to the matching role profile. Each branch only touches the relevant table.
    if (dto.firstName !== undefined || dto.phone !== undefined) {
      if (user.role === UserRole.TRAINER) {
        const profile = await this.trainerProfileRepo.findOne({ where: { userId: id } });
        if (profile) {
          const profileUpdates: Partial<TrainerProfile> = {};
          if (dto.firstName !== undefined) profileUpdates.trainerName = dto.firstName;
          if (dto.phone !== undefined) profileUpdates.phone = dto.phone ?? null;
          await this.trainerProfileRepo.update(profile.id, profileUpdates);
        }
      } else if (user.role === UserRole.PLAYER) {
        if (dto.firstName !== undefined) {
          const profile = await this.playerProfileRepo.findOne({ where: { userId: id } });
          if (profile) {
            await this.playerProfileRepo.update(profile.id, { name: dto.firstName });
          }
        }
        // phone: PlayerProfile has no phone column — intentionally not applied
      }
      // COACH: no firstName/phone fields on CoachProfile — no-op
      // SUPER_ADMIN: no role profile — no-op
    }

    if (Object.keys(updates).length > 0) {
      await this.usersRepo.update(id, updates);
    }

    const updated = await this.usersRepo.findById(id);
    return this.toResponseDto(updated!);
  }

  // ─── B5: POST /users/:id/deactivate ───────────────────────────────────────

  async deactivateUser(id: string): Promise<UserResponseDto> {
    const user = await this.usersRepo.findById(id);
    if (!user) {
      throw new NotFoundException({ message: `User ${id} not found`, errorCode: 'USER_NOT_FOUND' });
    }
    if (user.anonymizedAt) {
      throw new ConflictException({
        message: 'Cannot deactivate an anonymized user',
        errorCode: 'USER_ANONYMIZED',
      });
    }
    // Race-safe: conditional UPDATE WHERE anonymized_at IS NULL — 409 if a concurrent
    // anonymization ran between the guard check above and this write.
    const updated = await this.usersRepo.updateStatusIfNotAnonymized(id, UserStatus.INACTIVE);
    if (!updated) {
      throw new ConflictException({
        message: 'Cannot deactivate an anonymized user',
        errorCode: 'USER_ANONYMIZED',
      });
    }
    const result = await this.usersRepo.findById(id);
    return this.toResponseDto(result!);
  }

  // ─── B5: POST /users/:id/reactivate ───────────────────────────────────────

  async reactivateUser(id: string): Promise<UserResponseDto> {
    const user = await this.usersRepo.findById(id);
    if (!user) {
      throw new NotFoundException({ message: `User ${id} not found`, errorCode: 'USER_NOT_FOUND' });
    }

    // D7 guard: 409 USER_ANONYMIZED if anonymizedAt != null
    if (user.anonymizedAt) {
      throw new ConflictException({
        message: 'Cannot reactivate an anonymized (GDPR-deleted) user',
        errorCode: 'USER_ANONYMIZED',
      });
    }

    // Race-safe: conditional UPDATE WHERE anonymized_at IS NULL
    const updated = await this.usersRepo.updateStatusIfNotAnonymized(id, UserStatus.ACTIVE);
    if (!updated) {
      throw new ConflictException({
        message: 'Cannot reactivate an anonymized (GDPR-deleted) user',
        errorCode: 'USER_ANONYMIZED',
      });
    }
    const result = await this.usersRepo.findById(id);
    return this.toResponseDto(result!);
  }

  // ─── B6: DELETE /users/:id (GDPR anonymize) ───────────────────────────────

  async deleteUser(
    id: string,
    opts: { deletedBy: string; reason: string },
  ): Promise<UserResponseDto> {
    const user = await this.usersRepo.findById(id);
    if (!user) {
      throw new NotFoundException({ message: `User ${id} not found`, errorCode: 'USER_NOT_FOUND' });
    }

    // SA cannot delete another SA (policy)
    if (user.role === UserRole.SUPER_ADMIN) {
      throw new ForbiddenException({
        message: 'Cannot delete a Super Admin account',
        errorCode: 'CANNOT_DELETE_SUPER_ADMIN',
      });
    }

    const anonymized = await this.usersRepo.anonymizeInTransaction(id, {
      originalEmail: user.email,
      deletedBy: opts.deletedBy,
      reason: opts.reason,
    });

    return this.toResponseDto(anonymized);
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────

  private toResponseDto(user: User): UserResponseDto {
    const isAnonymized = !!user.anonymizedAt;
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      displayName: isAnonymized ? 'Deleted User' : user.email,
      emailVerified: user.emailVerified,
      anonymizedAt: user.anonymizedAt ? user.anonymizedAt.toISOString() : undefined,
      lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : undefined,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
