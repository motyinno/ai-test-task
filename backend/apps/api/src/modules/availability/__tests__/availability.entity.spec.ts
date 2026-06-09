import { Availability, AvailabilitySubjectType, DayOfWeek } from '../entities/availability.entity';
import { CoachAvailabilityOverride } from '../entities/coach-availability-override.entity';

/**
 * E1: Availability entity shape tests.
 * Validates column types, defaults, and enum values are correct.
 */
describe('Availability entity (E1)', () => {
  it('creates a PLAYER availability slot with correct defaults', () => {
    const slot = new Availability();
    slot.id = 'test-uuid';
    slot.trainerId = 'trainer-1';
    slot.subjectType = AvailabilitySubjectType.PLAYER;
    slot.subjectId = 'player-profile-1';
    slot.dayOfWeek = DayOfWeek.MON;
    slot.startTime = '16:00';
    slot.endTime = '18:00';

    expect(slot.isAvailable).toBe(true);
    expect(slot.subjectType).toBe('PLAYER');
    expect(slot.dayOfWeek).toBe('MON');
    expect(slot.startTime).toBe('16:00');
    expect(slot.endTime).toBe('18:00');
  });

  it('creates a COACH availability slot', () => {
    const slot = new Availability();
    slot.trainerId = 'trainer-1';
    slot.subjectType = AvailabilitySubjectType.COACH;
    slot.subjectId = 'coach-profile-1';
    slot.dayOfWeek = DayOfWeek.WED;
    slot.startTime = '17:00';
    slot.endTime = '20:00';

    expect(slot.subjectType).toBe('COACH');
    expect(slot.dayOfWeek).toBe('WED');
  });

  it('has all DayOfWeek enum values', () => {
    const days = Object.values(DayOfWeek);
    expect(days).toEqual(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']);
  });

  it('has both AvailabilitySubjectType values', () => {
    expect(AvailabilitySubjectType.COACH).toBe('COACH');
    expect(AvailabilitySubjectType.PLAYER).toBe('PLAYER');
  });

  it('allows isAvailable to be set to false (blocked slot)', () => {
    const slot = new Availability();
    slot.isAvailable = false;
    expect(slot.isAvailable).toBe(false);
  });
});

describe('CoachAvailabilityOverride entity (E5)', () => {
  it('creates an override record with required fields', () => {
    const override = new CoachAvailabilityOverride();
    override.coachId = 'coach-profile-1';
    override.overriddenByTrainerId = 'trainer-1';
    override.reason = 'Player finals event requires all coaches';

    expect(override.coachId).toBe('coach-profile-1');
    expect(override.overriddenByTrainerId).toBe('trainer-1');
    expect(override.reason).toBe('Player finals event requires all coaches');
    expect(override.eventId).toBeNull();
  });

  it('allows eventId to be set (Epic-02 hook)', () => {
    const override = new CoachAvailabilityOverride();
    override.coachId = 'coach-1';
    override.overriddenByTrainerId = 'trainer-1';
    override.reason = 'Test';
    override.eventId = 'event-uuid-001';

    expect(override.eventId).toBe('event-uuid-001');
  });
});
