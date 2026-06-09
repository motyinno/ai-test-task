import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Availability, AvailabilitySubjectType, DayOfWeek } from './entities/availability.entity';
import { CoachAvailabilityOverride } from './entities/coach-availability-override.entity';
import { AvailabilityRepository } from './availability.repository';
import { SetAvailabilityDto } from './dto/set-availability.dto';
import { PlayerAvailabilityQueryDto } from './dto/player-availability-query.dto';
import { PlayerProfile } from '../users/entities/player-profile.entity';
import { CoachProfile } from '../users/entities/coach-profile.entity';

/**
 * AvailabilityService — business logic for E2–E5.
 *
 * Ownership rules:
 *   - E2 (Player Best Times): caller must own the profile (or be the parent).
 *     A parent can only set availability for profiles where playerProfile.parentUserId === caller.
 *   - E3 (Coach My Times): caller's coachProfile.id is used directly from session.
 *   - E4 (Trainer view): trainer sees all their org's player slots, filtered.
 *   - E5 (Override): trainer logs a conflict override; reason is required (BR-016).
 *     Coach-notify is a documented stub (Q-01.06).
 */
@Injectable()
export class AvailabilityService {
  private readonly logger = new Logger(AvailabilityService.name);

  constructor(
    private readonly availabilityRepo: AvailabilityRepository,
    @InjectRepository(PlayerProfile)
    private readonly playerProfileRepo: Repository<PlayerProfile>,
    @InjectRepository(CoachProfile)
    private readonly coachProfileRepo: Repository<CoachProfile>,
  ) {}

  // ── E2: Player Best Times ─────────────────────────────────────────────────

  /**
   * Get availability slots for a player profile.
   * Caller must own the profile (or be the parent of the child profile).
   *
   * trainerId context: required to ensure the slots returned are tenant-scoped.
   * Advisory (BR-015): no enforcement side-effects on read.
   */
  async getPlayerAvailability(
    profileId: string,
    callerId: string,
    trainerId: string,
  ): Promise<Availability[]> {
    const profile = await this.findPlayerProfileOrThrow(profileId);
    this.assertCallerOwnsProfile(profile, callerId);

    return this.availabilityRepo.findBySubject(AvailabilitySubjectType.PLAYER, profileId);
  }

  /**
   * Set (replace) availability slots for a player profile.
   * Uses atomic delete-all + insert for the subject.
   *
   * Validates: time format (already enforced by DTO), endTime > startTime.
   * Security: caller must be parent or direct owner of the profile.
   */
  async setPlayerAvailability(
    profileId: string,
    callerId: string,
    trainerId: string,
    dto: SetAvailabilityDto,
  ): Promise<Availability[]> {
    const profile = await this.findPlayerProfileOrThrow(profileId);
    this.assertCallerOwnsProfile(profile, callerId);
    this.validateSlotTimes(dto.slots);

    return this.availabilityRepo.replaceSlots(
      trainerId,
      AvailabilitySubjectType.PLAYER,
      profileId,
      dto.slots.map((s) => ({
        dayOfWeek: s.dayOfWeek as DayOfWeek,
        startTime: s.startTime,
        endTime: s.endTime,
      })),
    );
  }

  // ── E3: Coach My Times ────────────────────────────────────────────────────

  /**
   * Get availability slots for the calling coach.
   * Looks up the CoachProfile by userId to resolve the profileId.
   */
  async getCoachAvailability(coachUserId: string): Promise<Availability[]> {
    const coachProfile = await this.findCoachProfileByUserIdOrThrow(coachUserId);
    return this.availabilityRepo.findBySubject(
      AvailabilitySubjectType.COACH,
      coachProfile.id,
    );
  }

  /**
   * Set (replace) coach availability slots.
   * Multiple slots per day are allowed (e.g. morning + evening).
   */
  async setCoachAvailability(
    coachUserId: string,
    dto: SetAvailabilityDto,
  ): Promise<Availability[]> {
    const coachProfile = await this.findCoachProfileByUserIdOrThrow(coachUserId);
    this.validateSlotTimes(dto.slots);

    return this.availabilityRepo.replaceSlots(
      coachProfile.trainerId,
      AvailabilitySubjectType.COACH,
      coachProfile.id,
      dto.slots.map((s) => ({
        dayOfWeek: s.dayOfWeek as DayOfWeek,
        startTime: s.startTime,
        endTime: s.endTime,
      })),
    );
  }

  // ── E4: Trainer player availability view ──────────────────────────────────

