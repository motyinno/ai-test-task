import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { EmailModule } from '../../shared/integrations/email/email.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionContextService } from './session-context.service';
import { LocalStrategy } from './strategies/local.strategy';
import { PasswordService } from '../../shared/crypto/password.service';
import { User } from '../users/entities/user.entity';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { EmailVerificationToken } from './entities/email-verification-token.entity';
import { InvitationToken } from './entities/invitation-token.entity';
import { ChildLogin } from '../child-account/entities/child-login.entity';
import { PlayerProfile } from '../users/entities/player-profile.entity';

@Module({
  imports: [
    PassportModule,
    TypeOrmModule.forFeature([
      User,
      PasswordResetToken,
      EmailVerificationToken,
      InvitationToken,
      ChildLogin,
      PlayerProfile,
    ]),
    EmailModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionContextService,
    LocalStrategy,
    PasswordService,
  ],
  exports: [SessionContextService],
})
export class AuthModule {}
