/**
 * C12: Coach invitation list + idempotent resend (edge A).
 *
 * Tests:
 *   - GET /coaches/invitations → 200 list with status PENDING|ACCEPTED|EXPIRED
 *   - POST /coaches/invitations/:id/resend → 200; refreshes link (new 7d expiry, useCount=0)
 *   - Idempotent: resending to email that already has an outstanding live link
 *     refreshes that one rather than creating a second (only 1 active link per email)
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../../../app/app.module';
import { bootstrapApp } from '../../../shared/bootstrap/bootstrap';
import { User, UserRole, UserStatus } from '../../users/entities/user.entity';
import { TrainerProfile } from '../../users/entities/trainer-profile.entity';
import { CoachProfile } from '../../users/entities/coach-profile.entity';
import { ShareLink, ShareLinkType } from '../../sharelinks/entities/share-link.entity';
import { PasswordService } from '../../../shared/crypto/password.service';
import { generateShareLinkCode } from '../../sharelinks/share-link-code.util';

describe('C12: coach invitation list + idempotent resend (edge A)', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;
  let trainerProfileRepo: Repository<TrainerProfile>;
  let coachProfileRepo: Repository<CoachProfile>;
  let shareLinkRepo: Repository<ShareLink>;
  let passwordService: PasswordService;

  const PASSWORD = 'Password123!';
  const TRAINER_EMAIL = 'trainer-c12@test.com';
  let trainerId: string;
  let trainerCookie: string;
  let trainerCsrf: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await bootstrapApp(app);
    await app.init();

    userRepo = moduleFixture.get(getRepositoryToken(User));
    trainerProfileRepo = moduleFixture.get(getRepositoryToken(TrainerProfile));
    coachProfileRepo = moduleFixture.get(getRepositoryToken(CoachProfile));
    shareLinkRepo = moduleFixture.get(getRepositoryToken(ShareLink));
    passwordService = moduleFixture.get(PasswordService);

    await cleanDb();

    const hash = await passwordService.hash(PASSWORD);
    const trainer = await userRepo.save(userRepo.create({
      email: TRAINER_EMAIL,
      passwordHash: hash,
      role: UserRole.TRAINER,
      status: UserStatus.ACTIVE,
    }));
    trainerId = trainer.id;
    await trainerProfileRepo.save(trainerProfileRepo.create({
      userId: trainer.id,
      businessName: 'C12 Gym',
      trainerName: 'Coach C12',
    }));

    trainerCookie = await loginAs(TRAINER_EMAIL);
    trainerCsrf = await getCsrfToken(trainerCookie);
  });

  afterAll(async () => {
    await cleanDb();
    await app.close();
  });

  async function cleanDb() {
    await coachProfileRepo.query('DELETE FROM coach_profiles').catch(() => {});
    await shareLinkRepo.query('DELETE FROM share_links').catch(() => {});
    await userRepo.query('DELETE FROM trainer_profiles').catch(() => {});
    await userRepo.query('DELETE FROM sessions').catch(() => {});
    await userRepo.query('DELETE FROM users').catch(() => {});
  }

  async function loginAs(email: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD });
    expect(res.status).toBe(200);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    return (Array.isArray(cookies) ? cookies : [cookies])
      .find((c) => c.includes('connect.sid'))!
      .split(';')[0];
  }

  async function getCsrfToken(cookie: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/csrf')
      .set('Cookie', cookie);
    return res.body.token as string;
  }

  it('GET /coaches/invitations → 200 list with PENDING status (fresh link)', async () => {
    // Create a fresh PENDING invite
    await request(app.getHttpServer())
      .post('/api/v1/coaches/invite')
      .set('Cookie', trainerCookie)
      .set('X-CSRF-Token', trainerCsrf)
      .send({ email: 'pending-c12@test.com' });

    const res = await request(app.getHttpServer())
      .get('/api/v1/coaches/invitations')
      .set('Cookie', trainerCookie);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const pending = res.body.find((i: any) => i.targetEmail === 'pending-c12@test.com');
    expect(pending).toBeDefined();
    expect(pending.status).toBe('PENDING');
  });

  it('GET /coaches/invitations shows ACCEPTED status for consumed links', async () => {
    // Seed an already-consumed link (useCount=1, maxUses=1)
    await shareLinkRepo.save(shareLinkRepo.create({
      code: generateShareLinkCode(),
      type: ShareLinkType.UNIQUE,
      trainerId,
      createdBy: trainerId,
      targetEmail: 'accepted-c12@test.com',
      maxUses: 1,
      useCount: 1,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    }));

    const res = await request(app.getHttpServer())
      .get('/api/v1/coaches/invitations')
      .set('Cookie', trainerCookie);

    expect(res.status).toBe(200);
    const accepted = res.body.find((i: any) => i.targetEmail === 'accepted-c12@test.com');
    expect(accepted).toBeDefined();
    expect(accepted.status).toBe('ACCEPTED');
  });

  it('GET /coaches/invitations shows EXPIRED status for past-expiry links', async () => {
    // Seed an expired link
    await shareLinkRepo.save(shareLinkRepo.create({
      code: generateShareLinkCode(),
      type: ShareLinkType.UNIQUE,
      trainerId,
      createdBy: trainerId,
      targetEmail: 'expired-c12@test.com',
      maxUses: 1,
      useCount: 0,
      expiresAt: new Date(Date.now() - 1000), // past expiry
    }));

    const res = await request(app.getHttpServer())
      .get('/api/v1/coaches/invitations')
      .set('Cookie', trainerCookie);

    expect(res.status).toBe(200);
    const expired = res.body.find((i: any) => i.targetEmail === 'expired-c12@test.com');
    expect(expired).toBeDefined();
    expect(expired.status).toBe('EXPIRED');
  });

  it('POST /coaches/invitations/:id/resend → 200, refreshes link', async () => {
    // Create an invite first
    const inviteRes = await request(app.getHttpServer())
      .post('/api/v1/coaches/invite')
      .set('Cookie', trainerCookie)
      .set('X-CSRF-Token', trainerCsrf)
      .send({ email: 'resend-c12@test.com' });

    expect(inviteRes.status).toBe(201);
    const linkId = inviteRes.body.id;

    // Manually expire it
    await shareLinkRepo.update(linkId, {
      expiresAt: new Date(Date.now() - 1000),
      useCount: 0,
    });

    const resendRes = await request(app.getHttpServer())
      .post(`/api/v1/coaches/invitations/${linkId}/resend`)
      .set('Cookie', trainerCookie)
      .set('X-CSRF-Token', trainerCsrf);

    expect(resendRes.status).toBe(200);
    expect(resendRes.body.status).toBe('PENDING');
    expect(resendRes.body.useCount).toBe(0);

    // New expiry should be in the future
    const newExpiry = new Date(resendRes.body.expiresAt);
    expect(newExpiry.getTime()).toBeGreaterThan(Date.now());
  });

  /**
   * Edge A: Idempotent resend.
   * Only ONE active link per targetEmail after multiple resend operations.
   * Note: the current implementation creates a new code on resend but reuses
   * the same ShareLink row — asserting count=1.
   */
  it('multiple resends to same email → only 1 active link row (idempotent)', async () => {
    // Create invite
    const inviteRes = await request(app.getHttpServer())
      .post('/api/v1/coaches/invite')
      .set('Cookie', trainerCookie)
      .set('X-CSRF-Token', trainerCsrf)
      .send({ email: 'idempotent-c12@test.com' });
    expect(inviteRes.status).toBe(201);
    const linkId = inviteRes.body.id;

    // Resend twice
    await request(app.getHttpServer())
      .post(`/api/v1/coaches/invitations/${linkId}/resend`)
      .set('Cookie', trainerCookie)
      .set('X-CSRF-Token', trainerCsrf);
    await request(app.getHttpServer())
      .post(`/api/v1/coaches/invitations/${linkId}/resend`)
      .set('Cookie', trainerCookie)
      .set('X-CSRF-Token', trainerCsrf);

    // Should still be only 1 link row for this email
    const count = await shareLinkRepo.count({
      where: { trainerId, targetEmail: 'idempotent-c12@test.com' },
    });
    expect(count).toBe(1);
  });
});
