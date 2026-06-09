import { Module } from '@nestjs/common';
import { TrainersController } from './trainers.controller';
import { AvailabilityModule } from '../availability/availability.module';

/**
 * TrainersModule — trainer-facing features.
 *
 * Phase E: player availability view (E4) via AvailabilityService.
 * Phase G: branding (GET/PUT /trainers/me/branding) — out of scope for Phase E.
 *
 * No providers of its own — delegates to AvailabilityModule.
 */
@Module({
  imports: [AvailabilityModule],
  controllers: [TrainersController],
})
export class TrainersModule {}
