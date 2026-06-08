import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionContextService } from './session-context.service';
import { LocalStrategy } from './strategies/local.strategy';
import { PasswordService } from '../../shared/crypto/password.service';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [
    PassportModule,
    TypeOrmModule.forFeature([User]),
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
