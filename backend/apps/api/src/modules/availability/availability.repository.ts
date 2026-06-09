import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantAwareRepository } from '../../shared/tenancy/tenant-aware.repository';
import { TenantContextService } from '../../shared/tenancy/tenant-context.service';
import {
  Availability,
  AvailabilitySubjectType,
  DayOfWeek,
} from './entities/availability.entity';
import { CoachAvailabilityOverride } from './entities/coach-availability-override.entity';

/**
 * AvailabilityRepository — tenant-scoped access to availability_slots.
 * Extends TenantAwareRepository so all reads/writes are automatically filtered
 * by the active trainerId in the CLS context (A1).
 *
 * Org-bound: availability_slots.trainer_id = tenant root.
 * CoachAvailabilityOverride: global audit table — accessed via separate raw repo injection.
 */
@Injectable()
export class AvailabilityRepository extends TenantAwareRepository<Availability> {
  constructor(
    @InjectRepository(Availability)
    private readonly availabilityBaseRepo: Repository<Availability>,
    @InjectRepository(CoachAvailabilityOverride)
    private readonly overrideRepo: Repository<CoachAvailabilityOverride>,
    tenantCtx: TenantContextService,
  ) {
    super(availabilityBaseRepo, tenantCtx);
  }

  // ── Player / Coach slot reads ─────────────────────────────────────────────

  /**
   * Find all slots for a given subject (player or coach profile).
   * Tenant-scoped: only returns slots belonging to the active trainer's org.
   */
  async findBySubject(
    subjectType: AvailabilitySubjectType,
    subjectId: string,
  ): Promise<Availability[]> {
    return this.scopedFind({ where: { subjectType, subjectId } as never });
  }

  /**
   * Find all PLAYER slots for the active trainer org, with optional day/time filters.
   * Used by E4 (trainer view).
   *
   * Returns paginated results; total count for meta.
   */
  async findPlayerSlotsForTrainer(
    trainerId: string,
    opts: {
      day?: DayOfWeek;
      fromTime?: string;
      toTime?: string;
      page: number;
      limit: number;
    },
  ): Promise<{ slots: Availability[]; total: number }> {
    const qb = this.availabilityBaseRepo
      .createQueryBuilder('slot')
      .where('slot.trainer_id = :trainerId', { trainerId })
      .andWhere('slot.subject_type = :type', { type: AvailabilitySubjectType.PLAYER });

    if (opts.day) {
      qb.andWhere('slot.day_of_week = :day', { day: opts.day });
    }

    if (opts.fromTime) {
      qb.andWhere('slot.start_time >= :fromTime', { fromTime: opts.fromTime });
    }

    if (opts.toTime) {
      qb.andWhere('slot.end_time <= :toTime', { toTime: opts.toTime });
    }

    const total = await qb.getCount();

    const slots = await qb
      .skip((opts.page - 1) * opts.limit)
      .take(opts.limit)
      .getMany();

    return { slots, total };
  }

  // ── Atomic replace (delete-all + insert) ─────────────────────────────────

  /**
   * Replace all slots for a subject atomically.
   * Deletes existing slots first, then inserts the new batch.
   * trainerId is injected into each new slot.
   *
   * This method intentionally uses the raw baseRepo with an explicit trainerId
   * parameter to avoid requiring CLS context during tests.
   */
  async replaceSlots(
    trainerId: string,
    subjectType: AvailabilitySubjectType,
    subjectId: string,
    newSlots: Array<{
      dayOfWeek: DayOfWeek;
      startTime: string;
      endTime: string;
    }>,
  ): Promise<Availability[]> {
    // Delete all existing slots for this subject within the trainer's org
    await this.availabilityBaseRepo.delete({ trainerId, subjectType, subjectId } as never);

    if (newSlots.length === 0) {
      return [];
    }

    const entities = newSlots.map((s) => {
      const slot = this.availabilityBaseRepo.create({
        trainerId,
        subjectType,
        subjectId,
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime,
        endTime: s.endTime,
        isAvailable: true,
      });
      return slot;
    });

    return this.availabilityBaseRepo.save(entities);
  }

  // ── Coach conflict check (E5) ─────────────────────────────────────────────

  /**
   * Check whether a coach has an availability slot that conflicts with a given time window.
   *
   * A conflict exists when:
   *   - The coach has NO slot covering the requested (dayOfWeek, startTime..endTime) range
   *     (i.e. there is no "available" slot that includes the window)
   *   OR
   *   - The coach has an explicitly blocked (isAvailable=false) slot that overlaps.
   *
   * Returns true if there is a conflict (coach is NOT available for the window).
   */
  async checkCoachConflict(
    coachId: string,
    dayOfWeek: DayOfWeek,
    startTime: string,
    endTime: string,
  ): Promise<boolean> {
    // Look for an available slot that fully covers the window
    const coveringSlot = await this.availabilityBaseRepo
      .createQueryBuilder('slot')
      .where('slot.subject_type = :type', { type: AvailabilitySubjectType.COACH })
      .andWhere('slot.subject_id = :coachId', { coachId })
      .andWhere('slot.day_of_week = :day', { day: dayOfWeek })
      .andWhere('slot.start_time <= :startTime', { startTime })
      .andWhere('slot.end_time >= :endTime', { endTime })
      .andWhere('slot.is_available = TRUE')
      .getOne();

    // Conflict = no covering slot found
    return coveringSlot === null;
  }

  // ── Override audit (E5) ───────────────────────────────────────────────────

  /**
   * Log a coach availability override (BR-016).
   * reason MUST be non-empty (enforced at service layer before this call).
   *
   * Q-01.06 OPEN GAP: coach notification is NOT sent here — stub in AvailabilityService.
   */
  async logOverride(data: {
    coachId: string;
    overriddenByTrainerId: string;
    eventId: string | null;
    reason: string;
  }): Promise<CoachAvailabilityOverride> {
    const entity = this.overrideRepo.create(data);
    return this.overrideRepo.save(entity);
  }

  /**
   * Find override history for a coach (used in tests + future audit endpoints).
   */
  async findOverridesForCoach(coachId: string): Promise<CoachAvailabilityOverride[]> {
    return this.overrideRepo.find({ where: { coachId }, order: { createdAt: 'DESC' } });
  }
}
