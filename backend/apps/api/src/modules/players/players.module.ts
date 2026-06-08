import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { PlayerProfile } from '../users/entities/player-profile.entity';
import { TrainerPlayerAssociation } from './entities/trainer-player-association.entity';
import { PlayersRepository } from './players.repository';
import { PlayersService } from './players.service';
import { PlayersController } from './players.controller';
import { ShareLinksModule } from '../sharelinks/sharelinks.module';
import { UsersModule } from '../users/users.module';
import { EmailModule } from '../../shared/integrations/email/email.module';
import { PasswordService } from '../../shared/crypto/password.service';
import { TenancyModule } from '../../shared/tenancy/tenancy.module';
import { TrainerProfile } from '../users/entities/trainer-profile.entity';
import { CoachProfile } from '../users/entities/coach-profile.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      PlayerProfile,
      TrainerPlayerAssociation,
      TrainerProfile,
      CoachProfile,
    ]),
    ShareLinksModule,
    UsersModule,
    EmailModule,
    TenancyModule,
  ],
  controllers: [PlayersController],
  providers: [PlayersRepository, PlayersService, PasswordService],
  exports: [PlayersService, PlayersRepository],
})
export class PlayersModule {}
