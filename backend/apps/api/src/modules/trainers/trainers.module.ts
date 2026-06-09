import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TrainersController } from './trainers.controller';
import { AvailabilityModule } from '../availability/availability.module';
import { TenancyModule } from '../../shared/tenancy/tenancy.module';
import { PortalBranding } from './entities/portal-branding.entity';
import { PortalBrandingRepository } from './portal-branding.repository';
import { BrandingService } from './branding.service';

/**
 * TrainersModule — trainer-facing features.
 *
 * Phase E: player availability view (E4) via AvailabilityService.
 * Phase G: branding (GET/PUT /trainers/me/branding, POST /trainers/me/branding/logo) — G1.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([PortalBranding]),
    AvailabilityModule,
    TenancyModule,
  ],
  controllers: [TrainersController],
  providers: [PortalBrandingRepository, BrandingService],
  exports: [BrandingService],
})
export class TrainersModule {}
