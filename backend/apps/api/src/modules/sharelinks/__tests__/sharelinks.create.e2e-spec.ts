/**
 * C3: POST /sharelinks — trainer creates static and unique links.
 *
 * Tests:
 *   - TRAINER creates STATIC link → 201, correct fields
 *   - TRAINER creates UNIQUE link → 201, maxUses=1, expiresAt ~now+7d
 *   - UNIQUE without targetEmail → 400 validation
 *   - Non-trainer (PLAYER) → 403
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
import { PlayerProfile } from '../../users/entities/player-profile.entity';
import { ShareLink } from '../entities/share-link.entity';
import { PasswordService } from '../../../shared/crypto/password.service';

describe('C3: POST /sharelinks', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;
  let trainerProfileRepo: Repository<TrainerProfile>;
  let playerProfileRepo: Repository<PlayerProfile>;
  let shareLinkRepo: Repository<ShareLink>;
  let passwordService: PasswordService;

  const PASSWORD = 'Password123!';
  const TRAINER_EMAIL = 'trainer-c3@test.com';
  const PLAYER_EMAIL = 'player-c3@test.com';

  let trainerCookie: string;
  let trainerCsrf: string;
  let playerCookie: string;
  let playerCsrf: string;
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
    playerProfileRepo = moduleFixture.get(getRepositoryToken(PlayerProfile));
    shareLinkRepo = moduleFixture.get(getRepositoryToken(ShareLink));
    passwordService = moduleFixture.get(PasswordService);

    await cleanDb();

    const hash = await passwordService.hash(PASSWORD);

    // Seed trainer
    const trainer = await userRepo.save(userRepo.create({
      email: TRAINER_EMAIL,
      passwordHash: hash,
      role: UserRole.TRAINER,
      status: UserStatus.ACTIVE,
    }));
    trainerId = trainer.id;
    await trainerProfileRepo.save(trainerProfileRepo.create({
      userId: trainer.id,
      businessName: 'C3 Test Gym',
      trainerName: 'Coach C3',
    }));

    // Seed player
    const player = await userRepo.save(userRepo.create({
      email: PLAYER_EMAIL,
      passwordHash: hash,
      role: UserRole.PLAYER,
      status: UserStatus.ACTIVE,
    }));
    await playerProfileRepo.save(playerProfileRepo.create({
      userId: player.id,
      name: 'Player C3',
    }));

    trainerCookie = await loginAs(TRAINER_EMAIL);
    trainerCsrf = await getCsrfToken(trainerCookie);
    playerCookie = await loginAs(PLAYER_EMAIL);
    playerCsrf = await getCsrfToken(playerCookie);
  });

  afterAll(async () => {
    await cleanDb();
    await app.close();
  });

  async function cleanDb() {
    await shareLinkRepo.query('DELETE FROM share_links').catch(() => {});
    await userRepo.query('DELETE FROM trainer_profiles').catch(() => {});
    await userRepo.query('DELETE FROM player_profiles').catch(() => {});
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

  it('TRAINER creates STATIC link → 201 with correct fields', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/sharelinks')
      .set('Cookie', trainerCookie)
      .set('X-CSRF-Token', trainerCsrf)
      .send({ type: 'STATIC' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.code).toBeDefined();
    // URL is the user-facing join page (frontend route), built from APP_BASE_URL.
    expect(res.body.url).toMatch(new RegExp(`/join/${res.body.code}$`));
    expect(res.body.type).toBe('STATIC');
    expect(res.body.trainerId).toBe(trainerId);
    expect(res.body.expiresAt).toBeNull();
    expect(res.body.maxUses).toBeNull();
    expect(res.body.useCount).toBe(0);
    expect(res.body.active).toBe(true);
  });

  it('TRAINER creates UNIQUE link → 201, maxUses=1, expiresAt ~7d', async () => {
    const before = Date.now();
    const res = await request(app.getHttpServer())
      .post('/api/v1/sharelinks')
      .set('Cookie', trainerCookie)
      .set('X-CSRF-Token', trainerCsrf)
      .send({ type: 'UNIQUE', targetEmail: 'coach-invite@test.com' });

    expect(res.status).toBe(201);
    expect(res.body.type).toBe('UNIQUE');
    expect(res.body.maxUses).toBe(1);
    expect(res.body.targetEmail).toBe('coach-invite@test.com');
    expect(res.body.expiresAt).not.toBeNull();

    const expiresAt = new Date(res.body.expiresAt).getTime();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    expect(expiresAt).toBeGreaterThan(before + sevenDays - 5000);
    expect(expiresAt).toBeLessThan(before + sevenDays + 5000);
  });

  it('UNIQUE link without targetEmail → 400 validation error', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/sharelinks')
      .set('Cookie', trainerCookie)
      .set('X-CSRF-Token', trainerCsrf)
      .send({ type: 'UNIQUE' });

    expect(res.status).toBe(400);
  });

  it('PLAYER attempting POST /sharelinks → 403 (not TRAINER)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/sharelinks')
      .set('Cookie', playerCookie)
      .set('X-CSRF-Token', playerCsrf)
      .send({ type: 'STATIC' });

    expect(res.status).toBe(403);
  });

  it('unauthenticated POST /sharelinks without CSRF → 403 CSRF_INVALID', async () => {
    // CSRF middleware fires before RolesGuard, so no-session POST returns 403 CSRF_INVALID
    const res = await request(app.getHttpServer())
      .post('/api/v1/sharelinks')
      .send({ type: 'STATIC' });

    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('CSRF_INVALID');
  });
});
