/**
 * D8/D9: Approvals API e2e tests.
 *
 * Tests:
 *  1. POST /approvals/:id/approve → 409 APPROVAL_NOT_PENDING when terminal (race guard).
 *  2. POST /approvals/:id/deny   → 409 APPROVAL_NOT_PENDING when terminal.
 *  3. GET /approvals → returns paginated queue for parent.
 *  4. PATCH /players/me/children/:childId/token-setting → toggles setting.
 *  5. GET /approvals/:id → 403 when parent doesn't own the request.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../../../app/app.module';
import { bootstrapApp } from '../../../shared/bootstrap/bootstrap';
import { User, UserRole, UserStatus } from '../../users/entities/user.entity';
import { PlayerProfile } from '../../users/entities/player-profile.entity';
import {
  ApprovalRequest,
  ApprovalStatus,
  PaymentType,
} from '../entities/approval-request.entity';
import { PasswordService } from '../../../shared/crypto/password.service';
import { ChildLogin } from '../../child-account/entities/child-login.entity';

describe('D8: Approvals API e2e', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;
  let playerProfileRepo: Repository<PlayerProfile>;
  let approvalRepo: Repository<ApprovalRequest>;
  let childLoginRepo: Repository<ChildLogin>;
  let passwordService: PasswordService;
  let dataSource: DataSource;

  const PARENT_EMAIL = 'parent-d8@test.com';
  const PARENT_PASSWORD = 'ParentPass123!';
  let parentId: string;
  let childProfileId: string;
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
    approvalRepo = moduleFixture.get(getRepositoryToken(ApprovalRequest));
    childLoginRepo = moduleFixture.get(getRepositoryToken(ChildLogin));
    passwordService = moduleFixture.get(PasswordService);
    dataSource = moduleFixture.get(DataSource);

    // Seed parent user
    const hash = await passwordService.hash(PARENT_PASSWORD);
    const parent = await userRepo.save(userRepo.create({
      email: PARENT_EMAIL,
      passwordHash: hash,
      role: UserRole.PLAYER,
      status: UserStatus.ACTIVE,
      emailVerified: true,
    }));
    parentId = parent.id;

    // Seed parent's own PlayerProfile
    await playerProfileRepo.save(playerProfileRepo.create({
      userId: parentId,
      name: 'Parent User',
      isChild: false,
    }));

    // Seed child user + PlayerProfile
    const childUser = await userRepo.save(userRepo.create({
      email: `child-${Date.now()}@child.internal`,
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$placeholder',
      role: UserRole.PLAYER,
      status: UserStatus.ACTIVE,
      emailVerified: true,
    }));
    const childProfile = await playerProfileRepo.save(playerProfileRepo.create({
      userId: childUser.id,
      parentUserId: parentId,
      name: 'Child User',
      age: 10,
      gender: 'MALE',
      isChild: true,
    }));
    childProfileId = childProfile.id;

    // Login as parent
    const csrfRes = await request(app.getHttpServer()).get('/api/v1/auth/csrf');
    csrfToken = csrfRes.body.token;
    const sessionCookieRaw = csrfRes.headers['set-cookie'];
    const cookieStr = Array.isArray(sessionCookieRaw) ? sessionCookieRaw[0] : sessionCookieRaw;

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Cookie', cookieStr)
      .set('X-CSRF-Token', csrfToken)
      .send({ email: PARENT_EMAIL, password: PARENT_PASSWORD });

    sessionCookie = loginRes.headers['set-cookie']?.[0] ?? cookieStr;
    csrfToken = loginRes.body.csrfToken ?? csrfToken;
  });

  afterAll(async () => {
    // Cleanup
    await approvalRepo.delete({ parentUserId: parentId });
    await childLoginRepo.delete({ parentUserId: parentId });
    await playerProfileRepo.delete({ parentUserId: parentId });
    const childUser = await playerProfileRepo.findOne({ where: { id: childProfileId } });
    if (childUser) await userRepo.delete({ id: childUser.userId });
    await playerProfileRepo.delete({ userId: parentId });
    await userRepo.delete({ id: parentId });
    await app.close();
  });

  async function createApprovalInDb(
    status: ApprovalStatus,
    paymentType: PaymentType = PaymentType.USD,
    autoApproved = false,
  ): Promise<ApprovalRequest> {
    return approvalRepo.save(
      approvalRepo.create({
        childProfileId,
        parentUserId: parentId,
        paymentType,
        status,
        autoApproved,
        expiresAt: autoApproved ? null : new Date(Date.now() + 48 * 60 * 60 * 1000),
        eventRef: 'test-event-001',
        amount: 50,
      }),
    );
  }

  // ── Test 1: GET /approvals returns paginated queue ────────────────────────

  it('[D8] GET /approvals returns paginated list for parent', async () => {
    await createApprovalInDb(ApprovalStatus.PENDING);

    const res = await request(app.getHttpServer())
      .get('/api/v1/approvals')
      .set('Cookie', sessionCookie);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.meta).toMatchObject({
      page: 1,
      limit: 20,
    });
    expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
  });

  // ── Test 2: GET /approvals filters by status ──────────────────────────────

  it('[D8] GET /approvals?status=PENDING filters correctly', async () => {
    await createApprovalInDb(ApprovalStatus.APPROVED); // should not appear in PENDING filter

    const res = await request(app.getHttpServer())
      .get('/api/v1/approvals?status=PENDING')
      .set('Cookie', sessionCookie);

    expect(res.status).toBe(200);
    // All returned items should be PENDING
    for (const item of res.body.data) {
      expect(item.status).toBe(ApprovalStatus.PENDING);
    }
  });

  // ── Test 3: POST /approve → 409 on terminal row (GENUINE race guard) ─────

  it('[D8][GENUINE] POST /approve on EXPIRED row → 409 APPROVAL_NOT_PENDING', async () => {
    const approval = await createApprovalInDb(ApprovalStatus.EXPIRED);

    // Get fresh CSRF token for this request
    const csrfRes = await request(app.getHttpServer())
      .get('/api/v1/auth/csrf')
      .set('Cookie', sessionCookie);
    const freshCsrf = csrfRes.body.token;

    const res = await request(app.getHttpServer())
      .post(`/api/v1/approvals/${approval.id}/approve`)
      .set('Cookie', sessionCookie)
      .set('X-CSRF-Token', freshCsrf)
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.errorCode).toBe('APPROVAL_NOT_PENDING');

    // Cleanup
    await approvalRepo.delete({ id: approval.id });
  });

  // ── Test 4: POST /deny → 409 on terminal row ─────────────────────────────

  it('[D8][GENUINE] POST /deny on APPROVED row → 409 APPROVAL_NOT_PENDING', async () => {
    const approval = await createApprovalInDb(ApprovalStatus.APPROVED);

    const csrfRes = await request(app.getHttpServer())
      .get('/api/v1/auth/csrf')
      .set('Cookie', sessionCookie);
    const freshCsrf = csrfRes.body.token;

    const res = await request(app.getHttpServer())
      .post(`/api/v1/approvals/${approval.id}/deny`)
      .set('Cookie', sessionCookie)
      .set('X-CSRF-Token', freshCsrf)
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.errorCode).toBe('APPROVAL_NOT_PENDING');

    await approvalRepo.delete({ id: approval.id });
  });

  // ── Test 5: POST /approve → 200 on PENDING row ───────────────────────────

  it('[D8] POST /approve on PENDING row → 200 + status=APPROVED', async () => {
    const approval = await createApprovalInDb(ApprovalStatus.PENDING);

    const csrfRes = await request(app.getHttpServer())
      .get('/api/v1/auth/csrf')
      .set('Cookie', sessionCookie);
    const freshCsrf = csrfRes.body.token;

    const res = await request(app.getHttpServer())
      .post(`/api/v1/approvals/${approval.id}/approve`)
      .set('Cookie', sessionCookie)
      .set('X-CSRF-Token', freshCsrf)
      .send({ parentNotes: 'Approved by parent' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe(ApprovalStatus.APPROVED);

    // GENUINE: verify the DB row was actually updated
    const updated = await approvalRepo.findOne({ where: { id: approval.id } });
    expect(updated?.status).toBe(ApprovalStatus.APPROVED);

    await approvalRepo.delete({ id: approval.id });
  });

  // ── Test 6: GET /approvals/:id → 403 when parent doesn't own ─────────────

  it('[D8] GET /approvals/:id → 403 when parent does not own the request', async () => {
    // Create another user's approval
    const otherUser = await userRepo.save(userRepo.create({
      email: `other-parent-${Date.now()}@test.com`,
      passwordHash: '$argon2id$placeholder',
      role: UserRole.PLAYER,
      status: UserStatus.ACTIVE,
      emailVerified: true,
    }));
    const otherApproval = await approvalRepo.save(
      approvalRepo.create({
        childProfileId,
        parentUserId: otherUser.id, // different parent
        paymentType: PaymentType.USD,
        status: ApprovalStatus.PENDING,
        autoApproved: false,
        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      }),
    );

    const res = await request(app.getHttpServer())
      .get(`/api/v1/approvals/${otherApproval.id}`)
      .set('Cookie', sessionCookie);

    expect(res.status).toBe(403);

    // Cleanup
    await approvalRepo.delete({ id: otherApproval.id });
    await userRepo.delete({ id: otherUser.id });
  });

  // ── Test 7: PATCH token-setting ───────────────────────────────────────────

  it('[D9] PATCH /players/me/children/:childId/token-setting toggles setting', async () => {
    // Create a child login for this child
    const loginHash = await passwordService.hash('ChildPass123!');
    await childLoginRepo.save(
      childLoginRepo.create({
        childProfileId,
        parentUserId: parentId,
        childUsername: `test-child-${Date.now()}`,
        passwordHash: loginHash,
        tokenSpendAllowed: false,
        isActive: true,
      }),
    );

    const csrfRes = await request(app.getHttpServer())
      .get('/api/v1/auth/csrf')
      .set('Cookie', sessionCookie);
    const freshCsrf = csrfRes.body.token;

    // Toggle ON
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/players/me/children/${childProfileId}/token-setting`)
      .set('Cookie', sessionCookie)
      .set('X-CSRF-Token', freshCsrf)
      .send({ allowTokenSpendWithoutApproval: true });

    expect(res.status).toBe(200);
    expect(res.body.allowTokenSpendWithoutApproval).toBe(true);

    // Verify DB was updated
    const updatedProfile = await playerProfileRepo.findOne({ where: { id: childProfileId } });
    expect(updatedProfile?.allowTokenSpendWithoutApproval).toBe(true);

    const updatedLogin = await childLoginRepo.findOne({ where: { childProfileId } });
    expect(updatedLogin?.tokenSpendAllowed).toBe(true);
  });
});
