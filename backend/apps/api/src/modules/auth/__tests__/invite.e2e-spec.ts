/**
 * Invitation flow E2E.
 *
 * Covers the trainer onboarding path:
 *   SA creates a trainer (INVITE_LINK) → invite token emailed →
 *   GET /auth/invite/:token previews → POST /auth/invite/accept sets password →
 *   trainer can log in. Plus single-use + invalid-token guards.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../../../app/app.module';
import { bootstrapApp } from '../../../shared/bootstrap/bootstrap';
import { User, UserRole, UserStatus } from '../../users/entities/user.entity';
import { PasswordService } from '../../../shared/crypto/password.service';
import { EmailService } from '../../../shared/integrations/email/email.service';

describe('Auth: invitation flow', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;
  let passwordService: PasswordService;
  let emailService: EmailService;

  const SA_EMAIL = 'sa-invite@invite-test.com';
  const TRAINER_EMAIL = 'invitee@invite-test.com';
  const SA_PASSWORD = 'Password123!';
  const NEW_PASSWORD = 'BrandNewPass123!';

  let saCookie: string;
  let csrfToken: string;

  async function loginAs(email: string, password: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password });
    return res.headers['set-cookie']?.[0] ?? '';
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await bootstrapApp(app);
    await app.init();

    userRepo = moduleFixture.get(getRepositoryToken(User));
    passwordService = moduleFixture.get(PasswordService);
    emailService = moduleFixture.get(EmailService);

    await userRepo.delete({ email: SA_EMAIL });
    await userRepo.delete({ email: TRAINER_EMAIL });

    const hash = await passwordService.hash(SA_PASSWORD);
    await userRepo.save(
      userRepo.create({
        email: SA_EMAIL,
        passwordHash: hash,
        role: UserRole.SUPER_ADMIN,
        status: UserStatus.ACTIVE,
        emailVerified: true,
      }),
    );

    saCookie = await loginAs(SA_EMAIL, SA_PASSWORD);
    const csrfRes = await request(app.getHttpServer())
      .get('/api/v1/auth/csrf')
      .set('Cookie', saCookie);
    csrfToken = csrfRes.body.token;
  });

  afterAll(async () => {
    await userRepo.delete({ email: SA_EMAIL });
    await userRepo.delete({ email: TRAINER_EMAIL });
    await app.close();
  });

  let inviteToken: string;

  it('SA creates a trainer (INVITE_LINK) and an invite email with a full URL is sent', async () => {
    emailService.sentMessages.length = 0;

    const res = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Cookie', saCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        email: TRAINER_EMAIL,
        businessName: 'Invite Academy',
        trainerName: 'Invited Trainer',
        onboardingMode: 'INVITE_LINK',
      });

    expect(res.status).toBe(201);

    const email = emailService.sentMessages.find((m) => m.to === TRAINER_EMAIL);
    expect(email).toBeDefined();
    inviteToken = (email!.data as { inviteToken?: string }).inviteToken!;
    expect(inviteToken).toBeTruthy();
    // Email carries an absolute link to the set-password page.
    expect(email!.text).toContain(`/join-invite/${inviteToken}`);
    expect(email!.text).toMatch(/https?:\/\/\S+\/join-invite\//);
  });

  it('GET /auth/invite/:token previews the invitee email without consuming it', async () => {
    const res = await request(app.getHttpServer()).get(`/api/v1/auth/invite/${inviteToken}`);
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.email).toBe(TRAINER_EMAIL);
  });

  it('GET /auth/invite/:token with a bad token → 400 TOKEN_INVALID', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/auth/invite/not-a-real-token');
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('TOKEN_INVALID');
  });

  it('POST /auth/invite/accept sets the password and the trainer can log in', async () => {
    const accept = await request(app.getHttpServer())
      .post('/api/v1/auth/invite/accept')
      .send({ token: inviteToken, password: NEW_PASSWORD });
    expect(accept.status).toBe(200);
    expect(accept.body.ok).toBe(true);

    // Account is now usable + email auto-verified.
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: TRAINER_EMAIL, password: NEW_PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.role).toBe('TRAINER');

    const user = await userRepo.findOne({ where: { email: TRAINER_EMAIL } });
    expect(user?.emailVerified).toBe(true);
  });

  it('accepting the same invite twice → 400 TOKEN_USED (single-use)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/invite/accept')
      .send({ token: inviteToken, password: NEW_PASSWORD });
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('TOKEN_USED');
  });
});
