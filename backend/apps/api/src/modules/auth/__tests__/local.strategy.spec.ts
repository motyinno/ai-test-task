import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { LocalStrategy } from '../strategies/local.strategy';
import { PasswordService } from '../../../shared/crypto/password.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User, UserRole, UserStatus } from '../../users/entities/user.entity';
import { Repository } from 'typeorm';

describe('LocalStrategy', () => {
  let strategy: LocalStrategy;
  let mockRepo: Partial<Repository<User>>;

  const activeUser: User = {
    id: 'uuid-1',
    email: 'trainer@example.com',
    passwordHash: 'hashed',
    role: UserRole.TRAINER,
    status: UserStatus.ACTIVE,
    emailVerified: true,
    mustChangePassword: false,
    anonymizedAt: null,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockRepo = {
      findOne: jest.fn(),
    };

    const mod = await Test.createTestingModule({
      providers: [
        LocalStrategy,
        PasswordService,
        { provide: getRepositoryToken(User), useValue: mockRepo },
      ],
    }).compile();

    strategy = mod.get(LocalStrategy);
    // Override hash to return 'hashed' for 'correct-password'
    jest
      .spyOn(mod.get(PasswordService), 'verify')
      .mockImplementation(async (_hash: string, pw: string) => pw === 'correct-password');
  });

  it('returns user principal for valid credentials', async () => {
    (mockRepo.findOne as jest.Mock).mockResolvedValue(activeUser);
    const result = await strategy.validate('trainer@example.com', 'correct-password');
    expect(result).toMatchObject({ id: 'uuid-1', role: UserRole.TRAINER });
  });

  it('throws UnauthorizedException for invalid password', async () => {
    (mockRepo.findOne as jest.Mock).mockResolvedValue(activeUser);
    await expect(
      strategy.validate('trainer@example.com', 'wrong-password'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws UnauthorizedException for non-existent user', async () => {
    (mockRepo.findOne as jest.Mock).mockResolvedValue(null);
    await expect(
      strategy.validate('nonexistent@example.com', 'any-password'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws UnauthorizedException with ACCOUNT_DEACTIVATED for INACTIVE user', async () => {
    const inactiveUser: User = { ...activeUser, status: UserStatus.INACTIVE };
    (mockRepo.findOne as jest.Mock).mockResolvedValue(inactiveUser);
    try {
      await strategy.validate('trainer@example.com', 'correct-password');
      fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(UnauthorizedException);
      expect((e as UnauthorizedException).getResponse()).toMatchObject({
        errorCode: 'ACCOUNT_DEACTIVATED',
      });
    }
  });

  it('throws UnauthorizedException with ACCOUNT_DEACTIVATED for DELETED user', async () => {
    const deletedUser: User = { ...activeUser, status: UserStatus.DELETED };
    (mockRepo.findOne as jest.Mock).mockResolvedValue(deletedUser);
    try {
      await strategy.validate('trainer@example.com', 'correct-password');
      fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(UnauthorizedException);
    }
  });
});
