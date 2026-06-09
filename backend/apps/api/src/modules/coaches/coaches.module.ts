import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoachProfile } from '../users/entities/coach-profile.entity';
import { CoachesService } from './coaches.service';
import { CoachesController } from './coaches.controller';
import { ShareLinksModule } from '../sharelinks/sharelinks.module';
import { EmailModule } from '../../shared/integrations/email/email.module';
import { AvailabilityModule } from '../availability/availability.module';

@Module({
  imports: [
    // M-2: ShareLink raw repo removed — all ShareLink access now goes through
    // ShareLinksRepository (tenant-scoped) provided by ShareLinksModule.
    TypeOrmModule.forFeature([CoachProfile]),
    ShareLinksModule,
    EmailModule,
    AvailabilityModule,
  ],
  controllers: [CoachesController],
  providers: [CoachesService],
  exports: [CoachesService],
})
export class CoachesModule {}
