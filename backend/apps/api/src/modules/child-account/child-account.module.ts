import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChildLogin } from './entities/child-login.entity';
import { PlayerProfile } from '../users/entities/player-profile.entity';
import { ChildAccountService } from './child-account.service';
import { PasswordService } from '../../shared/crypto/password.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChildLogin, PlayerProfile]),
  ],
  providers: [ChildAccountService, PasswordService],
  exports: [ChildAccountService, TypeOrmModule],
})
export class ChildAccountModule {}