  /**
   * Trainer views aggregated player availability for their org, with optional filters.
   * Tenant-scoped to the trainer's org (trainerId from session principal).
   *
   * Returns paginated { data: [...], meta: { page, limit, total, totalPages } }.
   */
  async getTrainerPlayerAvailability(
    trainerId: string,
    query: PlayerAvailabilityQueryDto,
  ): Promise<{
    data: Availability[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const { slots, total } = await this.availabilityRepo.findPlayerSlotsForTrainer(trainerId, {
      day: query.day,
      fromTime: query.fromTime,
      toTime: query.toTime,
      page: query.page,
      limit: query.limit,
    });

    return {
      data: slots,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  // ── E5: Conflict check + override ────────────────────────────────────────

  /**
   * Check whether a coach has an availability conflict for a given time window.
   * Returns true if the coach is NOT available (conflict exists).
   *
   * Used by Epic-02 event assignment (not built yet — exposed as service method).
   */
  async checkCoachConflict(
    coachProfileId: string,
    dayOfWeek: DayOfWeek,
    startTime: string,
    endTime: string,
  ): Promise<boolean> {
    return this.availabilityRepo.checkCoachConflict(
      coachProfileId,
      dayOfWeek,
      startTime,
      endTime,
    );
  }

  /**
   * Log a coach availability override with a REQUIRED reason (BR-016).
   *
   * BR-016: reason must be non-empty. Throws BadRequestException if omitted.
   *
   * Q-01.06 OPEN GAP — Coach notification stub:
   *   After logging the override, the coach SHOULD be notified (email/push).
   *   This is deferred pending Epic-02 event domain + Q-01.06 resolution.
   *   When implemented, call: await this.notifyCoachOfOverride(coachId, override);
   */
  async logCoachAvailabilityOverride(data: {
    coachId: string;
    overriddenByTrainerId: string;
    eventId: string | null;
    reason: string;
  }): Promise<CoachAvailabilityOverride> {
    if (!data.reason || data.reason.trim().length === 0) {
      throw new BadRequestException({
        message: 'Override reason is required (BR-016)',
        errorCode: 'OVERRIDE_REASON_REQUIRED',
      });
    }

    const override = await this.availabilityRepo.logOverride(data);

    // Q-01.06 OPEN GAP: coach notification stub
    // TODO(Q-01.06): notify coach of override when Epic-02 event domain is ready.
    // await this.notifyCoachOfOverride(data.coachId, override);
    this.logger.warn(
      `[Q-01.06 STUB] Coach ${data.coachId} overridden by trainer ${data.overriddenByTrainerId} — coach notification NOT YET IMPLEMENTED`,
    );

    return override;
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  private async findPlayerProfileOrThrow(profileId: string): Promise<PlayerProfile> {
    const profile = await this.playerProfileRepo.findOne({ where: { id: profileId } });
    if (!profile) {
      throw new NotFoundException({
        message: `Player profile ${profileId} not found`,
        errorCode: 'PLAYER_PROFILE_NOT_FOUND',
      });
    }
    return profile;
  }

  private async findCoachProfileByUserIdOrThrow(userId: string): Promise<CoachProfile> {
    const profile = await this.coachProfileRepo.findOne({ where: { userId } });
    if (!profile) {
      throw new NotFoundException({
        message: 'Coach profile not found for this user',
        errorCode: 'COACH_PROFILE_NOT_FOUND',
      });
    }
    return profile;
  }

  /**
   * Enforce that the caller owns (or is the parent of) the player profile.
   *
   * Ownership:
   *   - Direct: profile.userId === callerId (adult standalone player)
   *   - Parent: profile.parentUserId === callerId (parent setting child's availability)
   *
   * Throws ForbiddenException (403) if the caller does not own the profile.
   * Sanity-check: a parent cannot edit a profile belonging to another parent's child.
   */
  private assertCallerOwnsProfile(profile: PlayerProfile, callerId: string): void {
    const isDirectOwner = profile.userId === callerId;
    const isParent = profile.parentUserId === callerId;

    if (!isDirectOwner && !isParent) {
      throw new ForbiddenException({
        message: 'You do not have permission to manage availability for this profile',
        errorCode: 'AVAILABILITY_ACCESS_DENIED',
      });
    }
  }

  /**
   * Validate that endTime > startTime for each slot.
   * HH:MM string comparison works for 24-hour times when zero-padded.
   */
  private validateSlotTimes(
    slots: Array<{ startTime: string; endTime: string }>,
  ): void {
    for (const slot of slots) {
      if (slot.endTime <= slot.startTime) {
        throw new BadRequestException({
          message: `endTime (${slot.endTime}) must be after startTime (${slot.startTime})`,
          errorCode: 'INVALID_TIME_RANGE',
        });
      }
    }
  }
}
