import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoachProfile } from '../users/entities/coach-profile.entity';
import { ShareLink } from '../sharelinks/entities/share-link.entity';
import { CoachesService } from './coaches.service';
import { CoachesController } from './coaches.controller';
import { ShareLinksModule } from '../sharelinks/sharelinks.module';
import { EmailModule } from '../../shared/integrations/email/email.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CoachProfile, ShareLink]),
    ShareLinksModule,
    EmailModule,
  ],
  controllers: [CoachesController],
  providers: [CoachesService],
  exports: [CoachesService],
})
export class CoachesModule {}
