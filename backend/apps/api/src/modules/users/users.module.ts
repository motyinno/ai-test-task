import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailModule } from '../../shared/integrations/email/email.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';
import { User } from './entities/user.entity';
import { TrainerProfile } from './entities/trainer-profile.entity';
import { CoachProfile } from './entities/coach-profile.entity';
import { PlayerProfile } from './entities/player-profile.entity';
import { UserDeletionLog } from './entities/user-deletion-log.entity';
import { PasswordService } from '../../shared/crypto/password.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, TrainerProfile, CoachProfile, PlayerProfile, UserDeletionLog]),
    EmailModule,
  ],
  controllers: [UsersController],
  providers: [UsersService, UsersRepository, PasswordService],
  exports: [UsersService, UsersRepository],
})
export class UsersModule {}
