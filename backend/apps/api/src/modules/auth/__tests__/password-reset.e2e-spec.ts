import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '../../../app/app.module';
import { bootstrapApp } from '../../../shared/bootstrap/bootstrap';
import { User, UserRole, UserStatus } from '../../users/entities/user.entity';
import { PasswordService } from '../../../shared/crypto/password.service';
import { PasswordResetToken } from '../entities/password-reset-token.entity';

describe('Password Reset (e2e)', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;
  let tokenRepo: Repository<PasswordResetToken>;
  let passwordService: PasswordService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await bootstrapApp(app);
    await app.init();

    userRepo = moduleFixture.get(getRepositoryToken(User));
    tokenRepo = moduleFixture.get(getRepositoryToken(PasswordResetToken));
    passwordService = moduleFixture.get(PasswordService);

    await userRepo.query('DELETE FROM password_reset_tokens');
    await userRepo.query('DELETE FROM email_verification_tokens');
    await userRepo.query('DELETE FROM users');
    const hash = await passwordService.hash('OldPassword123!');
    await userRepo.save(
      userRepo.create({
        email: 'reset-test@example.com',
        passwordHash: hash,
        role: UserRole.TRAINER,
        status: UserStatus.ACTIVE,
      }),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /auth/password-reset always returns 204 (no enumeration)', async () => {
    // Existing user
    await request(app.getHttpServer())
      .post('/api/v1/auth/password-reset')
      .send({ email: 'reset-test@example.com' })
      .expect(204);

    // Non-existent user — still 204
    await request(app.getHttpServer())
      .post('/api/v1/auth/password-reset')
      .send({ email: 'nonexistent@example.com' })
      .expect(204);
  });

  it('POST /auth/password-reset/confirm with valid token sets new password', async () => {
    // Request reset
    await request(app.getHttpServer())
      .post('/api/v1/auth/password-reset')
      .send({ email: 'reset-test@example.com' });

    // Find the token directly from DB (in real app it's emailed)
    const tokenRecord = await tokenRepo.findOne({
      where: {},
      order: { createdAt: 'DESC' },
    });
    expect(tokenRecord).toBeDefined();
    expect(tokenRecord!.usedAt).toBeNull();

    // Confirm reset
    await request(app.getHttpServer())
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token: tokenRecord!.token, newPassword: 'NewPassword123!' })
      .expect(200);

    // Verify login works with new password
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'reset-test@example.com', password: 'NewPassword123!' })
      .expect(200);
  });

  it('POST /auth/password-reset/confirm with expired token returns 400 TOKEN_EXPIRED', async () => {
    // Create an expired token manually
    const user = await userRepo.findOne({ where: { email: 'reset-test@example.com' } });
    const expiredToken = tokenRepo.create({
      token: 'expired-token-value',
      userId: user!.id,
      expiresAt: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2h ago
      usedAt: null,
    });
    await tokenRepo.save(expiredToken);

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token: 'expired-token-value', newPassword: 'NewPassword123!' })
      .expect(400);

    expect(res.body).toMatchObject({ errorCode: 'TOKEN_EXPIRED' });
  });
});
