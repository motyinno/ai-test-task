import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { User } from '../users/entities/user.entity';
import { TrainerProfile } from '../users/entities/trainer-profile.entity';
import { CoachProfile } from '../users/entities/coach-profile.entity';
import { PlayerProfile } from '../users/entities/player-profile.entity';
import { StorageModule } from '../../shared/integrations/storage/storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, TrainerProfile, CoachProfile, PlayerProfile]),
    // Memory storage (no `dest`) so `file.buffer` is populated and StorageService
    // is the single source of truth for persisting + serving the file. With
    // `dest` (disk storage) buffer is undefined and multer dumps the upload to
    // ./uploads/<hash> with no served URL — the original "photo not visible" bug.
    MulterModule.register({}),
    StorageModule,
  ],
  controllers: [ProfileController],
  providers: [ProfileService],
  exports: [ProfileService],
})
export class ProfileModule {}
