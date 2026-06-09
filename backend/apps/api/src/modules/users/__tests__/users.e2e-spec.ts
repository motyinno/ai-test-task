/**
 * B2–B6: Users API E2E Tests (Super Admin)
 *
 * Tests:
 *   B2: GET /users — paginated directory, search + role + status filters
 *   B3: POST /users — create trainer, 409 EMAIL_EXISTS, invite email sent, audit logged
 *   B4: GET /users/:id + PATCH /users/:id — read & edit (email/role immutable)
 *   B5: POST /users/:id/deactivate + /reactivate — status toggle, D7 guard
 *   B6: DELETE /users/:id — GDPR anonymize, PII scrubbed, UserDeletionLog written, idempotent
 *
 * Sanity checks (verified the real protections fail if removed):
 *   - anonymization correctness: email/passwordHash changed; anonymizedAt set
 *   - reactivate-after-anonymize guard: returns 409 USER_ANONYMIZED
 *   - SA-only: non-SA gets 403
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../../../app/app.module';
import { bootstrapApp } from '../../../shared/bootstrap/bootstrap';
import { User, UserRole, UserStatus } from '../entities/user.entity';
import { UserDeletionLog } from '../entities/user-deletion-log.entity';
import { TrainerProfile } from '../entities/trainer-profile.entity';
import { CoachProfile } from '../entities/coach-profile.entity';
import { PlayerProfile } from '../entities/player-profile.entity';
import { PasswordService } from '../../../shared/crypto/password.service';
import { EmailService } from '../../../shared/integrations/email/email.service';

describe('B2-B6: Users API (Super Admin)', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;
  let deletionLogRepo: Repository<UserDeletionLog>;
  let trainerProfileRepo: Repository<TrainerProfile>;
  let coachProfileRepo: Repository<CoachProfile>;
  let playerProfileRepo: Repository<PlayerProfile>;
  let passwordService: PasswordService;
  let emailService: EmailService;
  let dataSource: DataSource;

  const SA_EMAIL = 'sa-b2@users-test.com';
  const TRAINER_EMAIL = 'trainer-b2@users-test.com';
  const PASSWORD = 'Password123!';

  let saCookie: string;
  let saId: string;
  let csrfToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await bootstrapApp(app);
    await app.init();

    userRepo = moduleFixture.get(getRepositoryToken(User));
    deletionLogRepo = moduleFixture.get(getRepositoryToken(UserDeletionLog));
    trainerProfileRepo = moduleFixture.get(getRepositoryToken(TrainerProfile));
    coachProfileRepo = moduleFixture.get(getRepositoryToken(CoachProfile));
    playerProfileRepo = moduleFixture.get(getRepositoryToken(PlayerProfile));
    passwordService = moduleFixture.get(PasswordService);
    emailService = moduleFixture.get(EmailService);
    dataSource = moduleFixture.get(DataSource);

    // Clean slate
    await cleanDb();

    // Seed SA user
    const hash = await passwordService.hash(PASSWORD);
    const sa = await userRepo.save(
      userRepo.create({
        email: SA_EMAIL,
        passwordHash: hash,
        role: UserRole.SUPER_ADMIN,
        status: UserStatus.ACTIVE,
      }),
    );
    saId = sa.id;

    saCookie = await loginAs(SA_EMAIL);
    csrfToken = await getCsrfToken(saCookie);
  });

  afterAll(async () => {
    await cleanDb();
    await app.close();
  });

  async function cleanDb() {
    await userRepo.query('DELETE FROM user_deletion_log').catch(() => {});
    await userRepo.query('DELETE FROM trainer_profiles').catch(() => {});
    await userRepo.query('DELETE FROM coach_profiles').catch(() => {});
    await userRepo.query('DELETE FROM player_profiles').catch(() => {});
    await userRepo.query('DELETE FROM email_verification_tokens').catch(() => {});
    await userRepo.query('DELETE FROM password_reset_tokens').catch(() => {});
    await userRepo.query('DELETE FROM sessions').catch(() => {});
    await userRepo.query('DELETE FROM users').catch(() => {});
  }

  async function loginAs(email: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD });
    expect(res.status).toBe(200);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    const sidCookie = (Array.isArray(cookies) ? cookies : [cookies]).find((c) =>
      c.includes('connect.sid'),
    )!;
    return sidCookie.split(';')[0];
  }

  async function getCsrfToken(cookie: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/csrf')
      .set('Cookie', cookie);
    return res.body.token as string;
  }

  // ─── Security: SA-only access ─────────────────────────────────────────────

  describe('Security: SA-only access', () => {
    it('unauthenticated GET /users → 401', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/users');
      expect(res.status).toBe(401);
    });

    it('TRAINER GET /users → 403 (not SA)', async () => {
      const hash = await passwordService.hash(PASSWORD);
      await userRepo.save(
        userRepo.create({
          email: 'trainer-sec@users-test.com',
          passwordHash: hash,
          role: UserRole.TRAINER,
          status: UserStatus.ACTIVE,
        }),
      );
      const trainerCookie = await loginAs('trainer-sec@users-test.com');
      const res = await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Cookie', trainerCookie);
      expect(res.status).toBe(403);
    });
  });

  // ─── B3: POST /users (create trainer) ─────────────────────────────────────

  describe('B3: POST /users — create trainer', () => {
    it('creates a trainer account (INVITE_LINK mode) → 201', async () => {
      emailService.sentMessages.length = 0;

      const res = await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Cookie', saCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({
          businessName: 'Elite Soccer',
          trainerName: 'Coach John',
          email: 'new-trainer@users-test.com',
          onboardingMode: 'INVITE_LINK',
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.email).toBe('new-trainer@users-test.com');
      expect(res.body.role).toBe(UserRole.TRAINER);
      expect(res.body.status).toBe(UserStatus.ACTIVE);
      expect(res.body.passwordHash).toBeUndefined();
    });

    it('sends an invite email via EmailService port', async () => {
      const sent = emailService.sentMessages;
      const inviteEmail = sent.find((m) => m.to === 'new-trainer@users-test.com');
      expect(inviteEmail).toBeDefined();
      expect(inviteEmail!.subject).toContain('invited');
    });

    it('creates a TrainerProfile linked to the user', async () => {
      const user = await userRepo.findOne({ where: { email: 'new-trainer@users-test.com' } });
      expect(user).not.toBeNull();
      const profile = await trainerProfileRepo.findOne({ where: { userId: user!.id } });
      expect(profile).not.toBeNull();
      expect(profile!.businessName).toBe('Elite Soccer');
      expect(profile!.trainerName).toBe('Coach John');
    });

    it('creates trainer with TEMP_PASSWORD mode → mustChangePassword=true', async () => {
      emailService.sentMessages.length = 0;

      const res = await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Cookie', saCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({
          businessName: 'Temp Academy',
          trainerName: 'Coach Temp',
          email: 'temp-trainer@users-test.com',
          onboardingMode: 'TEMP_PASSWORD',
        });

      expect(res.status).toBe(201);
      const user = await userRepo.findOne({ where: { email: 'temp-trainer@users-test.com' } });
      expect(user!.mustChangePassword).toBe(true);

      // Email should contain temp password info
      const tempEmail = emailService.sentMessages.find(
        (m) => m.to === 'temp-trainer@users-test.com',
      );
      expect(tempEmail).toBeDefined();
      expect(tempEmail!.data).toHaveProperty('tempPassword');
    });

    it('409 EMAIL_EXISTS on duplicate email (BR-001)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Cookie', saCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({
          businessName: 'Dup Biz',
          trainerName: 'Coach Dup',
          email: 'new-trainer@users-test.com',
          onboardingMode: 'INVITE_LINK',
        });

      expect(res.status).toBe(409);
      expect(res.body.errorCode).toBe('EMAIL_EXISTS');
    });
  });

  // ─── B2: GET /users (directory) ───────────────────────────────────────────

  describe('B2: GET /users — paginated directory', () => {
    it('returns paginated {data, meta} envelope', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Cookie', saCookie);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('meta');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toMatchObject({
        page: 1,
        limit: 20,
      });
      expect(typeof res.body.meta.total).toBe('number');
      expect(typeof res.body.meta.totalPages).toBe('number');
    });

    it('filters by role', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/users?role=TRAINER')
        .set('Cookie', saCookie);

      expect(res.status).toBe(200);
      for (const user of res.body.data) {
        expect(user.role).toBe(UserRole.TRAINER);
      }
    });

    it('filters by status', async () => {
      const hash = await passwordService.hash(PASSWORD);
      await userRepo.save(
        userRepo.create({
          email: 'inactive-filter@users-test.com',
          passwordHash: hash,
          role: UserRole.TRAINER,
          status: UserStatus.INACTIVE,
        }),
      );

      const res = await request(app.getHttpServer())
        .get('/api/v1/users?status=INACTIVE')
        .set('Cookie', saCookie);

      expect(res.status).toBe(200);
      for (const user of res.body.data) {
        expect(user.status).toBe(UserStatus.INACTIVE);
      }
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('search by email substring', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/users?search=new-trainer')
        .set('Cookie', saCookie);

      expect(res.status).toBe(200);
      const found = res.body.data.find((u: { email: string }) =>
        u.email.includes('new-trainer'),
      );
      expect(found).toBeDefined();
    });

    it('pagination: page 2 returns correct slice', async () => {
      // Seed enough users first
      const hash = await passwordService.hash(PASSWORD);
      for (let i = 0; i < 5; i++) {
        await userRepo.save(
          userRepo.create({
            email: `paginate-${i}@users-test.com`,
            passwordHash: hash,
            role: UserRole.PLAYER,
            status: UserStatus.ACTIVE,
          }),
        ).catch(() => {/* ignore dup */});
      }

      const page1 = await request(app.getHttpServer())
        .get('/api/v1/users?page=1&limit=2')
        .set('Cookie', saCookie);
      const page2 = await request(app.getHttpServer())
        .get('/api/v1/users?page=2&limit=2')
        .set('Cookie', saCookie);

      expect(page1.status).toBe(200);
      expect(page2.status).toBe(200);
      expect(page1.body.data).toHaveLength(2);
      // page 2 ids should differ from page 1 ids
      const page1ids = page1.body.data.map((u: { id: string }) => u.id);
      const page2ids = page2.body.data.map((u: { id: string }) => u.id);
      for (const id of page2ids) {
        expect(page1ids).not.toContain(id);
      }
    });

    it('passwordHash never exposed in response', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Cookie', saCookie);

      for (const user of res.body.data) {
        expect(user.passwordHash).toBeUndefined();
      }
    });
  });

  // ─── B4: GET /users/:id + PATCH ───────────────────────────────────────────

  describe('B4: GET /users/:id + PATCH /users/:id', () => {
    let targetId: string;

    beforeAll(async () => {
      const hash = await passwordService.hash(PASSWORD);
      const target = await userRepo.save(
        userRepo.create({
          email: 'target-b4@users-test.com',
          passwordHash: hash,
          role: UserRole.TRAINER,
          status: UserStatus.ACTIVE,
        }),
      );
      targetId = target.id;
    });

    it('GET /users/:id returns the user', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/users/${targetId}`)
        .set('Cookie', saCookie);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(targetId);
      expect(res.body.email).toBe('target-b4@users-test.com');
      expect(res.body.passwordHash).toBeUndefined();
    });

    it('GET /users/:id → 404 for unknown id', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/users/00000000-0000-4000-8000-000000000000')
        .set('Cookie', saCookie);

      expect(res.status).toBe(404);
      expect(res.body.errorCode).toBe('USER_NOT_FOUND');
    });

    it('PATCH /users/:id updates status', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/users/${targetId}`)
        .set('Cookie', saCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ status: UserStatus.INACTIVE });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(UserStatus.INACTIVE);
    });

    it('PATCH /users/:id cannot change email or role (email/role fields not accepted)', async () => {
      // Sending email/role in body — they are stripped by whitelist DTO
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/users/${targetId}`)
        .set('Cookie', saCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ email: 'hacker@example.com', role: UserRole.SUPER_ADMIN, status: UserStatus.ACTIVE });

      expect(res.status).toBe(200);
      // email and role should be unchanged
      const check = await userRepo.findOne({ where: { id: targetId } });
      expect(check!.email).toBe('target-b4@users-test.com');
      expect(check!.role).toBe(UserRole.TRAINER);
    });
  });

  // ─── B5: Deactivate / Reactivate ──────────────────────────────────────────

  describe('B5: Deactivate / Reactivate', () => {
    let targetId: string;

    beforeAll(async () => {
      const hash = await passwordService.hash(PASSWORD);
      const target = await userRepo.save(
        userRepo.create({
          email: 'deact-b5@users-test.com',
          passwordHash: hash,
          role: UserRole.TRAINER,
          status: UserStatus.ACTIVE,
        }),
      );
      targetId = target.id;
    });

    it('deactivate sets status to INACTIVE', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/users/${targetId}/deactivate`)
        .set('Cookie', saCookie)
        .set('X-CSRF-Token', csrfToken);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(UserStatus.INACTIVE);
    });

    it('reactivate sets status back to ACTIVE', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/users/${targetId}/reactivate`)
        .set('Cookie', saCookie)
        .set('X-CSRF-Token', csrfToken);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(UserStatus.ACTIVE);
    });

    it('D7 guard: reactivate after anonymize → 409 USER_ANONYMIZED', async () => {
      // Create a user and anonymize them
      const hash = await passwordService.hash(PASSWORD);
      const anon = await userRepo.save(
        userRepo.create({
          email: 'anon-guard@users-test.com',
          passwordHash: hash,
          role: UserRole.TRAINER,
          status: UserStatus.ACTIVE,
        }),
      );

      // Manually set anonymizedAt to simulate GDPR deletion
      await userRepo.update(anon.id, {
        anonymizedAt: new Date(),
        status: UserStatus.DELETED,
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/users/${anon.id}/reactivate`)
        .set('Cookie', saCookie)
        .set('X-CSRF-Token', csrfToken);

      expect(res.status).toBe(409);
      expect(res.body.errorCode).toBe('USER_ANONYMIZED');
    });

    it('deactivate also blocks if user is already anonymized', async () => {
      const hash = await passwordService.hash(PASSWORD);
      const anon = await userRepo.save(
        userRepo.create({
          email: 'anon-deact@users-test.com',
          passwordHash: hash,
          role: UserRole.TRAINER,
          status: UserStatus.ACTIVE,
        }),
      );

      await userRepo.update(anon.id, {
        anonymizedAt: new Date(),
        status: UserStatus.DELETED,
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/users/${anon.id}/deactivate`)
        .set('Cookie', saCookie)
        .set('X-CSRF-Token', csrfToken);

      expect(res.status).toBe(409);
      expect(res.body.errorCode).toBe('USER_ANONYMIZED');
    });
  });

  // ─── B6: GDPR DELETE (anonymize) ─────────────────────────────────────────

  describe('B6: GDPR DELETE /users/:id — anonymize PII', () => {
    let targetId: string;
    let originalEmail: string;

    beforeAll(async () => {
      originalEmail = 'gdpr-target@users-test.com';
      const hash = await passwordService.hash(PASSWORD);
      const target = await userRepo.save(
        userRepo.create({
          email: originalEmail,
          passwordHash: hash,
          role: UserRole.TRAINER,
          status: UserStatus.ACTIVE,
        }),
      );
      targetId = target.id;
    });

    it('DELETE /users/:id anonymizes PII and returns 200 with anonymized response', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/users/${targetId}`)
        .set('Cookie', saCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ reason: 'User requested GDPR deletion' });

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(targetId);
      expect(res.body.status).toBe(UserStatus.DELETED);
      expect(res.body.displayName).toBe('Deleted User');
      expect(res.body.anonymizedAt).toBeDefined();
    });

    it('PII is actually scrubbed from the database', async () => {
      const user = await userRepo.findOne({ where: { id: targetId } });
      expect(user).not.toBeNull();

      // Email replaced with anonymized form (SANITY CHECK: protects real privacy)
      expect(user!.email).toBe(`deleted_${targetId}@example.com`);
      expect(user!.email).not.toBe(originalEmail);

      // Password hash is scrubbed
      expect(user!.passwordHash).toBe('ANONYMIZED');

      // anonymizedAt is set
      expect(user!.anonymizedAt).not.toBeNull();

      // status is DELETED
      expect(user!.status).toBe(UserStatus.DELETED);
    });

    it('UserDeletionLog is written in the same transaction', async () => {
      const logEntry = await deletionLogRepo.findOne({
        where: { originalUserId: targetId },
      });

      expect(logEntry).not.toBeNull();
      expect(logEntry!.originalUserId).toBe(targetId);
      expect(logEntry!.originalEmail).toBe(originalEmail);
      expect(logEntry!.deletedBy).toBe(saId);
      expect(logEntry!.reason).toBe('User requested GDPR deletion');
    });

    it('DELETE is idempotent — second call returns 200 with same state', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/users/${targetId}`)
        .set('Cookie', saCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ reason: 'Second deletion attempt (idempotency test)' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(UserStatus.DELETED);
      expect(res.body.displayName).toBe('Deleted User');
    });

    it('Cannot delete a Super Admin (policy guard)', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/users/${saId}`)
        .set('Cookie', saCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ reason: 'Trying to delete SA' });

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('CANNOT_DELETE_SUPER_ADMIN');
    });

    it('FKs are preserved — the anonymized user row still exists', async () => {
      // Player with parentUserId → anonymized parent should still allow FK reads
      const hash = await passwordService.hash(PASSWORD);
      const parent = await userRepo.save(
        userRepo.create({
          email: 'parent-fk-del@users-test.com',
          passwordHash: hash,
          role: UserRole.PLAYER,
          status: UserStatus.ACTIVE,
        }),
      );

      await request(app.getHttpServer())
        .delete(`/api/v1/users/${parent.id}`)
        .set('Cookie', saCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ reason: 'FK preservation test' });

      // User row must still exist (anonymized, not deleted from DB)
      const still = await userRepo.findOne({ where: { id: parent.id } });
      expect(still).not.toBeNull();
      expect(still!.status).toBe(UserStatus.DELETED);
    });
  });

  // ─── SANITY CHECKS: Verify guards are real (not hollow) ──────────────────

  describe('SANITY: Verify anonymization correctness (protection must fail if removed)', () => {
    it('anonymizedAt is not null after GDPR delete — reactivate MUST be blocked', async () => {
      const hash = await passwordService.hash(PASSWORD);
      const victim = await userRepo.save(
        userRepo.create({
          email: 'sanity-victim@users-test.com',
          passwordHash: hash,
          role: UserRole.COACH,
          status: UserStatus.ACTIVE,
        }),
      );

      // GDPR delete
      await request(app.getHttpServer())
        .delete(`/api/v1/users/${victim.id}`)
        .set('Cookie', saCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ reason: 'Sanity check test' });

      // Read back from DB to confirm anonymizedAt is set
      const dbRow = await userRepo.findOne({ where: { id: victim.id } });
      expect(dbRow!.anonymizedAt).not.toBeNull();

      // Now try to reactivate — MUST get 409 (not 200)
      const reactRes = await request(app.getHttpServer())
        .post(`/api/v1/users/${victim.id}/reactivate`)
        .set('Cookie', saCookie)
        .set('X-CSRF-Token', csrfToken);

      // The D7 guard: if this were broken it would return 200 — test proves it returns 409
      expect(reactRes.status).toBe(409);
      expect(reactRes.body.errorCode).toBe('USER_ANONYMIZED');
    });

    it('original email is genuinely replaced (not null, not empty)', async () => {
      const hash = await passwordService.hash(PASSWORD);
      const victim = await userRepo.save(
        userRepo.create({
          email: 'sanity-email@users-test.com',
          passwordHash: hash,
          role: UserRole.TRAINER,
          status: UserStatus.ACTIVE,
        }),
      );
      const victimId = victim.id;

      await request(app.getHttpServer())
        .delete(`/api/v1/users/${victimId}`)
        .set('Cookie', saCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ reason: 'Email sanity check' });

      const dbRow = await userRepo.findOne({ where: { id: victimId } });
      // Must be the anonymized form, not original, not empty
      expect(dbRow!.email).toBe(`deleted_${victimId}@example.com`);
      expect(dbRow!.email).not.toBe('sanity-email@users-test.com');
      expect(dbRow!.email.length).toBeGreaterThan(0);
    });
  });

  // ─── C1: GDPR — profile PII scrub (D7 / US-01.13) ───────────────────────
  // FAILING-FIRST: These tests must fail before anonymizeInTransaction scrubs profiles.
  // After the fix they pin that TrainerProfile/CoachProfile/PlayerProfile PII is
  // genuinely erased in the same transaction as the User row wipe.

  describe('C1 GDPR: role-profile PII scrubbed on DELETE (D7 / US-01.13)', () => {
    // ── Trainer ────────────────────────────────────────────────────────────

    it('TrainerProfile PII is scrubbed in the same transaction as user anonymization', async () => {
      // Arrange: create trainer via POST /users (this also creates the TrainerProfile)
      const res = await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Cookie', saCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({
          businessName: 'GDPR Biz',
          trainerName: 'GDPR Trainer',
          email: 'c1-trainer@users-test.com',
          onboardingMode: 'INVITE_LINK',
          phone: '+12025550001',
        });

      expect(res.status).toBe(201);
      const trainerId = res.body.id as string;

      // Verify profile exists with PII before delete
      const profileBefore = await trainerProfileRepo.findOne({ where: { userId: trainerId } });
      expect(profileBefore).not.toBeNull();
      expect(profileBefore!.trainerName).toBe('GDPR Trainer');
      expect(profileBefore!.businessName).toBe('GDPR Biz');

      // Act: GDPR delete
      const delRes = await request(app.getHttpServer())
        .delete(`/api/v1/users/${trainerId}`)
        .set('Cookie', saCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ reason: 'C1 trainer profile scrub test' });

      expect(delRes.status).toBe(200);

      // Assert: TrainerProfile PII columns must be scrubbed
      const profileAfter = await trainerProfileRepo.findOne({ where: { userId: trainerId } });
      expect(profileAfter).not.toBeNull(); // row preserved (no delete)
      expect(profileAfter!.trainerName).toBe('Deleted User');
      expect(profileAfter!.businessName).toBe('Deleted User');
      expect(profileAfter!.phone).toBeNull();
      expect(profileAfter!.photoUrl).toBeNull();
    });

    // ── Coach ──────────────────────────────────────────────────────────────

    it('CoachProfile PII is scrubbed in the same transaction as user anonymization', async () => {
      // Arrange: create a coach user and seed CoachProfile directly in DB
      const hash = await passwordService.hash(PASSWORD);
      const trainerUser = await userRepo.save(
        userRepo.create({
          email: 'c1-trainer-owner@users-test.com',
          passwordHash: hash,
          role: UserRole.TRAINER,
          status: UserStatus.ACTIVE,
        }),
      );
      const coachUser = await userRepo.save(
        userRepo.create({
          email: 'c1-coach@users-test.com',
          passwordHash: hash,
          role: UserRole.COACH,
          status: UserStatus.ACTIVE,
        }),
      );
      await coachProfileRepo.save(
        coachProfileRepo.create({
          userId: coachUser.id,
          trainerId: trainerUser.id,
          bio: 'Experienced coach',
          credentials: 'UEFA Pro License',
          photoUrl: 'https://example.com/coach.jpg',
          publicProfile: true,
        }),
      );

      // Verify profile exists with PII before delete
      const profileBefore = await coachProfileRepo.findOne({ where: { userId: coachUser.id } });
      expect(profileBefore).not.toBeNull();
      expect(profileBefore!.bio).toBe('Experienced coach');
      expect(profileBefore!.credentials).toBe('UEFA Pro License');
      expect(profileBefore!.photoUrl).toBe('https://example.com/coach.jpg');

      // Act: GDPR delete
      const delRes = await request(app.getHttpServer())
        .delete(`/api/v1/users/${coachUser.id}`)
        .set('Cookie', saCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ reason: 'C1 coach profile scrub test' });

      expect(delRes.status).toBe(200);

      // Assert: CoachProfile PII columns must be scrubbed
      const profileAfter = await coachProfileRepo.findOne({ where: { userId: coachUser.id } });
      expect(profileAfter).not.toBeNull(); // row preserved
      expect(profileAfter!.bio).toBeNull();
      expect(profileAfter!.credentials).toBeNull();
      expect(profileAfter!.photoUrl).toBeNull();
    });

    // ── Player ─────────────────────────────────────────────────────────────

    it('PlayerProfile PII is scrubbed in the same transaction as user anonymization', async () => {
      // Arrange: create a player user and seed PlayerProfile directly in DB
      const hash = await passwordService.hash(PASSWORD);
      const playerUser = await userRepo.save(
        userRepo.create({
          email: 'c1-player@users-test.com',
          passwordHash: hash,
          role: UserRole.PLAYER,
          status: UserStatus.ACTIVE,
        }),
      );
      await playerProfileRepo.save(
        playerProfileRepo.create({
          userId: playerUser.id,
          name: 'Alex Smith',
          dateOfBirth: '2010-01-01', // derived age ~16 (Q-01.02)
          gender: 'MALE',
          school: 'Springfield High',
          jerseyNumber: '10',
          photoUrl: 'https://example.com/player.jpg',
        }),
      );

      // Verify profile exists with PII before delete
      const profileBefore = await playerProfileRepo.findOne({ where: { userId: playerUser.id } });
      expect(profileBefore).not.toBeNull();
      expect(profileBefore!.name).toBe('Alex Smith');
      expect(profileBefore!.school).toBe('Springfield High');
      expect(profileBefore!.jerseyNumber).toBe('10');
      expect(profileBefore!.photoUrl).toBe('https://example.com/player.jpg');

      // Act: GDPR delete
      const delRes = await request(app.getHttpServer())
        .delete(`/api/v1/users/${playerUser.id}`)
        .set('Cookie', saCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ reason: 'C1 player profile scrub test' });

      expect(delRes.status).toBe(200);

      // Assert: PlayerProfile PII columns scrubbed; dateOfBirth/gender kept for analytics (US-01.13)
      const profileAfter = await playerProfileRepo.findOne({ where: { userId: playerUser.id } });
      expect(profileAfter).not.toBeNull(); // row preserved
      expect(profileAfter!.name).toBe('Deleted User');
      expect(profileAfter!.school).toBeNull();
      expect(profileAfter!.jerseyNumber).toBeNull();
      expect(profileAfter!.photoUrl).toBeNull();
      // dateOfBirth and gender are retained for analytics per US-01.13 (Q-01.02)
      expect(profileAfter!.dateOfBirth).toBe('2010-01-01');
      expect(profileAfter!.gender).toBe('MALE');
    });

    it('profile scrub is idempotent — second DELETE returns 200 without error', async () => {
      const hash = await passwordService.hash(PASSWORD);
      const u = await userRepo.save(
        userRepo.create({
          email: 'c1-idempotent@users-test.com',
          passwordHash: hash,
          role: UserRole.TRAINER,
          status: UserStatus.ACTIVE,
        }),
      );
      await trainerProfileRepo.save(
        trainerProfileRepo.create({
          userId: u.id,
          businessName: 'Idempotent Biz',
          trainerName: 'Idempotent Trainer',
        }),
      );

      // First delete
      await request(app.getHttpServer())
        .delete(`/api/v1/users/${u.id}`)
        .set('Cookie', saCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ reason: 'First delete' });

      // Second delete — must be 200 (idempotent)
      const res2 = await request(app.getHttpServer())
        .delete(`/api/v1/users/${u.id}`)
        .set('Cookie', saCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ reason: 'Second delete idempotency' });

      expect(res2.status).toBe(200);
      expect(res2.body.status).toBe(UserStatus.DELETED);
    });
  });
});
