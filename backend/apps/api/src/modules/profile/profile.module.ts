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
    MulterModule.register({ dest: './uploads' }),
    StorageModule,
  ],
  controllers: [ProfileController],
  providers: [ProfileService],
  exports: [ProfileService],
})
export class ProfileModule {}
