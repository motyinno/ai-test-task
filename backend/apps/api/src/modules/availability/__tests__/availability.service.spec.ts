import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AvailabilityService } from '../availability.service';
import { AvailabilityRepository } from '../availability.repository';
import { Availability, AvailabilitySubjectType, DayOfWeek } from '../entities/availability.entity';
import { CoachAvailabilityOverride } from '../entities/coach-availability-override.entity';
import { PlayerProfile } from '../../users/entities/player-profile.entity';
import { CoachProfile } from '../../users/entities/coach-profile.entity';
import { SetAvailabilityDto } from '../dto/set-availability.dto';
import { AvailabilitySlotDto } from '../dto/availability-slot.dto';
import { PlayerAvailabilityQueryDto } from '../dto/player-availability-query.dto';

/** Build a mock AvailabilityRepository */
function makeMockAvailabilityRepo() {
  return {
    findBySubject: jest.fn(),
    replaceSlots: jest.fn(),
    findPlayerSlotsForTrainer: jest.fn(),
    checkCoachConflict: jest.fn(),
    logOverride: jest.fn(),
    findOverridesForCoach: jest.fn(),
  };
}

/** Build a minimal Availability slot */
function makeSlot(overrides: Partial<Availability> = {}): Availability {
  return {
    id: 'slot-1',
    trainerId: 'trainer-1',
    subjectType: AvailabilitySubjectType.PLAYER,
    subjectId: 'profile-1',
    dayOfWeek: DayOfWeek.MON,
    startTime: '16:00',
    endTime: '18:00',
    isAvailable: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/** Build a minimal PlayerProfile */
function makePlayerProfile(overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  return {
    id: 'profile-1',
    userId: 'user-1',
    parentUserId: null,
    name: 'Alice',
    age: null,
    gender: null,
    school: null,
    jerseyNumber: null,
    skillLevel: null,
    photoUrl: null,
    isChild: false,
    allowTokenSpendWithoutApproval: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/** Build a minimal CoachProfile */
function makeCoachProfile(overrides: Partial<CoachProfile> = {}): CoachProfile {
  return {
    id: 'coach-profile-1',
    userId: 'coach-user-1',
    trainerId: 'trainer-1',
    bio: null,
    credentials: null,
    publicProfile: false,
    photoUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('AvailabilityService', () => {
  let service: AvailabilityService;
  let availabilityRepo: ReturnType<typeof makeMockAvailabilityRepo>;
  let playerProfileRepo: { findOne: jest.Mock };
  let coachProfileRepo: { findOne: jest.Mock };

  beforeEach(async () => {
    availabilityRepo = makeMockAvailabilityRepo();
    playerProfileRepo = { findOne: jest.fn() };
    coachProfileRepo = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AvailabilityService,
        { provide: AvailabilityRepository, useValue: availabilityRepo },
        { provide: getRepositoryToken(PlayerProfile), useValue: playerProfileRepo },
        { provide: getRepositoryToken(CoachProfile), useValue: coachProfileRepo },
      ],
    }).compile();

    service = module.get(AvailabilityService);
  });

  // ─── E2: Player Best Times ─────────────────────────────────────────────────

  describe('getPlayerAvailability (E2)', () => {
    it('returns slots when caller is the direct profile owner', async () => {
      const profile = makePlayerProfile({ id: 'profile-1', userId: 'user-1' });
      const slots = [makeSlot()];
      playerProfileRepo.findOne.mockResolvedValue(profile);
      availabilityRepo.findBySubject.mockResolvedValue(slots);

      const result = await service.getPlayerAvailability('profile-1', 'user-1', 'trainer-1');

      expect(result).toEqual(slots);
      expect(availabilityRepo.findBySubject).toHaveBeenCalledWith(
        AvailabilitySubjectType.PLAYER,
        'profile-1',
      );
    });

    it('returns slots when caller is the parent of the child profile', async () => {
      const childProfile = makePlayerProfile({
        id: 'child-profile-1',
        userId: 'child-user-1',
        parentUserId: 'parent-user-1',
        isChild: true,
      });
      const slots = [makeSlot({ subjectId: 'child-profile-1' })];
      playerProfileRepo.findOne.mockResolvedValue(childProfile);
      availabilityRepo.findBySubject.mockResolvedValue(slots);

      const result = await service.getPlayerAvailability(
        'child-profile-1',
        'parent-user-1',  // parent calling
        'trainer-1',
      );

      expect(result).toEqual(slots);
    });

    it('throws 403 AVAILABILITY_ACCESS_DENIED when caller does NOT own the profile', async () => {
      // SANITY CHECK: a parent cannot access another parent's child profile
      const profile = makePlayerProfile({
        id: 'profile-1',
        userId: 'actual-owner',
        parentUserId: 'actual-parent',
      });
      playerProfileRepo.findOne.mockResolvedValue(profile);

      await expect(
        service.getPlayerAvailability('profile-1', 'wrong-caller', 'trainer-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws 403 when a child profile is accessed by unrelated user (sanity check)', async () => {
      // SANITY CHECK: wrong parent cannot access another parent's child
      const childProfile = makePlayerProfile({
        id: 'child-profile-1',
        userId: 'child-user-1',
        parentUserId: 'real-parent-id',
        isChild: true,
      });
      playerProfileRepo.findOne.mockResolvedValue(childProfile);

      await expect(
        service.getPlayerAvailability('child-profile-1', 'attacker-user', 'trainer-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws 404 when player profile not found', async () => {
      playerProfileRepo.findOne.mockResolvedValue(null);

      await expect(
        service.getPlayerAvailability('nonexistent', 'user-1', 'trainer-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('setPlayerAvailability (E2)', () => {
    it('replaces slots and returns new slots for valid owner', async () => {
      const profile = makePlayerProfile({ id: 'profile-1', userId: 'user-1' });
      const saved = [makeSlot()];
      playerProfileRepo.findOne.mockResolvedValue(profile);
      availabilityRepo.replaceSlots.mockResolvedValue(saved);

      const dto: SetAvailabilityDto = {
        slots: [
          Object.assign(new AvailabilitySlotDto(), {
            dayOfWeek: DayOfWeek.MON,
            startTime: '16:00',
            endTime: '18:00',
          }),
        ],
      };

      const result = await service.setPlayerAvailability('profile-1', 'user-1', 'trainer-1', dto);

      expect(result).toEqual(saved);
      expect(availabilityRepo.replaceSlots).toHaveBeenCalledWith(
        'trainer-1',
        AvailabilitySubjectType.PLAYER,
        'profile-1',
        [{ dayOfWeek: DayOfWeek.MON, startTime: '16:00', endTime: '18:00' }],
      );
    });

    it('throws 403 when caller does not own the profile (SANITY CHECK — write path)', async () => {
      // SANITY CHECK: unauthorized write to availability must be rejected
      const profile = makePlayerProfile({
        id: 'profile-1',
        userId: 'actual-owner',
        parentUserId: 'actual-parent',
      });
      playerProfileRepo.findOne.mockResolvedValue(profile);

      const dto: SetAvailabilityDto = { slots: [] };

      await expect(
        service.setPlayerAvailability('profile-1', 'attacker', 'trainer-1', dto),
      ).rejects.toThrow(ForbiddenException);

      // replaceSlots must NOT have been called
      expect(availabilityRepo.replaceSlots).not.toHaveBeenCalled();
    });

    it('throws 400 INVALID_TIME_RANGE when endTime <= startTime', async () => {
      const profile = makePlayerProfile({ id: 'profile-1', userId: 'user-1' });
      playerProfileRepo.findOne.mockResolvedValue(profile);

      const dto: SetAvailabilityDto = {
        slots: [
          Object.assign(new AvailabilitySlotDto(), {
            dayOfWeek: DayOfWeek.MON,
            startTime: '18:00',
            endTime: '16:00',  // endTime before startTime
          }),
        ],
      };

      await expect(
        service.setPlayerAvailability('profile-1', 'user-1', 'trainer-1', dto),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts empty slots array (clears availability)', async () => {
      const profile = makePlayerProfile({ id: 'profile-1', userId: 'user-1' });
      playerProfileRepo.findOne.mockResolvedValue(profile);
      availabilityRepo.replaceSlots.mockResolvedValue([]);

      const dto: SetAvailabilityDto = { slots: [] };
      const result = await service.setPlayerAvailability('profile-1', 'user-1', 'trainer-1', dto);

      expect(result).toEqual([]);
    });
  });

  // ─── E3: Coach My Times ────────────────────────────────────────────────────

  describe('getCoachAvailability (E3)', () => {
    it('returns slots for a coach by userId', async () => {
      const coachProfile = makeCoachProfile();
      const slots = [makeSlot({ subjectType: AvailabilitySubjectType.COACH, subjectId: 'coach-profile-1' })];
      coachProfileRepo.findOne.mockResolvedValue(coachProfile);
      availabilityRepo.findBySubject.mockResolvedValue(slots);

      const result = await service.getCoachAvailability('coach-user-1');

      expect(result).toEqual(slots);
      expect(availabilityRepo.findBySubject).toHaveBeenCalledWith(
        AvailabilitySubjectType.COACH,
        'coach-profile-1',
      );
    });

    it('throws 404 when coach profile not found', async () => {
      coachProfileRepo.findOne.mockResolvedValue(null);

      await expect(service.getCoachAvailability('nonexistent-user')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('setCoachAvailability (E3)', () => {
    it('replaces coach slots and returns new slots', async () => {
      const coachProfile = makeCoachProfile();
      const saved = [makeSlot({ subjectType: AvailabilitySubjectType.COACH })];
      coachProfileRepo.findOne.mockResolvedValue(coachProfile);
      availabilityRepo.replaceSlots.mockResolvedValue(saved);

      const dto: SetAvailabilityDto = {
        slots: [
          Object.assign(new AvailabilitySlotDto(), {
            dayOfWeek: DayOfWeek.WED,
            startTime: '17:00',
            endTime: '20:00',
          }),
        ],
      };

      const result = await service.setCoachAvailability('coach-user-1', dto);

      expect(result).toEqual(saved);
      expect(availabilityRepo.replaceSlots).toHaveBeenCalledWith(
        'trainer-1',  // coachProfile.trainerId
        AvailabilitySubjectType.COACH,
        'coach-profile-1',
        [{ dayOfWeek: DayOfWeek.WED, startTime: '17:00', endTime: '20:00' }],
      );
    });

    it('allows multiple slots per day (E3 requirement)', async () => {
      const coachProfile = makeCoachProfile();
      coachProfileRepo.findOne.mockResolvedValue(coachProfile);
      availabilityRepo.replaceSlots.mockResolvedValue([]);

      const dto: SetAvailabilityDto = {
        slots: [
          Object.assign(new AvailabilitySlotDto(), { dayOfWeek: DayOfWeek.MON, startTime: '09:00', endTime: '12:00' }),
          Object.assign(new AvailabilitySlotDto(), { dayOfWeek: DayOfWeek.MON, startTime: '14:00', endTime: '17:00' }),
        ],
      };

      await service.setCoachAvailability('coach-user-1', dto);

      expect(availabilityRepo.replaceSlots).toHaveBeenCalledWith(
        'trainer-1',
        AvailabilitySubjectType.COACH,
        'coach-profile-1',
        [
          { dayOfWeek: DayOfWeek.MON, startTime: '09:00', endTime: '12:00' },
          { dayOfWeek: DayOfWeek.MON, startTime: '14:00', endTime: '17:00' },
        ],
      );
    });
  });

  // ─── E4: Trainer player availability view ──────────────────────────────────

  describe('getTrainerPlayerAvailability (E4)', () => {
    it('returns paginated player slots for the trainer org', async () => {
      const slots = [makeSlot(), makeSlot({ id: 'slot-2' })];
      availabilityRepo.findPlayerSlotsForTrainer.mockResolvedValue({ slots, total: 2 });

      const query = new PlayerAvailabilityQueryDto();
      query.page = 1;
      query.limit = 20;

      const result = await service.getTrainerPlayerAvailability('trainer-1', query);

      expect(result.data).toEqual(slots);
      expect(result.meta.total).toBe(2);
      expect(result.meta.page).toBe(1);
      expect(result.meta.totalPages).toBe(1);
      expect(availabilityRepo.findPlayerSlotsForTrainer).toHaveBeenCalledWith('trainer-1', {
        day: undefined,
        fromTime: undefined,
        toTime: undefined,
        page: 1,
        limit: 20,
      });
    });

    it('passes day/time filters through to repository (SANITY CHECK: tenant isolation)', async () => {
      availabilityRepo.findPlayerSlotsForTrainer.mockResolvedValue({ slots: [], total: 0 });

      const query = new PlayerAvailabilityQueryDto();
      query.page = 1;
      query.limit = 10;
      query.day = DayOfWeek.TUE;
      query.fromTime = '16:00';
      query.toTime = '20:00';

      await service.getTrainerPlayerAvailability('trainer-1', query);

      // Verify the trainerId is always passed (tenant isolation check)
      expect(availabilityRepo.findPlayerSlotsForTrainer).toHaveBeenCalledWith(
        'trainer-1',
        expect.objectContaining({ day: DayOfWeek.TUE, fromTime: '16:00', toTime: '20:00' }),
      );
    });
  });

  // ─── E5: Conflict check + override ────────────────────────────────────────

  describe('checkCoachConflict (E5)', () => {
    it('returns true (conflict) when coach has no slot for the window', async () => {
      availabilityRepo.checkCoachConflict.mockResolvedValue(true);

      const result = await service.checkCoachConflict(
        'coach-profile-1',
        DayOfWeek.FRI,
        '18:00',
        '20:00',
      );

      expect(result).toBe(true);
    });

    it('returns false (no conflict) when coach has covering slot', async () => {
      availabilityRepo.checkCoachConflict.mockResolvedValue(false);

      const result = await service.checkCoachConflict(
        'coach-profile-1',
        DayOfWeek.MON,
        '16:00',
        '18:00',
      );

      expect(result).toBe(false);
    });
  });

  describe('logCoachAvailabilityOverride (E5)', () => {
    it('logs an override and returns the record', async () => {
      const override = {
        id: 'override-1',
        coachId: 'coach-profile-1',
        overriddenByTrainerId: 'trainer-1',
        eventId: null,
        reason: 'Championship finals require all coaches',
        createdAt: new Date(),
      } as CoachAvailabilityOverride;
      availabilityRepo.logOverride.mockResolvedValue(override);

      const result = await service.logCoachAvailabilityOverride({
        coachId: 'coach-profile-1',
        overriddenByTrainerId: 'trainer-1',
        eventId: null,
        reason: 'Championship finals require all coaches',
      });

      expect(result.coachId).toBe('coach-profile-1');
      expect(result.reason).toBe('Championship finals require all coaches');
      expect(availabilityRepo.logOverride).toHaveBeenCalledWith(expect.objectContaining({
        reason: 'Championship finals require all coaches',
      }));
    });

    it('throws 400 OVERRIDE_REASON_REQUIRED when reason is empty (SANITY CHECK — BR-016)', async () => {
      // SANITY CHECK: override MUST have a reason — empty string rejected
      await expect(
        service.logCoachAvailabilityOverride({
          coachId: 'coach-profile-1',
          overriddenByTrainerId: 'trainer-1',
          eventId: null,
          reason: '',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(availabilityRepo.logOverride).not.toHaveBeenCalled();
    });

    it('throws 400 OVERRIDE_REASON_REQUIRED when reason is whitespace only (SANITY CHECK)', async () => {
      await expect(
        service.logCoachAvailabilityOverride({
          coachId: 'coach-profile-1',
          overriddenByTrainerId: 'trainer-1',
          eventId: null,
          reason: '   ',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts an eventId for Epic-02 hook', async () => {
      const override = {
        id: 'override-2',
        coachId: 'coach-profile-1',
        overriddenByTrainerId: 'trainer-1',
        eventId: 'event-uuid-123',
        reason: 'Regional tournament',
        createdAt: new Date(),
      } as CoachAvailabilityOverride;
      availabilityRepo.logOverride.mockResolvedValue(override);

      const result = await service.logCoachAvailabilityOverride({
        coachId: 'coach-profile-1',
        overriddenByTrainerId: 'trainer-1',
        eventId: 'event-uuid-123',
        reason: 'Regional tournament',
      });

      expect(result.eventId).toBe('event-uuid-123');
    });
  });
});
