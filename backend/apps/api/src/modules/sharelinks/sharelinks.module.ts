import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShareLink } from './entities/share-link.entity';
import { TrainerProfile } from '../users/entities/trainer-profile.entity';
import { ShareLinksRepository } from './sharelinks.repository';
import { ShareLinksService } from './sharelinks.service';
import { ShareLinksController } from './sharelinks.controller';
import { TenancyModule } from '../../shared/tenancy/tenancy.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ShareLink, TrainerProfile]),
    TenancyModule,
  ],
  controllers: [ShareLinksController],
  providers: [ShareLinksRepository, ShareLinksService],
  exports: [ShareLinksService, ShareLinksRepository],
})
export class ShareLinksModule {}
