import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { PlayerProfile } from '../users/entities/player-profile.entity';
import { TrainerPlayerAssociation } from './entities/trainer-player-association.entity';
import { ChildLogin } from '../child-account/entities/child-login.entity';
import { ShareLink } from '../sharelinks/entities/share-link.entity';
import { PlayersRepository } from './players.repository';
import { PlayersService } from './players.service';
import { PlayersChildService } from './players-child.service';
import { PlayersController } from './players.controller';
import { ShareLinksModule } from '../sharelinks/sharelinks.module';
import { UsersModule } from '../users/users.module';
import { EmailModule } from '../../shared/integrations/email/email.module';
import { PasswordService } from '../../shared/crypto/password.service';
import { TenancyModule } from '../../shared/tenancy/tenancy.module';
import { TrainerProfile } from '../users/entities/trainer-profile.entity';
import { CoachProfile } from '../users/entities/coach-profile.entity';
import { ApprovalsModule } from '../approvals/approvals.module';
import { SessionContextService } from '../auth/session-context.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      PlayerProfile,
      TrainerPlayerAssociation,
      TrainerProfile,
      CoachProfile,
      ChildLogin,
      ShareLink,
    ]),
    ShareLinksModule,
    UsersModule,
    EmailModule,
    TenancyModule,
    ApprovalsModule,
  ],
  controllers: [PlayersController],
  providers: [
    PlayersRepository,
    PlayersService,
    PlayersChildService,
    PasswordService,
    SessionContextService,
  ],
  exports: [PlayersService, PlayersRepository, PlayersChildService],
})
export class PlayersModule {}
