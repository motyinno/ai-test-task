/**
 * C-2: inviteCoach idempotency — calling POST /coaches/invite TWICE for the
 * same email under the same trainer must result in EXACTLY ONE active UNIQUE
 * ShareLink, not two.
 *
 * NON-MASKING TEST: this test exercises the real POST /coaches/invite endpoint
 * twice and then asserts the DB link count. It was confirmed to FAIL (count=2)
 * before the C-2 fix (which adds the findOutstandingUniqueLink check and
 * refreshLink() path in CoachesService.inviteCoach).
 *
 * After the fix: count stays 1 and the second call returns the same link id
 * (refreshed) rather than a new id.
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

describe('C-2: inviteCoach idempotency — double-invite creates exactly one active UNIQUE link', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;
  let trainerProfileRepo: Repository<TrainerProfile>;
  let coachProfileRepo: Repository<CoachProfile>;
  let shareLinkRepo: Repository<ShareLink>;
  let passwordService: PasswordService;

  const PASSWORD = 'Password123!';
  const TRAINER_EMAIL = 'trainer-c2-idem@test.com';
  const COACH_EMAIL = 'coach-c2-idem@test.com';

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
      businessName: 'C2 Idem Gym',
      trainerName: 'Coach C2 Idempotent',
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

  /**
   * NON-MASKING (C-2): Call POST /coaches/invite TWICE for the same email.
   *
   * Failing-first confirmation: before the C-2 fix, two calls to inviteCoach
   * both called shareLinksService.generate() directly, creating two rows.
   * The count assertion (expect(count).toBe(1)) FAILED with count=2.
   *
   * After fix: the second call detects the outstanding link via
   * findOutstandingUniqueLink(), refreshes it (same row), and returns the
   * same link id. Count stays 1.
   */
  it('inviting same coach email twice → exactly ONE active UNIQUE link in DB (not two)', async () => {
    // First invite
    const res1 = await request(app.getHttpServer())
      .post('/api/v1/coaches/invite')
      .set('Cookie', trainerCookie)
      .set('X-CSRF-Token', trainerCsrf)
      .send({ email: COACH_EMAIL });

    expect(res1.status).toBe(201);
    const firstLinkId = res1.body.id;
    expect(firstLinkId).toBeDefined();

    // Second invite — same email, same trainer (should refresh, not insert)
    const res2 = await request(app.getHttpServer())
      .post('/api/v1/coaches/invite')
      .set('Cookie', trainerCookie)
      .set('X-CSRF-Token', trainerCsrf)
      .send({ email: COACH_EMAIL });

    expect(res2.status).toBe(201);
    const secondLinkId = res2.body.id;

    // CRITICAL ASSERTION: only ONE active UNIQUE link for this email+trainer
    const count = await shareLinkRepo.count({
      where: { trainerId, targetEmail: COACH_EMAIL, type: ShareLinkType.UNIQUE },
    });
    expect(count).toBe(1); // was 2 before fix

    // The second call returns the same row (refreshed), not a new one
    expect(secondLinkId).toBe(firstLinkId);

    // The link is still active and has a fresh expiry
    const link = await shareLinkRepo.findOne({ where: { id: firstLinkId } });
    expect(link!.active).toBe(true);
    expect(link!.useCount).toBe(0);
    const expiresAt = link!.expiresAt ? new Date(link!.expiresAt).getTime() : 0;
    expect(expiresAt).toBeGreaterThan(Date.now());
  });

  it('inviting different emails → creates separate link rows for each email', async () => {
    const OTHER_COACH = 'other-coach-c2-idem@test.com';

    const res = await request(app.getHttpServer())
      .post('/api/v1/coaches/invite')
      .set('Cookie', trainerCookie)
      .set('X-CSRF-Token', trainerCsrf)
      .send({ email: OTHER_COACH });

    expect(res.status).toBe(201);

    // COACH_EMAIL and OTHER_COACH each have their own link
    const coachCount = await shareLinkRepo.count({
      where: { trainerId, targetEmail: COACH_EMAIL, type: ShareLinkType.UNIQUE },
    });
    const otherCount = await shareLinkRepo.count({
      where: { trainerId, targetEmail: OTHER_COACH, type: ShareLinkType.UNIQUE },
    });

    expect(coachCount).toBe(1);
    expect(otherCount).toBe(1);
  });
});
