import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '../../../app/app.module';
import { bootstrapApp } from '../../../shared/bootstrap/bootstrap';
import { User, UserRole, UserStatus } from '../../users/entities/user.entity';
import { PasswordService } from '../../../shared/crypto/password.service';
import { EmailVerificationToken } from '../entities/email-verification-token.entity';

describe('Email Verification + First-Login (e2e)', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;
  let tokenRepo: Repository<EmailVerificationToken>;
  let passwordService: PasswordService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await bootstrapApp(app);
    await app.init();

    userRepo = moduleFixture.get(getRepositoryToken(User));
    tokenRepo = moduleFixture.get(getRepositoryToken(EmailVerificationToken));
    passwordService = moduleFixture.get(PasswordService);

    await userRepo.query('DELETE FROM email_verification_tokens');
    await userRepo.query('DELETE FROM password_reset_tokens');
    await userRepo.query('DELETE FROM users');
  });

  afterAll(async () => {
    await userRepo.query('DELETE FROM email_verification_tokens');
    await userRepo.query('DELETE FROM password_reset_tokens');
    await userRepo.query('DELETE FROM users');
    await app.close();
  });

  it('login succeeds even when emailVerified=false (non-blocking, D3)', async () => {
    const email = `unverified-${Date.now()}@example.com`;
    const hash = await passwordService.hash('password123');
    await userRepo.save(
      userRepo.create({
        email,
        passwordHash: hash,
        role: UserRole.TRAINER,
        status: UserStatus.ACTIVE,
        emailVerified: false,
      }),
    );

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'password123' })
      .expect(200);
  });

  it('POST /auth/verify-email with valid token sets emailVerified=true', async () => {
    const email = `verify-me-${Date.now()}@example.com`;
    const hash = await passwordService.hash('password123');
    const user = await userRepo.save(
      userRepo.create({
        email,
        passwordHash: hash,
        role: UserRole.TRAINER,
        status: UserStatus.ACTIVE,
        emailVerified: false,
      }),
    );

    const uniqueToken = `verify-token-${Date.now()}`;
    const tokenEntity = tokenRepo.create({
      token: uniqueToken,
      userId: user.id,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      usedAt: null,
    });
    await tokenRepo.save(tokenEntity);

    await request(app.getHttpServer())
      .post('/api/v1/auth/verify-email')
      .send({ token: uniqueToken })
      .expect(200);

    const updated = await userRepo.findOne({ where: { id: user.id } });
    expect(updated!.emailVerified).toBe(true);
  });

  it('POST /auth/first-login/change-password clears mustChangePassword flag (FR-006)', async () => {
    const email = `must-change-${Date.now()}@example.com`;
    const hash = await passwordService.hash('TempPass123!');
    const user = await userRepo.save(
      userRepo.create({
        email,
        passwordHash: hash,
        role: UserRole.TRAINER,
        status: UserStatus.ACTIVE,
        mustChangePassword: true,
      }),
    );

    // Login to get session
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'TempPass123!' });
    expect(loginRes.status).toBe(200);

    const cookies = loginRes.headers['set-cookie'] as unknown as string[];
    const sidCookie = (Array.isArray(cookies) ? cookies : [cookies]).find((c) =>
      c.includes('connect.sid'),
    )!;
    const sidPart = sidCookie.split(';')[0];

    // Get CSRF token
    const csrfRes = await request(app.getHttpServer())
      .get('/api/v1/auth/csrf')
      .set('Cookie', sidPart);
    const csrfToken = csrfRes.body.token;

    // Change password
    await request(app.getHttpServer())
      .post('/api/v1/auth/first-login/change-password')
      .set('Cookie', sidPart)
      .set('X-CSRF-Token', csrfToken)
      .send({ currentPassword: 'TempPass123!', newPassword: 'NewSecure123!' })
      .expect(200);

    const updated = await userRepo.findOne({ where: { id: user.id } });
    expect(updated).not.toBeNull();
    expect(updated!.mustChangePassword).toBe(false);
  });
});
