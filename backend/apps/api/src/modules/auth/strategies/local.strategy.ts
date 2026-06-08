import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserStatus } from '../../users/entities/user.entity';
import { PasswordService } from '../../../shared/crypto/password.service';

export interface SessionPrincipal {
  id: string;
  email: string;
  role: string;
  status: UserStatus;
  emailVerified: boolean;
  mustChangePassword: boolean;
}

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly passwordService: PasswordService,
  ) {
    super({ usernameField: 'email' });
  }

  async validate(email: string, password: string): Promise<SessionPrincipal> {
    const user = await this.userRepo.findOne({ where: { email } });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValid = await this.passwordService.verify(user.passwordHash, password);
    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status === UserStatus.INACTIVE || user.status === UserStatus.DELETED) {
      throw new UnauthorizedException({
        message: 'Account is deactivated',
        errorCode: 'ACCOUNT_DEACTIVATED',
      });
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      emailVerified: user.emailVerified,
      mustChangePassword: user.mustChangePassword,
    };
  }
}
