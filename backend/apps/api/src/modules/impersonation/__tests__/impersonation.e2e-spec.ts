/**
 * F3–F6: Impersonation API E2E Tests
 *
 * Tests:
 *   F3: POST /impersonation/:userId — start impersonation, 403 SA→SA block (SEC-008), 404 not found
 *   F4: POST /impersonation/exit — close bracket, 1h cap auto-exit (seeded expired session)
 *   F5: Dual-actor attribution — mutations during impersonation stamp both actor + admin IDs
 *   F6: GET /impersonation/history — paginated, filter by adminId / impersonatedUserId
 *
 * Sanity checks (verified to fail if the guard is removed):
 *   - SA→SA block: 403 CANNOT_IMPERSONATE_SUPER_ADMIN
 *   - Non-SA blocked: 403 from RolesGuard
 *   - 1h cap auto-exit: seeded impersonationStartedAt in the past triggers auto-exit
 *   - Dual-actor attribution: AuditLog row has both actorId=subject AND actingAdminId=real SA
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
import { ImpersonationLog } from '../entities/impersonation-log.entity';
import { AuditLog } from '../../../shared/audit/audit-log.entity';

describe('F3-F6: Impersonation API', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;
  let impersonationLogRepo: Repository<ImpersonationLog>;
  let auditLogRepo: Repository<AuditLog>;
  let passwordService: PasswordService;

  const PASSWORD = 'Password123!';
  const SA_EMAIL = 'sa-impersonation@test.com';
  const SA2_EMAIL = 'sa2-impersonation@test.com';
  const TRAINER_EMAIL = 'trainer-impersonation@test.com';
  const COACH_EMAIL = 'coach-impersonation@test.com';

  let saCookie: string;
  let saId: string;
  let sa2Id: string;
  let trainerId: string;
  let coachId: string;
  let trainerCookie: string;
  let csrfToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await bootstrapApp(app);
    await app.init();

    userRepo = moduleFixture.get(getRepositoryToken(User));
    impersonationLogRepo = moduleFixture.get(getRepositoryToken(ImpersonationLog));
    auditLogRepo = moduleFixture.get(getRepositoryToken(AuditLog));
    passwordService = moduleFixture.get(PasswordService);

    await cleanDb();

    // Seed users
    const hash = await passwordService.hash(PASSWORD);

    const sa = await userRepo.save(
      userRepo.create({ email: SA_EMAIL, passwordHash: hash, role: UserRole.SUPER_ADMIN, status: UserStatus.ACTIVE }),
    );
    saId = sa.id;

    const sa2 = await userRepo.save(
      userRepo.create({ email: SA2_EMAIL, passwordHash: hash, role: UserRole.SUPER_ADMIN, status: UserStatus.ACTIVE }),
    );
    sa2Id = sa2.id;

    const trainer = await userRepo.save(
      userRepo.create({ email: TRAINER_EMAIL, passwordHash: hash, role: UserRole.TRAINER, status: UserStatus.ACTIVE }),
    );
    trainerId = trainer.id;

    const coach = await userRepo.save(
      userRepo.create({ email: COACH_EMAIL, passwordHash: hash, role: UserRole.COACH, status: UserStatus.ACTIVE }),
    );
    coachId = coach.id;

    saCookie = await loginAs(SA_EMAIL);
    trainerCookie = await loginAs(TRAINER_EMAIL);
    csrfToken = await getCsrfToken(saCookie);
  });

  afterAll(async () => {
    await cleanDb();
    await app.close();
  });

  async function cleanDb() {
    await userRepo.query('DELETE FROM audit_logs').catch(() => {});
    await userRepo.query('DELETE FROM impersonation_logs').catch(() => {});
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

  // ─── Security: Role-based access ─────────────────────────────────────────

  describe('Security: role-based access', () => {
    /**
     * SANITY CHECK: Non-SA blocked (403 from RolesGuard).
     * Verifies RolesGuard is actually applied to the impersonation routes.
     */
    it('TRAINER cannot start impersonation → 403', async () => {
      const trainerCsrf = await getCsrfToken(trainerCookie);
      const res = await request(app.getHttpServer())
        .post(`/api/v1/impersonation/${coachId}`)
        .set('Cookie', trainerCookie)
        .set('X-CSRF-Token', trainerCsrf);
      expect(res.status).toBe(403);
    });

    it('unauthenticated request → 401 or 403', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/impersonation/${trainerId}`);
      // RolesGuard returns 401 when no principal present; CSRF middleware may return 403 first
      expect([401, 403]).toContain(res.status);
    });
  });

  // ─── F3: POST /impersonation/:userId ─────────────────────────────────────

  describe('F3: POST /impersonation/:userId', () => {
    it('SA can impersonate a TRAINER → 201 with StartImpersonationResponseDto', async () => {
      const csrf = await getCsrfToken(saCookie);
      const res = await request(app.getHttpServer())
        .post(`/api/v1/impersonation/${trainerId}`)
        .set('Cookie', saCookie)
        .set('X-CSRF-Token', csrf);

      expect(res.status).toBe(201);
      expect(res.body.impersonationLogId).toBeDefined();
      expect(res.body.actingAs.id).toBe(trainerId);
      expect(res.body.actingAs.impersonatedBy).toBe(saId);
      expect(res.body.expiresAt).toBeDefined();

      // expiresAt should be ~1h from now
      const expiresAt = new Date(res.body.expiresAt);
      const diffMs = expiresAt.getTime() - Date.now();
      expect(diffMs).toBeGreaterThan(0);
      expect(diffMs).toBeLessThanOrEqual(60 * 60 * 1000 + 5000); // +5s tolerance

      // Bracket should be open in DB
      const log = await impersonationLogRepo.findOne({
        where: { id: res.body.impersonationLogId },
      });
      expect(log).toBeDefined();
      expect(log!.adminId).toBe(saId);
      expect(log!.impersonatedUserId).toBe(trainerId);
      expect(log!.endAt).toBeNull();

      // Clean up: exit impersonation
      const exitCsrf = await getCsrfToken(saCookie);
      await request(app.getHttpServer())
        .post('/api/v1/impersonation/exit')
        .set('Cookie', saCookie)
        .set('X-CSRF-Token', exitCsrf);
    });

    /**
     * SANITY CHECK: SA→SA blocked (SEC-008).
     * If this check were removed, a SUPER_ADMIN could escalate to another SA context.
     */
    it('SA→SA impersonation → 403 CANNOT_IMPERSONATE_SUPER_ADMIN', async () => {
      const csrf = await getCsrfToken(saCookie);
      const res = await request(app.getHttpServer())
        .post(`/api/v1/impersonation/${sa2Id}`)
        .set('Cookie', saCookie)
        .set('X-CSRF-Token', csrf);

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('CANNOT_IMPERSONATE_SUPER_ADMIN');
    });

    it('nonexistent userId → 404 USER_NOT_FOUND', async () => {
      const csrf = await getCsrfToken(saCookie);
      const res = await request(app.getHttpServer())
        .post(`/api/v1/impersonation/00000000-0000-4000-a000-000000000000`)
        .set('Cookie', saCookie)
        .set('X-CSRF-Token', csrf);

      expect(res.status).toBe(404);
      expect(res.body.errorCode).toBe('USER_NOT_FOUND');
    });

    it('SA can impersonate a COACH → 201', async () => {
      const csrf = await getCsrfToken(saCookie);
      const res = await request(app.getHttpServer())
        .post(`/api/v1/impersonation/${coachId}`)
        .set('Cookie', saCookie)
        .set('X-CSRF-Token', csrf);

      expect(res.status).toBe(201);
      expect(res.body.actingAs.role).toBe(UserRole.COACH);

      // Clean up
      const exitCsrf = await getCsrfToken(saCookie);
      await request(app.getHttpServer())
        .post('/api/v1/impersonation/exit')
        .set('Cookie', saCookie)
        .set('X-CSRF-Token', exitCsrf);
    });

    it('audit log IMPERSONATION_START is written with correct fields', async () => {
      // Clear audit logs first
      await auditLogRepo.query('DELETE FROM audit_logs');

      const csrf = await getCsrfToken(saCookie);
      const res = await request(app.getHttpServer())
        .post(`/api/v1/impersonation/${trainerId}`)
        .set('Cookie', saCookie)
        .set('X-CSRF-Token', csrf);

      expect(res.status).toBe(201);

      const auditEntry = await auditLogRepo.findOne({
        where: { action: 'IMPERSONATION_START' },
      });
      expect(auditEntry).toBeDefined();
      expect(auditEntry!.actorId).toBe(saId);
      expect(auditEntry!.actingAdminId).toBeNull();
      expect(auditEntry!.targetId).toBe(res.body.impersonationLogId);

      // Clean up
      const exitCsrf = await getCsrfToken(saCookie);
      await request(app.getHttpServer())
        .post('/api/v1/impersonation/exit')
        .set('Cookie', saCookie)
        .set('X-CSRF-Token', exitCsrf);
    });
  });

  // ─── F4: POST /impersonation/exit ─────────────────────────────────────────

  describe('F4: POST /impersonation/exit', () => {
    it('closes the bracket — sets endAt + durationSeconds', async () => {
      // Start impersonation
      const csrf = await getCsrfToken(saCookie);
      const startRes = await request(app.getHttpServer())
        .post(`/api/v1/impersonation/${trainerId}`)
        .set('Cookie', saCookie)
        .set('X-CSRF-Token', csrf);
      expect(startRes.status).toBe(201);
      const { impersonationLogId } = startRes.body as { impersonationLogId: string };

      // Exit impersonation
      const exitCsrf = await getCsrfToken(saCookie);
      const exitRes = await request(app.getHttpServer())
        .post('/api/v1/impersonation/exit')
        .set('Cookie', saCookie)
        .set('X-CSRF-Token', exitCsrf);

      expect(exitRes.status).toBe(200);
      expect(exitRes.body.ok).toBe(true);
      expect(exitRes.body.impersonationLogId).toBe(impersonationLogId);

      // Bracket should be closed
      const log = await impersonationLogRepo.findOne({ where: { id: impersonationLogId } });
      expect(log).toBeDefined();
      expect(log!.endAt).not.toBeNull();
      expect(log!.durationSeconds).not.toBeNull();
      expect(log!.durationSeconds).toBeGreaterThanOrEqual(0);
    });

    it('exit when not impersonating → 200 ok (idempotent)', async () => {
      const csrf = await getCsrfToken(saCookie);
      const res = await request(app.getHttpServer())
        .post('/api/v1/impersonation/exit')
        .set('Cookie', saCookie)
        .set('X-CSRF-Token', csrf);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    /**
     * SANITY CHECK: 1h hard cap auto-exit.
     *
     * We seed an impersonation session where impersonationStartedAt is 2h ago
     * (past the 1h cap). When POST /impersonation/:userId is called, the service's
     * checkAndEnforceCapIfNeeded runs and detects the expired session, triggering
     * auto-exit and returning 403 IMPERSONATION_EXPIRED.
     *
     * This validates the lazy cap enforcement path (F4).
     */
    it('1h cap auto-exit: expired session triggers auto-exit on next impersonation start → 403', async () => {
      // Create a fresh SA login
      const hash = await passwordService.hash(PASSWORD);
      const capTestSa = await userRepo.save(
        userRepo.create({
          email: 'sa-cap-test@test.com',
          passwordHash: hash,
          role: UserRole.SUPER_ADMIN,
          status: UserStatus.ACTIVE,
        }),
      );
      const capCookie = await loginAs('sa-cap-test@test.com');
      const capCsrf = await getCsrfToken(capCookie);

      // Manually inject an expired impersonation pair into the session by
      // first starting a real impersonation then patching the session record.
      // We do this via the DB (sessions table) after login.

      // Step 1: Start impersonation to get a real session + open bracket
      const startRes = await request(app.getHttpServer())
        .post(`/api/v1/impersonation/${trainerId}`)
        .set('Cookie', capCookie)
        .set('X-CSRF-Token', capCsrf);
      expect(startRes.status).toBe(201);

      // Step 2: Backdate the impersonationStartedAt in the sessions table to 2h ago
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      await userRepo.query(`
        UPDATE sessions
        SET sess = jsonb_set(
          sess::jsonb,
          '{impersonation,impersonationStartedAt}',
          to_jsonb($1::text)
        )
        WHERE sess->'principal'->>'id' = $2
      `, [twoHoursAgo, capTestSa.id]);

      // Step 3: Try to start a new impersonation → should trigger auto-exit + 403
      const newCsrf = await getCsrfToken(capCookie);
      const res = await request(app.getHttpServer())
        .post(`/api/v1/impersonation/${coachId}`)
        .set('Cookie', capCookie)
        .set('X-CSRF-Token', newCsrf);

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('IMPERSONATION_EXPIRED');

      // Verify the old bracket was closed in DB
      const openBracket = await impersonationLogRepo.findOne({
        where: { adminId: capTestSa.id, impersonatedUserId: trainerId },
      });
      expect(openBracket).toBeDefined();
      expect(openBracket!.endAt).not.toBeNull();

      // Clean up
      await userRepo.delete({ email: 'sa-cap-test@test.com' });
    });

    it('exit writes IMPERSONATION_EXIT audit log with dual-actor attribution', async () => {
      await auditLogRepo.query('DELETE FROM audit_logs');

      // Start then exit
      const csrf1 = await getCsrfToken(saCookie);
      const startRes = await request(app.getHttpServer())
        .post(`/api/v1/impersonation/${trainerId}`)
        .set('Cookie', saCookie)
        .set('X-CSRF-Token', csrf1);
      expect(startRes.status).toBe(201);

      const csrf2 = await getCsrfToken(saCookie);
      await request(app.getHttpServer())
        .post('/api/v1/impersonation/exit')
        .set('Cookie', saCookie)
        .set('X-CSRF-Token', csrf2);

      const exitAudit = await auditLogRepo.findOne({
        where: { action: 'IMPERSONATION_EXIT' },
      });
      expect(exitAudit).toBeDefined();
      // F5: dual-actor — actorId = impersonated subject, actingAdminId = real SA
      expect(exitAudit!.actorId).toBe(trainerId);
      expect(exitAudit!.actingAdminId).toBe(saId);
      expect(exitAudit!.viaImpersonationLogId).toBeDefined();
      expect(exitAudit!.viaImpersonationLogId).not.toBeNull();
    });
  });

  // ─── F5: Dual-actor attribution ───────────────────────────────────────────

  describe('F5: Dual-actor attribution', () => {
    /**
     * SANITY CHECK: Dual-actor attribution.
     *
     * Verifies that when exit is performed during an active impersonation session,
     * the IMPERSONATION_EXIT audit log entry has:
     *   - actorId = impersonated subject (apparent actor)
     *   - actingAdminId = real admin (D6)
     *   - viaImpersonationLogId = bracket id
     *
     * This is the canonical demonstration per F5 spec.
     */
    it('IMPERSONATION_EXIT audit entry carries both actor ids (D6 dual-actor)', async () => {
      await auditLogRepo.query('DELETE FROM audit_logs');

      const csrf1 = await getCsrfToken(saCookie);
      const startRes = await request(app.getHttpServer())
        .post(`/api/v1/impersonation/${coachId}`)
        .set('Cookie', saCookie)
        .set('X-CSRF-Token', csrf1);
      expect(startRes.status).toBe(201);
      const logId = (startRes.body as { impersonationLogId: string }).impersonationLogId;

      const csrf2 = await getCsrfToken(saCookie);
      await request(app.getHttpServer())
        .post('/api/v1/impersonation/exit')
        .set('Cookie', saCookie)
        .set('X-CSRF-Token', csrf2);

      // The IMPERSONATION_EXIT audit entry should have dual-actor attribution
      const exitAudit = await auditLogRepo.findOne({
        where: { action: 'IMPERSONATION_EXIT' },
      });
      expect(exitAudit).toBeDefined();
      expect(exitAudit!.actorId).toBe(coachId);         // apparent actor = impersonated subject
      expect(exitAudit!.actingAdminId).toBe(saId);      // real SA (D6)
      expect(exitAudit!.viaImpersonationLogId).toBe(logId); // links to open bracket
    });
  });

  // ─── F6: GET /impersonation/history ───────────────────────────────────────

  describe('F6: GET /impersonation/history', () => {
    beforeAll(async () => {
      // Seed some closed impersonation logs for the history test
      await impersonationLogRepo.query('DELETE FROM impersonation_logs');

      const startAt = new Date(Date.now() - 30 * 60 * 1000); // 30 min ago
      const endAt = new Date();
      const duration = Math.floor((endAt.getTime() - startAt.getTime()) / 1000);

      // 2 logs for saId→trainerId, 1 for saId→coachId
      await impersonationLogRepo.save([
        impersonationLogRepo.create({
          adminId: saId,
          impersonatedUserId: trainerId,
          startAt,
          endAt,
          durationSeconds: duration,
        }),
        impersonationLogRepo.create({
          adminId: saId,
          impersonatedUserId: trainerId,
          startAt: new Date(startAt.getTime() - 1000),
          endAt: new Date(endAt.getTime() - 1000),
          durationSeconds: duration - 1,
        }),
        impersonationLogRepo.create({
          adminId: saId,
          impersonatedUserId: coachId,
          startAt,
          endAt,
          durationSeconds: duration,
        }),
      ]);
    });

    it('returns paginated history (default page=1, limit=20)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/impersonation/history')
        .set('Cookie', saCookie);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toBeDefined();
      expect(res.body.meta.page).toBe(1);
      expect(res.body.meta.total).toBeGreaterThanOrEqual(3);
    });

    it('filters by adminId', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/impersonation/history?adminId=${saId}`)
        .set('Cookie', saCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(3);
      res.body.data.forEach((row: { adminId: string }) => {
        expect(row.adminId).toBe(saId);
      });
    });

    it('filters by impersonatedUserId', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/impersonation/history?impersonatedUserId=${trainerId}`)
        .set('Cookie', saCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
      res.body.data.forEach((row: { impersonatedUserId: string }) => {
        expect(row.impersonatedUserId).toBe(trainerId);
      });
    });

    it('pagination: limit=1 page=1 returns 1 item and correct totalPages', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/impersonation/history?limit=1&page=1&adminId=${saId}`)
        .set('Cookie', saCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.meta.totalPages).toBeGreaterThanOrEqual(3);
    });

    it('non-SA cannot view history → 403', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/impersonation/history')
        .set('Cookie', trainerCookie);

      expect(res.status).toBe(403);
    });

    it('history entries have expected fields', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/impersonation/history?adminId=${saId}&limit=1`)
        .set('Cookie', saCookie);

      expect(res.status).toBe(200);
      const entry = res.body.data[0];
      expect(entry.id).toBeDefined();
      expect(entry.adminId).toBeDefined();
      expect(entry.impersonatedUserId).toBeDefined();
      expect(entry.startAt).toBeDefined();
      expect(entry.createdAt).toBeDefined();
    });
  });
});
