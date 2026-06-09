import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Availability } from './entities/availability.entity';
import { CoachAvailabilityOverride } from './entities/coach-availability-override.entity';
import { AvailabilityRepository } from './availability.repository';
import { AvailabilityService } from './availability.service';
import { TenancyModule } from '../../shared/tenancy/tenancy.module';
import { PlayerProfile } from '../users/entities/player-profile.entity';
import { CoachProfile } from '../users/entities/coach-profile.entity';

/**
 * AvailabilityModule — shared module for E2–E5.
 *
 * Provides AvailabilityService and AvailabilityRepository.
 * Imported by PlayersModule (E2), CoachesModule (E3), and TrainersModule (E4).
 *
 * Entities registered:
 *   - Availability (availability_slots) — tenant-scoped advisory data (BR-015)
 *   - CoachAvailabilityOverride (coach_availability_overrides) — audit log (BR-016)
 *   - PlayerProfile — for ownership checks (E2)
 *   - CoachProfile — for resolving coachUserId → coachProfileId (E3)
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Availability,
      CoachAvailabilityOverride,
      PlayerProfile,
      CoachProfile,
    ]),
    TenancyModule,
  ],
  providers: [AvailabilityRepository, AvailabilityService],
  exports: [AvailabilityService, AvailabilityRepository],
})
export class AvailabilityModule {}
