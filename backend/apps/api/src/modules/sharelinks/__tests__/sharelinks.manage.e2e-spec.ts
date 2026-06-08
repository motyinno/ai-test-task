/**
 * C4: GET /sharelinks (list) + POST /sharelinks/:id/revoke
 *
 * Security-critical: tenant isolation — GET /sharelinks returns ONLY the
 * calling trainer's links (not another trainer's links).
 *
 * Sanity-check: removing the scope (bypassing TenantAwareRepository) would
 * expose other trainer's links; that's confirmed RED in test notes below.
 *
 * Tests:
 *   - List returns {data, meta} envelope, only caller's links
 *   - Second trainer's link is NOT in the list (tenant isolation)
 *   - Revoke own link → 200, active=false
 *   - Revoke another trainer's link → 404 (tenant-scoped, not found)
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

describe('C4: GET /sharelinks + revoke (tenant isolation)', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;
  let trainerProfileRepo: Repository<TrainerProfile>;
  let shareLinkRepo: Repository<ShareLink>;
  let passwordService: PasswordService;

  const PASSWORD = 'Password123!';
  const TRAINER1_EMAIL = 'trainer1-c4@test.com';
  const TRAINER2_EMAIL = 'trainer2-c4@test.com';

  let trainer1Cookie: string;
  let trainer1Csrf: string;
  let trainer2Cookie: string;
  let trainer2Csrf: string;
  let trainer1Id: string;
  let trainer2Id: string;
  let trainer1LinkId: string;
  let trainer2LinkId: string;

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

    // Seed trainer 1
    const t1 = await userRepo.save(userRepo.create({
      email: TRAINER1_EMAIL,
      passwordHash: hash,
      role: UserRole.TRAINER,
      status: UserStatus.ACTIVE,
    }));
    trainer1Id = t1.id;
    await trainerProfileRepo.save(trainerProfileRepo.create({
      userId: t1.id,
      businessName: 'Gym Alpha',
      trainerName: 'Coach Alpha',
    }));

    // Seed trainer 2
    const t2 = await userRepo.save(userRepo.create({
      email: TRAINER2_EMAIL,
      passwordHash: hash,
      role: UserRole.TRAINER,
      status: UserStatus.ACTIVE,
    }));
    trainer2Id = t2.id;
    await trainerProfileRepo.save(trainerProfileRepo.create({
      userId: t2.id,
      businessName: 'Gym Beta',
      trainerName: 'Coach Beta',
    }));

    trainer1Cookie = await loginAs(TRAINER1_EMAIL);
    trainer1Csrf = await getCsrfToken(trainer1Cookie);
    trainer2Cookie = await loginAs(TRAINER2_EMAIL);
    trainer2Csrf = await getCsrfToken(trainer2Cookie);

    // Create links via the API so they're properly scoped
    const r1 = await request(app.getHttpServer())
      .post('/api/v1/sharelinks')
      .set('Cookie', trainer1Cookie)
      .set('X-CSRF-Token', trainer1Csrf)
      .send({ type: 'STATIC' });
    trainer1LinkId = r1.body.id;

    const r2 = await request(app.getHttpServer())
      .post('/api/v1/sharelinks')
      .set('Cookie', trainer2Cookie)
      .set('X-CSRF-Token', trainer2Csrf)
      .send({ type: 'STATIC' });
    trainer2LinkId = r2.body.id;
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

  // ─── SECURITY-CRITICAL: Tenant Isolation (failing-first sanity: C4) ────────
  //
  // Sanity check result: When TenantAwareRepository.scopedFind was temporarily
  // bypassed (using the base repo directly without trainerId filter), the list
  // returned BOTH trainers' links. The test went RED on the "does not contain
  // trainer2 link" assertion. After restoring the scope, it goes GREEN.

  it('GET /sharelinks returns only caller trainer links (tenant isolation)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/sharelinks?page=1&limit=20')
      .set('Cookie', trainer1Cookie);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('meta');
    expect(Array.isArray(res.body.data)).toBe(true);

    const ids = res.body.data.map((l: any) => l.id);

    // Trainer 1's link IS present
    expect(ids).toContain(trainer1LinkId);

    // Trainer 2's link is NOT present (tenant isolation)
    expect(ids).not.toContain(trainer2LinkId);

    // All links belong to trainer1
    for (const link of res.body.data) {
      expect(link.trainerId).toBe(trainer1Id);
    }
  });

  it('GET /sharelinks returns {data, meta} pagination envelope', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/sharelinks?page=1&limit=20')
      .set('Cookie', trainer1Cookie);

    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({
      page: 1,
      limit: 20,
      total: expect.any(Number),
      totalPages: expect.any(Number),
    });
    expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
  });

  it('POST /sharelinks/:id/revoke → 200, active=false', async () => {
    // Create a fresh link to revoke
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/sharelinks')
      .set('Cookie', trainer1Cookie)
      .set('X-CSRF-Token', trainer1Csrf)
      .send({ type: 'STATIC' });
    expect(createRes.status).toBe(201);
    const linkId = createRes.body.id;

    const res = await request(app.getHttpServer())
      .post(`/api/v1/sharelinks/${linkId}/revoke`)
      .set('Cookie', trainer1Cookie)
      .set('X-CSRF-Token', trainer1Csrf);

    expect(res.status).toBe(200);
    expect(res.body.active).toBe(false);
    expect(res.body.id).toBe(linkId);
  });

  it("revoking another trainer's link → 404 (tenant-scoped)", async () => {
    // trainer1 tries to revoke trainer2's link
    const res = await request(app.getHttpServer())
      .post(`/api/v1/sharelinks/${trainer2LinkId}/revoke`)
      .set('Cookie', trainer1Cookie)
      .set('X-CSRF-Token', trainer1Csrf);

    expect(res.status).toBe(404);
    expect(res.body.errorCode).toBe('LINK_NOT_FOUND');
  });
});
