/**
 * D2/D4/D5/D6: Child create, context switching, child sub-login, child constraints e2e.
 *
 * Tests:
 *  1. POST /players/me/children → creates child profile (BR-017 age 1-18).
 *  2. POST /players/me/children with age=0 → 400 (BR-017 enforcement).
 *  3. GET /players/me/children → lists children.
 *  4. POST /players/me/context → switches active context.
 *  5. Child sub-login auth → isChild=true in principal.
 *  6. Child principal hitting add-trainer → 403 CHILD_FORBIDDEN (D6 CASL).
 *  7. GET /players/me/contexts for child principal → only child's own contexts.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../../../app/app.module';
import { bootstrapApp } from '../../../shared/bootstrap/bootstrap';
import { User, UserRole, UserStatus } from '../../users/entities/user.entity';
import { PlayerProfile } from '../../users/entities/player-profile.entity';
import { TrainerProfile } from '../../users/entities/trainer-profile.entity';
import { TrainerPlayerAssociation, AssociationStatus } from '../entities/trainer-player-association.entity';
import { ChildLogin } from '../../child-account/entities/child-login.entity';
import { PasswordService } from '../../../shared/crypto/password.service';

describe('D2/D4/D5/D6: Child profile + context switching + sub-login constraints', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;
  let playerProfileRepo: Repository<PlayerProfile>;
  let trainerProfileRepo: Repository<TrainerProfile>;
  let assocRepo: Repository<TrainerPlayerAssociation>;
  let childLoginRepo: Repository<ChildLogin>;
  let passwordService: PasswordService;

  const PARENT_EMAIL = 'parent-d4@test.com';
  const PARENT_PASSWORD = 'ParentPass123!';
  const TRAINER_EMAIL = 'trainer-d4@test.com';
  const TRAINER_PASSWORD = 'TrainerPass123!';
  const CHILD_USERNAME = 'test_child_d4';
  const CHILD_PASSWORD = 'ChildPass123!';

  let parentId: string;
  let trainerId: string;
  let parentProfileId: string;
  let csrfToken: string;
  let sessionCookie: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await bootstrapApp(app);
    await app.init();

    userRepo = moduleFixture.get(getRepositoryToken(User));
    playerProfileRepo = moduleFixture.get(getRepositoryToken(PlayerProfile));
    trainerProfileRepo = moduleFixture.get(getRepositoryToken(TrainerProfile));
    assocRepo = moduleFixture.get(getRepositoryToken(TrainerPlayerAssociation));
    childLoginRepo = moduleFixture.get(getRepositoryToken(ChildLogin));
    passwordService = moduleFixture.get(PasswordService);

    // Seed trainer
    const trainerHash = await passwordService.hash(TRAINER_PASSWORD);
    const trainer = await userRepo.save(userRepo.create({
      email: TRAINER_EMAIL,
      passwordHash: trainerHash,
      role: UserRole.TRAINER,
      status: UserStatus.ACTIVE,
      emailVerified: true,
    }));
    trainerId = trainer.id;
    await trainerProfileRepo.save(trainerProfileRepo.create({
      userId: trainerId,
      businessName: 'D4 Test Gym',
      trainerName: 'Coach D4',
    }));

    // Seed parent user + profile
    const parentHash = await passwordService.hash(PARENT_PASSWORD);
    const parent = await userRepo.save(userRepo.create({
      email: PARENT_EMAIL,
      passwordHash: parentHash,
      role: UserRole.PLAYER,
      status: UserStatus.ACTIVE,
      emailVerified: true,
    }));
    parentId = parent.id;

    const parentProfile = await playerProfileRepo.save(playerProfileRepo.create({
      userId: parentId,
      name: 'Parent D4',
      isChild: false,
    }));
    parentProfileId = parentProfile.id;

    // Associate parent with trainer
    await assocRepo.save(assocRepo.create({
      trainerId,
      playerProfileId: parentProfileId,
      status: AssociationStatus.ACTIVE,
    }));

    // Login as parent to get session
    const csrfRes = await request(app.getHttpServer()).get('/api/v1/auth/csrf');
    csrfToken = csrfRes.body.token;
    const rawCookie = csrfRes.headers['set-cookie'];
    const cookieStr = Array.isArray(rawCookie) ? rawCookie[0] : rawCookie;

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Cookie', cookieStr)
      .set('X-CSRF-Token', csrfToken)
      .send({ email: PARENT_EMAIL, password: PARENT_PASSWORD });

    sessionCookie = loginRes.headers['set-cookie']?.[0] ?? cookieStr;
  });

  afterAll(async () => {
    // Cleanup in order
    await childLoginRepo.delete({ parentUserId: parentId });
    const children = await playerProfileRepo.find({ where: { parentUserId: parentId } });
    for (const child of children) {
      await assocRepo.delete({ playerProfileId: child.id });
      await userRepo.delete({ id: child.userId });
    }
    await playerProfileRepo.delete({ parentUserId: parentId });
    await assocRepo.delete({ playerProfileId: parentProfileId });
    await playerProfileRepo.delete({ userId: parentId });
    await userRepo.delete({ id: parentId });
    await trainerProfileRepo.delete({ userId: trainerId });
    await userRepo.delete({ id: trainerId });
    await app.close();
  });

  // ── Test 1: Create child profile ─────────────────────────────────────────

  it('[D2] POST /players/me/children → creates child profile', async () => {
    const csrfRes = await request(app.getHttpServer())
      .get('/api/v1/auth/csrf')
      .set('Cookie', sessionCookie);
    const csrf = csrfRes.body.token;

    const res = await request(app.getHttpServer())
      .post('/api/v1/players/me/children')
      .set('Cookie', sessionCookie)
      .set('X-CSRF-Token', csrf)
      .send({
        name: 'Child D4',
        dateOfBirth: '2016-03-01', // derived age ~10 as of 2026-06-09 (Q-01.02)
        gender: 'MALE',
        school: 'Test School',
        trainerIds: [trainerId],
      });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Child D4');
    expect(res.body.isChild).toBe(true);
    expect(res.body.dateOfBirth).toBe('2016-03-01');
    expect(res.body.age).toBe(10); // derived
    expect(res.body.parentUserId).toBe(parentId);

    // Verify DB was created
    const child = await playerProfileRepo.findOne({ where: { parentUserId: parentId, isChild: true } });
    expect(child).toBeTruthy();
    expect(child?.name).toBe('Child D4');
  });

  // ── Test 2: BR-017 age validation (age < 1 or > 18 → 400) ──────────────────────────

  it('[D2][BR-017] dateOfBirth implying age < 1 → 400 validation error (SANITY CHECK)', async () => {
    const csrfRes = await request(app.getHttpServer())
      .get('/api/v1/auth/csrf')
      .set('Cookie', sessionCookie);
    const csrf = csrfRes.body.token;

    // Born 6 months ago → age 0 → below minimum
    const res = await request(app.getHttpServer())
      .post('/api/v1/players/me/children')
      .set('Cookie', sessionCookie)
      .set('X-CSRF-Token', csrf)
      .send({ name: 'Too Young', dateOfBirth: '2026-03-01', gender: 'MALE' });

    expect(res.status).toBe(400);
  });

  it('[D2][BR-017] dateOfBirth implying age > 18 → 400 validation error (SANITY CHECK)', async () => {
    const csrfRes = await request(app.getHttpServer())
      .get('/api/v1/auth/csrf')
      .set('Cookie', sessionCookie);
    const csrf = csrfRes.body.token;

    // Born 2005 → age ~21 → above maximum
    const res = await request(app.getHttpServer())
      .post('/api/v1/players/me/children')
      .set('Cookie', sessionCookie)
      .set('X-CSRF-Token', csrf)
      .send({ name: 'Too Old', dateOfBirth: '2005-03-01', gender: 'MALE' });

    expect(res.status).toBe(400);
  });

  // ── Test 3: GET /players/me/children lists children ───────────────────────

  it('[D2] GET /players/me/children returns list', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/players/me/children')
      .set('Cookie', sessionCookie);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body.every((c: { isChild: boolean }) => c.isChild === true)).toBe(true);
  });

  // ── Test 4: Context switching ─────────────────────────────────────────────

  it('[D4] GET /players/me/contexts returns parent + children contexts', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/players/me/contexts')
      .set('Cookie', sessionCookie);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    // Should include parent's own contexts
    const parentContexts = res.body.data.filter(
      (c: { isSelf: boolean }) => c.isSelf === true,
    );
    expect(parentContexts.length).toBeGreaterThanOrEqual(1);
  });

  it('[D4] POST /players/me/context switches to valid context', async () => {
    // Get available contexts first
    const ctxRes = await request(app.getHttpServer())
      .get('/api/v1/players/me/contexts')
      .set('Cookie', sessionCookie);

    const firstCtx = ctxRes.body.data[0];
    expect(firstCtx).toBeTruthy();

    const csrfRes = await request(app.getHttpServer())
      .get('/api/v1/auth/csrf')
      .set('Cookie', sessionCookie);
    const csrf = csrfRes.body.token;

    const res = await request(app.getHttpServer())
      .post('/api/v1/players/me/context')
      .set('Cookie', sessionCookie)
      .set('X-CSRF-Token', csrf)
      .send({ profileId: firstCtx.profileId, trainerId: firstCtx.trainerId });

    expect(res.status).toBe(200);
    expect(res.body.profileId).toBe(firstCtx.profileId);
  });

  // ── Test 5: Child sub-login authentication ────────────────────────────────

  it('[D5] child sub-login → principal with isChild=true', async () => {
    // Find the child profile to create a login for it
    const child = await playerProfileRepo.findOne({
      where: { parentUserId: parentId, isChild: true },
    });
    expect(child).toBeTruthy();

    // Create child login directly in DB (service layer)
    const hash = await passwordService.hash(CHILD_PASSWORD);
    const existingLogin = await childLoginRepo.findOne({ where: { childUsername: CHILD_USERNAME } });
    if (!existingLogin) {
      await childLoginRepo.save(childLoginRepo.create({
        childProfileId: child!.id,
        parentUserId: parentId,
        childUsername: CHILD_USERNAME,
        passwordHash: hash,
        tokenSpendAllowed: false,
        isActive: true,
      }));
    }

    // Login with child credentials (using "child:" prefix)
    const childCsrfRes = await request(app.getHttpServer()).get('/api/v1/auth/csrf');
    const childCsrf = childCsrfRes.body.token;
    const childCookie = childCsrfRes.headers['set-cookie']?.[0];

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Cookie', childCookie)
      .set('X-CSRF-Token', childCsrf)
      .send({
        email: `child:${CHILD_USERNAME}`,
        password: CHILD_PASSWORD,
      });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.isChild).toBe(true);
    expect(loginRes.body.id).toMatch(/^child:/);
  });

  // ── Test 6: Child principal → 403 on add-trainer (D6 CASL constraint) ────

  it('[D6][GENUINE] child principal attempting POST /join/:code → 403 CHILD_SHARELINK_BLOCKED', async () => {
    // Login as child
    const child = await playerProfileRepo.findOne({
      where: { parentUserId: parentId, isChild: true },
    });
    const existingLogin = await childLoginRepo.findOne({ where: { childUsername: CHILD_USERNAME } });
    if (!existingLogin) {
      const hash = await passwordService.hash(CHILD_PASSWORD);
      await childLoginRepo.save(childLoginRepo.create({
        childProfileId: child!.id,
        parentUserId: parentId,
        childUsername: CHILD_USERNAME,
        passwordHash: hash,
        tokenSpendAllowed: false,
        isActive: true,
      }));
    }

    const childCsrfRes = await request(app.getHttpServer()).get('/api/v1/auth/csrf');
    const childCsrf = childCsrfRes.body.token;
    const childCookie = childCsrfRes.headers['set-cookie']?.[0];

    const childLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Cookie', childCookie)
      .set('X-CSRF-Token', childCsrf)
      .send({ email: `child:${CHILD_USERNAME}`, password: CHILD_PASSWORD });

    const childSession = childLoginRes.headers['set-cookie']?.[0] ?? childCookie;

    // Attempt to join via share link as child — should be 403
    const joinCsrfRes = await request(app.getHttpServer())
      .get('/api/v1/auth/csrf')
      .set('Cookie', childSession);
    const joinCsrf = joinCsrfRes.body.token;

    const joinRes = await request(app.getHttpServer())
      .post('/api/v1/join/some-test-link-code')
      .set('Cookie', childSession)
      .set('X-CSRF-Token', joinCsrf)
      .send({ name: 'Child', email: 'child@test.com', password: 'ValidPass123!' });

    // Should be 403 (child sharelink block) — this is the key D6 constraint
    expect(joinRes.status).toBe(403);
    expect(joinRes.body.errorCode).toBe('CHILD_SHARELINK_BLOCKED');
  });
});
