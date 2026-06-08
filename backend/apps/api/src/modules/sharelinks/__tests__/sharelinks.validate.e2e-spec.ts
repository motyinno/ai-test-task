/**
 * C5: GET /sharelinks/:code/validate — public validation endpoint.
 *
 * Tests cover the ordered validation gate (steps 1–4):
 *   1. Unknown code → 404 LINK_NOT_FOUND
 *   2. Revoked (active=false) → 410 LINK_REVOKED
 *   3. Expired unique link → 410 LINK_EXPIRED
 *   4. Used unique link (useCount >= maxUses) → 410 LINK_USED
 *   5. Valid static link → 200 { valid:true, type:'STATIC', trainerName }
 *
 * This endpoint is PUBLIC — no session required.
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
import { ShareLink, ShareLinkType } from '../entities/share-link.entity';
import { PasswordService } from '../../../shared/crypto/password.service';

describe('C5: GET /sharelinks/:code/validate (public)', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;
  let trainerProfileRepo: Repository<TrainerProfile>;
  let shareLinkRepo: Repository<ShareLink>;
  let passwordService: PasswordService;

  const PASSWORD = 'Password123!';
  const TRAINER_EMAIL = 'trainer-c5@test.com';
  let trainerId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await bootstrapApp(app);
    await app.init();

    userRepo = moduleFixture.get(getRepositoryToken(User));
    trainerProfileRepo = moduleFixture.get(getRepositoryToken(TrainerProfile));
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
      businessName: 'C5 Test Gym',
      trainerName: 'Coach C5',
    }));
  });

  afterAll(async () => {
    await cleanDb();
    await app.close();
  });

  async function cleanDb() {
    await shareLinkRepo.query('DELETE FROM share_links').catch(() => {});
    await userRepo.query('DELETE FROM trainer_profiles').catch(() => {});
    await userRepo.query('DELETE FROM sessions').catch(() => {});
    await userRepo.query('DELETE FROM users').catch(() => {});
  }

  async function seedLink(data: Partial<ShareLink>): Promise<ShareLink> {
    return shareLinkRepo.save(shareLinkRepo.create({
      type: ShareLinkType.STATIC,
      trainerId,
      createdBy: trainerId,
      ...data,
    }));
  }

  it('unknown code → 404 LINK_NOT_FOUND', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/sharelinks/definitely-not-a-real-code/validate');

    expect(res.status).toBe(404);
    expect(res.body.errorCode).toBe('LINK_NOT_FOUND');
  });

  it('revoked link (active=false) → 410 LINK_REVOKED', async () => {
    const link = await seedLink({ code: 'revoked-c5', active: false });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/sharelinks/${link.code}/validate`);

    expect(res.status).toBe(410);
    expect(res.body.errorCode).toBe('LINK_REVOKED');
  });

  it('expired UNIQUE link → 410 LINK_EXPIRED', async () => {
    const link = await seedLink({
      code: 'expired-c5',
      type: ShareLinkType.UNIQUE,
      maxUses: 1,
      expiresAt: new Date(Date.now() - 1000), // 1 second in the past
      targetEmail: 'coach-c5@test.com',
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/sharelinks/${link.code}/validate`);

    expect(res.status).toBe(410);
    expect(res.body.errorCode).toBe('LINK_EXPIRED');
  });

  it('fully used UNIQUE link (useCount >= maxUses) → 410 LINK_USED', async () => {
    const link = await seedLink({
      code: 'used-c5',
      type: ShareLinkType.UNIQUE,
      maxUses: 1,
      useCount: 1,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      targetEmail: 'used-coach@test.com',
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/sharelinks/${link.code}/validate`);

    expect(res.status).toBe(410);
    expect(res.body.errorCode).toBe('LINK_USED');
  });

  it('valid STATIC link → 200 { valid:true, type:STATIC, trainerName }', async () => {
    const link = await seedLink({ code: 'valid-static-c5' });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/sharelinks/${link.code}/validate`);

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.type).toBe('STATIC');
    expect(res.body.trainerName).toBe('Coach C5');
  });

  /**
   * C-1 Security fix: public /validate must NOT expose targetEmail (PII).
   * The spec preview is advisory-display only: { valid, type, trainerName }.
   *
   * Failing-first check: before C-1 fix, res.body.targetEmail === 'coach@example.com'.
   * After fix: targetEmail must be absent from the public response.
   */
  it('valid UNIQUE link → 200 { valid:true, type:UNIQUE } and does NOT leak targetEmail', async () => {
    const link = await seedLink({
      code: 'valid-unique-c5',
      type: ShareLinkType.UNIQUE,
      maxUses: 1,
      useCount: 0,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      targetEmail: 'coach@example.com',
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/sharelinks/${link.code}/validate`);

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.type).toBe('UNIQUE');
    // SECURITY (C-1): targetEmail must NOT be present in the public response
    expect(res.body.targetEmail).toBeUndefined();
  });

  it('validate is public — no session cookie required', async () => {
    const link = await seedLink({ code: 'public-test-c5' });

    // No session cookie set
    const res = await request(app.getHttpServer())
      .get(`/api/v1/sharelinks/${link.code}/validate`);

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
  });
});
