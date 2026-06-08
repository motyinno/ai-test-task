import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../users/entities/user.entity';
import { TrainerProfile } from '../users/entities/trainer-profile.entity';
import { CoachProfile } from '../users/entities/coach-profile.entity';
import { PlayerProfile } from '../users/entities/player-profile.entity';
import { StorageService, StorageFile } from '../../shared/integrations/storage/storage.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfileResponseDto } from './dto/profile-response.dto';

@Injectable()
export class ProfileService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(TrainerProfile)
    private readonly trainerProfileRepo: Repository<TrainerProfile>,
    @InjectRepository(CoachProfile)
    private readonly coachProfileRepo: Repository<CoachProfile>,
    @InjectRepository(PlayerProfile)
    private readonly playerProfileRepo: Repository<PlayerProfile>,
    private readonly storageService: StorageService,
  ) {}

  // ─── GET /me/profile ─────────────────────────────────────────────────────

  async getProfile(userId: string): Promise<ProfileResponseDto> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException({ message: 'User not found', errorCode: 'USER_NOT_FOUND' });
    }

    const base: ProfileResponseDto = {
      id: userId, // profile id set below per role
      userId: user.id,
      role: user.role,
      email: user.email,
      createdAt: user.createdAt.toISOString(),
    };

    switch (user.role) {
      case UserRole.TRAINER:
        return this.buildTrainerProfile(base, user);
      case UserRole.COACH:
        return this.buildCoachProfile(base, user);
      case UserRole.PLAYER:
        return this.buildPlayerProfile(base, user);
      case UserRole.SUPER_ADMIN:
        // SA doesn't have a role-specific profile — return base
        return { ...base, id: user.id };
      default:
        return base;
    }
  }

  // ─── PATCH /me/profile ───────────────────────────────────────────────────

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<ProfileResponseDto> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException({ message: 'User not found', errorCode: 'USER_NOT_FOUND' });
    }

    // <1s target (NFR-003): single atomic update per role profile
    switch (user.role) {
      case UserRole.TRAINER:
        await this.updateTrainerProfile(userId, dto);
        break;
      case UserRole.COACH:
        await this.updateCoachProfile(userId, dto);
        break;
      case UserRole.PLAYER:
        await this.updatePlayerProfile(userId, dto);
        break;
      case UserRole.SUPER_ADMIN:
        // SA has no role-specific profile fields — no-op
        break;
    }

    return this.getProfile(userId);
  }

  // ─── POST /me/profile/photo ──────────────────────────────────────────────

  async uploadPhoto(
    userId: string,
    file: StorageFile,
  ): Promise<{ photoUrl: string; thumbnailUrl?: string }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException();
    }

    const result = await this.storageService.put(file, `profiles/${userId}`);

    // Update the profile photo URL
    switch (user.role) {
      case UserRole.TRAINER: {
        const profile = await this.trainerProfileRepo.findOne({ where: { userId } });
        if (profile) {
          await this.trainerProfileRepo.update(profile.id, { photoUrl: result.url });
        }
        break;
      }
      case UserRole.COACH: {
        const profile = await this.coachProfileRepo.findOne({ where: { userId } });
        if (profile) {
          await this.coachProfileRepo.update(profile.id, { photoUrl: result.url });
        }
        break;
      }
      case UserRole.PLAYER: {
        const profile = await this.playerProfileRepo.findOne({ where: { userId } });
        if (profile) {
          await this.playerProfileRepo.update(profile.id, { photoUrl: result.url });
        }
        break;
      }
      default:
        break;
    }

    return {
      photoUrl: result.url,
      thumbnailUrl: result.thumbnailUrl,
    };
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  private async buildTrainerProfile(
    base: ProfileResponseDto,
    user: User,
  ): Promise<ProfileResponseDto> {
    const profile = await this.trainerProfileRepo.findOne({ where: { userId: user.id } });
    return {
      ...base,
      id: profile?.id ?? user.id,
      businessName: profile?.businessName,
      trainerName: profile?.trainerName,
      phone: profile?.phone ?? undefined,
      photoUrl: profile?.photoUrl ?? undefined,
    };
  }

  private async buildCoachProfile(
    base: ProfileResponseDto,
    user: User,
  ): Promise<ProfileResponseDto> {
    const profile = await this.coachProfileRepo.findOne({ where: { userId: user.id } });
    return {
      ...base,
      id: profile?.id ?? user.id,
      trainerId: profile?.trainerId,
      bio: profile?.bio ?? undefined,
      credentials: profile?.credentials ?? undefined,
      publicProfile: profile?.publicProfile,
      photoUrl: profile?.photoUrl ?? undefined,
    };
  }

  private async buildPlayerProfile(
    base: ProfileResponseDto,
    user: User,
  ): Promise<ProfileResponseDto> {
    const profile = await this.playerProfileRepo.findOne({ where: { userId: user.id } });
    return {
      ...base,
      id: profile?.id ?? user.id,
      parentUserId: profile?.parentUserId ?? undefined,
      name: profile?.name,
      age: profile?.age ?? undefined,
      gender: profile?.gender ?? undefined,
      school: profile?.school ?? undefined,
      jerseyNumber: profile?.jerseyNumber ?? undefined,
      skillLevel: profile?.skillLevel ?? undefined,
      photoUrl: profile?.photoUrl ?? undefined,
    };
  }

  private async updateTrainerProfile(userId: string, dto: UpdateProfileDto): Promise<void> {
    const profile = await this.trainerProfileRepo.findOne({ where: { userId } });
    if (!profile) return;

    const updates: Partial<TrainerProfile> = {};
    if (dto.firstName !== undefined) updates.trainerName = dto.firstName;
    if (dto.phone !== undefined) updates.phone = dto.phone ?? null;

    if (Object.keys(updates).length > 0) {
      await this.trainerProfileRepo.update(profile.id, updates);
    }
  }

  private async updateCoachProfile(userId: string, dto: UpdateProfileDto): Promise<void> {
    const profile = await this.coachProfileRepo.findOne({ where: { userId } });
    if (!profile) return;

    const updates: Partial<CoachProfile> = {};
    if (dto.bio !== undefined) updates.bio = dto.bio ?? null;
    if (dto.credentials !== undefined) updates.credentials = dto.credentials ?? null;
    if (dto.publicProfile !== undefined) updates.publicProfile = dto.publicProfile;

    if (Object.keys(updates).length > 0) {
      await this.coachProfileRepo.update(profile.id, updates);
    }
  }

  private async updatePlayerProfile(userId: string, dto: UpdateProfileDto): Promise<void> {
    const profile = await this.playerProfileRepo.findOne({ where: { userId } });
    if (!profile) return;

    const updates: Partial<PlayerProfile> = {};
    if (dto.school !== undefined) updates.school = dto.school ?? null;
    if (dto.jerseyNumber !== undefined) updates.jerseyNumber = dto.jerseyNumber ?? null;

    if (Object.keys(updates).length > 0) {
      await this.playerProfileRepo.update(profile.id, updates);
    }
  }
}
