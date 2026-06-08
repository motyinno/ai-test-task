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
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
    @InjectRepository(TrainerProfile)
    private readonly trainerProfileRepo: Repository<TrainerProfile>,
  ) {}

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

    const user = await this.usersRepo.create({
      email: dto.email,
      passwordHash,
      role: UserRole.TRAINER,
      status: UserStatus.ACTIVE,
      mustChangePassword: dto.onboardingMode === 'TEMP_PASSWORD',
      emailVerified: false,
    });

    // Create the TrainerProfile in the same logical flow
    await this.trainerProfileRepo.save(
      this.trainerProfileRepo.create({
        userId: user.id,
        businessName: dto.businessName,
        trainerName: dto.trainerName,
        phone: dto.phone ?? null,
      }),
    );

    // Send invite/temp-password email via EmailService port
    if (dto.onboardingMode === 'TEMP_PASSWORD' && tempPassword) {
      await this.emailService.send({
        to: dto.email,
        subject: 'Your new trainer account',
        text: `Welcome ${dto.trainerName}! Your temporary password is: ${tempPassword}. Please change it on first login.`,
        data: { tempPassword, email: dto.email },
      });
    } else if (inviteToken) {
      await this.emailService.send({
        to: dto.email,
        subject: 'You have been invited to join',
        text: `Welcome ${dto.trainerName}! Your invite link: /join-invite/${inviteToken}`,
        data: { inviteToken, email: dto.email },
      });
    }

    // Audit: log the creation (simplified — full AuditModule is Phase F)
    this.logger.log(`[AUDIT] Trainer created: userId=${user.id} by SA=${createdByUserId}`);

    return this.toResponseDto(user);
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

    // firstName / lastName / phone are not on the User entity;
    // they live on role-specific profiles. We update the TrainerProfile if it exists.
    if (dto.firstName !== undefined || dto.lastName !== undefined || dto.phone !== undefined) {
      if (user.role === UserRole.TRAINER) {
        const profile = await this.trainerProfileRepo.findOne({ where: { userId: id } });
        if (profile) {
          const profileUpdates: Partial<TrainerProfile> = {};
          if (dto.firstName !== undefined) profileUpdates.trainerName = dto.firstName;
          if (dto.phone !== undefined) profileUpdates.phone = dto.phone ?? null;
          await this.trainerProfileRepo.update(profile.id, profileUpdates);
        }
      }
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
    await this.usersRepo.update(id, { status: UserStatus.INACTIVE });
    const updated = await this.usersRepo.findById(id);
    return this.toResponseDto(updated!);
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

    await this.usersRepo.update(id, { status: UserStatus.ACTIVE });
    const updated = await this.usersRepo.findById(id);
    return this.toResponseDto(updated!);
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
