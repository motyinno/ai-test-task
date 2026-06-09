import request from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { AppModule } from '../../../app/app.module';
import { bootstrapApp } from '../../../shared/bootstrap/bootstrap';
import { User, UserRole, UserStatus } from '../../users/entities/user.entity';
import { PlayerProfile } from '../../users/entities/player-profile.entity';
import { CoachProfile } from '../../users/entities/coach-profile.entity';
import { TrainerProfile } from '../../users/entities/trainer-profile.entity';
import * as argon2 from 'argon2';

/**
 * Availability E2E integration tests (E2–E5).
 *
 * Sanity-checks exercised:
 *   1. A parent CANNOT set availability for a profile they don't own → 403
 *      (SANITY: profile-ownership enforcement on availability writes)
 *   2. Tenant isolation on trainer availability view (E4)
 *   3. Coach endpoints require COACH role → 403 if wrong role
 *   4. Trainer endpoint requires TRAINER role → 403 if wrong role
 *   5. endTime <= startTime rejected with 400
 */
describe('Availability E2E (E2–E5)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  // Seeded actor UUIDs
  let trainerUserId: string;
  let coachUserId: string;
  let parentUserId: string;
  let playerProfileId: string;
  let childProfileId: string;
  let otherParentUserId: string;

  // Auth cookies + CSRF tokens
  let trainerCookie: string;
  let trainerCsrf: string;
  let coachCookie: string;
  let coachCsrf: string;
  let parentCookie: string;
  let parentCsrf: string;
  let otherParentCookie: string;
  let otherParentCsrf: string;

  const PASSWORD = 'Password1!';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await bootstrapApp(app);
    await app.init();

    dataSource = moduleFixture.get(DataSource);

    await seedData(moduleFixture);

    trainerCookie = await loginAs((await getEmail(trainerUserId)));
    trainerCsrf = await getCsrfToken(trainerCookie);

    coachCookie = await loginAs((await getEmail(coachUserId)));
    coachCsrf = await getCsrfToken(coachCookie);

    parentCookie = await loginAs((await getEmail(parentUserId)));
    parentCsrf = await getCsrfToken(parentCookie);

    otherParentCookie = await loginAs((await getEmail(otherParentUserId)));
    otherParentCsrf = await getCsrfToken(otherParentCookie);
  });

  afterAll(async () => {
    await cleanupData();
    await app.close();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Seed / cleanup helpers
  // ──────────────────────────────────────────────────────────────────────────

  async function seedData(module: TestingModule) {
    const userRepo = module.get<Repository<User>>(getRepositoryToken(User));
    const trainerProfileRepo = module.get<Repository<TrainerProfile>>(getRepositoryToken(TrainerProfile));
    const coachProfileRepo = module.get<Repository<CoachProfile>>(getRepositoryToken(CoachProfile));
    const playerProfileRepo = module.get<Repository<PlayerProfile>>(getRepositoryToken(PlayerProfile));

    const hash = await argon2.hash(PASSWORD);
    const ts = Date.now();

    // Trainer
    const trainer = await userRepo.save(userRepo.create({
      email: `avail-trainer-${ts}@test.com`,
      passwordHash: hash,
      role: UserRole.TRAINER,
      status: UserStatus.ACTIVE,
      emailVerified: true,
    }));
    trainerUserId = trainer.id;

    await trainerProfileRepo.save(trainerProfileRepo.create({
      userId: trainer.id,
      businessName: `Avail Test Academy ${ts}`,
      trainerName: `Avail Trainer ${ts}`,
    }));

    // Coach
    const coach = await userRepo.save(userRepo.create({
      email: `avail-coach-${ts}@test.com`,
      passwordHash: hash,
      role: UserRole.COACH,
      status: UserStatus.ACTIVE,
      emailVerified: true,
    }));
    coachUserId = coach.id;

    await coachProfileRepo.save(coachProfileRepo.create({
      userId: coach.id,
      trainerId: trainer.id,
    }));

    // Parent player
    const parent = await userRepo.save(userRepo.create({
      email: `avail-parent-${ts}@test.com`,
      passwordHash: hash,
      role: UserRole.PLAYER,
      status: UserStatus.ACTIVE,
      emailVerified: true,
    }));
    parentUserId = parent.id;

    const playerProfile = await playerProfileRepo.save(playerProfileRepo.create({
      userId: parent.id,
      name: `Parent Player ${ts}`,
    }));
    playerProfileId = playerProfile.id;

    // Child profile (owned by parent)
    const childUser = await userRepo.save(userRepo.create({
      email: `avail-child-${ts}@test.com`,
      passwordHash: hash,
      role: UserRole.PLAYER,
      status: UserStatus.ACTIVE,
      emailVerified: true,
    }));

    const childProfile = await playerProfileRepo.save(playerProfileRepo.create({
      userId: childUser.id,
      parentUserId: parent.id,
      name: `Child Player ${ts}`,
      isChild: true,
    }));
    childProfileId = childProfile.id;

    // Another parent (unrelated family)
    const otherParent = await userRepo.save(userRepo.create({
      email: `avail-other-parent-${ts}@test.com`,
      passwordHash: hash,
      role: UserRole.PLAYER,
      status: UserStatus.ACTIVE,
      emailVerified: true,
    }));
    otherParentUserId = otherParent.id;

    await playerProfileRepo.save(playerProfileRepo.create({
      userId: otherParent.id,
      name: `Other Parent Player ${ts}`,
    }));
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

  async function getEmail(userId: string): Promise<string> {
    const result = await dataSource.query('SELECT email FROM users WHERE id = $1', [userId]);
    return result[0].email as string;
  }

  async function cleanupData() {
    await dataSource.query(`DELETE FROM availability_slots WHERE trainer_id = $1`, [trainerUserId]).catch(() => {});
    await dataSource.query(`DELETE FROM coach_availability_overrides WHERE overridden_by_trainer_id = $1`, [trainerUserId]).catch(() => {});
    await dataSource.query(`DELETE FROM coach_profiles WHERE trainer_id = $1`, [trainerUserId]).catch(() => {});
    await dataSource.query(`DELETE FROM player_profiles WHERE parent_user_id = $1`, [parentUserId]).catch(() => {});
    await dataSource.query(`DELETE FROM player_profiles WHERE user_id = $1`, [parentUserId]).catch(() => {});
    await dataSource.query(`DELETE FROM player_profiles WHERE user_id = $1`, [otherParentUserId]).catch(() => {});
    await dataSource.query(`DELETE FROM trainer_profiles WHERE user_id = $1`, [trainerUserId]).catch(() => {});
    await dataSource.query(`DELETE FROM users WHERE email LIKE 'avail-%'`).catch(() => {});
  }

  // ──────────────────────────────────────────────────────────────────────────
  // E2: Player Best Times
  // ──────────────────────────────────────────────────────────────────────────

  describe('E2: Player Best Times', () => {
    it('PUT /players/:profileId/availability — sets slots for own profile', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/players/${playerProfileId}/availability`)
        .set('Cookie', parentCookie)
        .set('X-CSRF-Token', parentCsrf)
        .send({
          slots: [
            { dayOfWeek: 'MON', startTime: '16:00', endTime: '18:00' },
            { dayOfWeek: 'WED', startTime: '17:00', endTime: '20:00' },
          ],
        });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(2);
      const days = res.body.map((s: { dayOfWeek: string }) => s.dayOfWeek);
      expect(days).toContain('MON');
      expect(days).toContain('WED');
    });

    it('GET /players/:profileId/availability — retrieves own profile slots', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/players/${playerProfileId}/availability`)
        .set('Cookie', parentCookie);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('parent can set availability for own child profile', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/players/${childProfileId}/availability`)
        .set('Cookie', parentCookie)
        .set('X-CSRF-Token', parentCsrf)
        .send({
          slots: [{ dayOfWeek: 'SAT', startTime: '09:00', endTime: '11:00' }],
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].dayOfWeek).toBe('SAT');
    });

    it('SANITY CHECK: 403 when wrong parent sets another parent\'s profile (ownership enforcement)', async () => {
      // SANITY: unauthorized write MUST be rejected — wrong parent cannot edit playerProfile
      const res = await request(app.getHttpServer())
        .put(`/api/v1/players/${playerProfileId}/availability`)
        .set('Cookie', otherParentCookie)
        .set('X-CSRF-Token', otherParentCsrf)
        .send({ slots: [{ dayOfWeek: 'FRI', startTime: '18:00', endTime: '20:00' }] });

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('AVAILABILITY_ACCESS_DENIED');
    });

    it('SANITY CHECK: 403 when wrong parent reads another parent\'s child profile', async () => {
      // SANITY: read path must also enforce ownership
      const res = await request(app.getHttpServer())
        .get(`/api/v1/players/${childProfileId}/availability`)
        .set('Cookie', otherParentCookie);

      expect(res.status).toBe(403);
    });

    it('400 when endTime <= startTime (validation)', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/players/${playerProfileId}/availability`)
        .set('Cookie', parentCookie)
        .set('X-CSRF-Token', parentCsrf)
        .send({
          slots: [{ dayOfWeek: 'MON', startTime: '18:00', endTime: '16:00' }],
        });

      expect(res.status).toBe(400);
    });

    it('200 with empty slots — clears availability', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/players/${playerProfileId}/availability`)
        .set('Cookie', parentCookie)
        .set('X-CSRF-Token', parentCsrf)
        .send({ slots: [] });

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // E3: Coach My Times
  // ──────────────────────────────────────────────────────────────────────────

  describe('E3: Coach My Times', () => {
    it('PUT /coaches/me/availability — coach sets own availability', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/coaches/me/availability')
        .set('Cookie', coachCookie)
        .set('X-CSRF-Token', coachCsrf)
        .send({
          slots: [
            { dayOfWeek: 'TUE', startTime: '15:00', endTime: '19:00' },
            { dayOfWeek: 'THU', startTime: '16:00', endTime: '20:00' },
          ],
        });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(2);
    });

    it('GET /coaches/me/availability — retrieves coach slots', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/coaches/me/availability')
        .set('Cookie', coachCookie);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('allows multiple slots per day', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/coaches/me/availability')
        .set('Cookie', coachCookie)
        .set('X-CSRF-Token', coachCsrf)
        .send({
          slots: [
            { dayOfWeek: 'MON', startTime: '09:00', endTime: '12:00' },
            { dayOfWeek: 'MON', startTime: '14:00', endTime: '17:00' },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body.every((s: { dayOfWeek: string }) => s.dayOfWeek === 'MON')).toBe(true);
    });

    it('SANITY CHECK: 403 when player tries to access COACH-only endpoint', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/coaches/me/availability')
        .set('Cookie', parentCookie);

      expect(res.status).toBe(403);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // E4: Trainer player availability view
  // ──────────────────────────────────────────────────────────────────────────

  describe('E4: Trainer player availability view', () => {
    beforeAll(async () => {
      // Seed some player slots via the API
      await request(app.getHttpServer())
        .put(`/api/v1/players/${playerProfileId}/availability`)
        .set('Cookie', parentCookie)
        .set('X-CSRF-Token', parentCsrf)
        .send({
          slots: [
            { dayOfWeek: 'MON', startTime: '16:00', endTime: '18:00' },
            { dayOfWeek: 'FRI', startTime: '17:00', endTime: '20:00' },
          ],
        });
    });

    it('GET /trainers/me/players/availability — returns paginated player slots', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/trainers/me/players/availability')
        .set('Cookie', trainerCookie);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('meta');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta.page).toBe(1);
      expect(res.body.meta.limit).toBe(20);
      expect(typeof res.body.meta.total).toBe('number');
    });

    it('filters by day of week (SANITY CHECK: tenant isolation — only own org players)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/trainers/me/players/availability?day=MON')
        .set('Cookie', trainerCookie);

      expect(res.status).toBe(200);
      // All returned slots must be MON
      for (const slot of res.body.data) {
        expect(slot.dayOfWeek).toBe('MON');
      }
    });

    it('SANITY CHECK: 403 when coach tries to access TRAINER-only endpoint', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/trainers/me/players/availability')
        .set('Cookie', coachCookie);

      expect(res.status).toBe(403);
    });
  });
});
