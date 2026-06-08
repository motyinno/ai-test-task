/**
 * Phase A Smoke E2E Test (A19 — C6 mandatory exit gate)
 *
 * Proves:
 * 1. SEC-007 Tenancy isolation — genuine end-to-end proof:
 *    - Trainer1 logs in and sets their trainerId in the session.
 *    - GET /test-foundation/tenant-items returns ONLY trainer1's rows.
 *    - Trainer2 independently sees ONLY their own rows.
 *    - Neither trainer sees the other's rows.
 *
 * 2. CASL child constraint (FR-026, SEC-009):
 *    - A child principal (isChild=true) hitting @CheckAbility('add','Trainer') → 403 CHILD_FORBIDDEN.
 *    - A regular player (isChild=false) hitting the same route → 200.
 *    - A non-child trainer hitting payment/token/account-delete routes → 200.
 *    - A child principal hitting those routes → 403.
 *
 * 3. Session + roles:
 *    - SUPER_ADMIN can access @Roles('SUPER_ADMIN') route.
 *    - TRAINER cannot access @Roles('SUPER_ADMIN') route → 403.
 *
 * SANITY CHECK (prove tests genuinely fail when protection breaks):
 *   The tenancy filter test has been verified to go RED when
 *   TenantAwareRepository.scopedFind() has the trainerId filter removed
 *   (both trainers see all items). The child-403 test goes RED when
 *   AbilityGuard returns `true` unconditionally.
 */
import {
  Test,
  TestingModule,
} from '@nestjs/testing';
import {
  INestApplication,
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Req,
  HttpCode,
} from '@nestjs/common';
import { InjectRepository, TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../app/app.module';
import { bootstrapApp } from '../shared/bootstrap/bootstrap';
import { User, UserRole, UserStatus } from '../modules/users/entities/user.entity';
import { PasswordService } from '../shared/crypto/password.service';
import { Roles } from '../shared/authz/roles.decorator';
import { CheckAbility } from '../shared/authz/check-ability.decorator';
import { AbilityGuard } from '../shared/authz/ability.guard';
import { TenantContextService } from '../shared/tenancy/tenant-context.service';
import { TenantAwareRepository } from '../shared/tenancy/tenant-aware.repository';
import { TestTenantItem } from '../modules/users/entities/test-tenant-item.entity';
import { SessionContextService } from '../modules/auth/session-context.service';
import type { Request as ExpressRequest } from 'express';

// ─── Test-only repository ─────────────────────────────────────────────────────

class TestTenantItemRepository extends TenantAwareRepository<TestTenantItem> {
  constructor(
    @InjectRepository(TestTenantItem) repo: Repository<TestTenantItem>,
    tenantCtx: TenantContextService,
  ) {
    super(repo, tenantCtx);
  }

  async findAllScoped(): Promise<TestTenantItem[]> {
    return this.scopedFind({});
  }
}

// ─── Test-only controller ─────────────────────────────────────────────────────

@Controller('test-foundation')
class FoundationTestController {
  constructor(
    private readonly itemRepo: TestTenantItemRepository,
    private readonly sessionCtxSvc: SessionContextService,
  ) {}

  /**
   * Returns all tenant-scoped items for the active trainer.
   * Requires trainerId to be set in session.principal.trainerId.
   */
  @Get('tenant-items')
  async getItems(): Promise<TestTenantItem[]> {
    return this.itemRepo.findAllScoped();
  }

  /**
   * Test helper: sets the trainerId on the session principal so that
   * TenantMiddleware populates the CLS context on subsequent requests.
   * This simulates what the "select org context" flow would do in production.
   */
  @Post('set-trainer-context')
  @HttpCode(200)
  setTrainerContext(
    @Req() req: ExpressRequest,
    @Body() body: { trainerId: string },
  ): { ok: boolean } {
    const session = req.session as unknown as Record<string, unknown>;
    const principal = session['principal'] as Record<string, unknown> | undefined;
    if (principal) {
      principal['trainerId'] = body.trainerId;
    }
    return { ok: true };
  }

  /**
   * Test helper: sets isChild=true on the session principal to simulate
   * a child sub-login. This simulates the child login flow.
   */
  @Post('set-child-context')
  @HttpCode(200)
  setChildContext(
    @Req() req: ExpressRequest,
    @Body() body: { isChild: boolean; parentUserId?: string },
  ): { ok: boolean } {
    const session = req.session as unknown as Record<string, unknown>;
    const principal = session['principal'] as Record<string, unknown> | undefined;
    if (principal) {
      principal['isChild'] = body.isChild;
      if (body.parentUserId) {
        principal['parentUserId'] = body.parentUserId;
      }
    }
    return { ok: true };
  }

  /**
   * Requires CASL @CheckAbility('add', 'Trainer').
   * Child principals (isChild=true) cannot call this → 403 CHILD_FORBIDDEN.
   * Non-child → 200.
   */
  @UseGuards(AbilityGuard)
  @CheckAbility('add', 'Trainer')
  @Get('add-trainer')
  addTrainer(): { ok: boolean } {
    return { ok: true };
  }

  /**
   * Requires CASL @CheckAbility('manage', 'Payment').
   * Child principals cannot call this → 403 CHILD_FORBIDDEN.
   */
  @UseGuards(AbilityGuard)
  @CheckAbility('manage', 'Payment')
  @Get('manage-payment')
  managePayment(): { ok: boolean } {
    return { ok: true };
  }

  /**
   * Requires CASL @CheckAbility('purchase', 'Token').
   */
  @UseGuards(AbilityGuard)
  @CheckAbility('purchase', 'Token')
  @Get('purchase-token')
  purchaseToken(): { ok: boolean } {
    return { ok: true };
  }

  /**
   * Requires CASL @CheckAbility('delete', 'Account').
   */
  @UseGuards(AbilityGuard)
  @CheckAbility('delete', 'Account')
  @Get('delete-account')
  deleteAccount(): { ok: boolean } {
    return { ok: true };
  }

  /**
   * SUPER_ADMIN-only route.
   */
  @Roles('SUPER_ADMIN')
  @Get('sa-only')
  saOnly(): { ok: boolean } {
    return { ok: true };
  }
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('Foundation Smoke E2E (Phase A Gate — C6)', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;
  let itemRepo: Repository<TestTenantItem>;
  let passwordService: PasswordService;

  const PASSWORD = 'Password123!';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule, TypeOrmModule.forFeature([TestTenantItem])],
      controllers: [FoundationTestController],
      providers: [TestTenantItemRepository, SessionContextService],
    }).compile();

    app = moduleFixture.createNestApplication();
    await bootstrapApp(app);
    await app.init();

    userRepo = moduleFixture.get(getRepositoryToken(User));
    itemRepo = moduleFixture.get(getRepositoryToken(TestTenantItem));
    passwordService = moduleFixture.get(PasswordService);

    // Clean state
    await itemRepo.query('DELETE FROM test_tenant_items').catch(() => {});
    await userRepo.query('DELETE FROM email_verification_tokens');
    await userRepo.query('DELETE FROM password_reset_tokens');
    await userRepo.query('DELETE FROM sessions').catch(() => {});
    await userRepo.query('DELETE FROM users');
  });

  afterAll(async () => {
    await itemRepo.query('DELETE FROM test_tenant_items').catch(() => {});
    await userRepo.query('DELETE FROM email_verification_tokens');
    await userRepo.query('DELETE FROM password_reset_tokens');
    await userRepo.query('DELETE FROM sessions').catch(() => {});
    await userRepo.query('DELETE FROM users');
    await app.close();
  });

  // ─── Helpers ───────────────────────────────────────────────────────────────

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

  async function setTrainerContext(cookie: string, trainerId: string): Promise<void> {
    const csrfRes = await request(app.getHttpServer())
      .get('/api/v1/auth/csrf')
      .set('Cookie', cookie);
    const csrfToken = csrfRes.body.token;

    const res = await request(app.getHttpServer())
      .post('/api/v1/test-foundation/set-trainer-context')
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrfToken)
      .send({ trainerId });
    expect(res.status).toBe(200);
  }

  async function setChildContext(
    cookie: string,
    isChild: boolean,
    parentUserId?: string,
  ): Promise<void> {
    const csrfRes = await request(app.getHttpServer())
      .get('/api/v1/auth/csrf')
      .set('Cookie', cookie);
    const csrfToken = csrfRes.body.token;

    const res = await request(app.getHttpServer())
      .post('/api/v1/test-foundation/set-child-context')
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrfToken)
      .send({ isChild, parentUserId });
    expect(res.status).toBe(200);
  }

  // ─── SEC-007: Tenancy isolation (C6 core proof) ────────────────────────────

  describe('SEC-007: Tenant isolation — structural filter at data layer', () => {
    let trainer1: User;
    let trainer2: User;
    let trainer1Cookie: string;
    let trainer2Cookie: string;

    beforeAll(async () => {
      const hash = await passwordService.hash(PASSWORD);

      trainer1 = await userRepo.save(
        userRepo.create({
          email: 'trainer1@foundation-c6.com',
          passwordHash: hash,
          role: UserRole.TRAINER,
          status: UserStatus.ACTIVE,
        }),
      );

      trainer2 = await userRepo.save(
        userRepo.create({
          email: 'trainer2@foundation-c6.com',
          passwordHash: hash,
          role: UserRole.TRAINER,
          status: UserStatus.ACTIVE,
        }),
      );

      // Seed items: 2 for trainer1, 1 for trainer2
      await itemRepo.save([
        itemRepo.create({ trainerId: trainer1.id, name: 'T1-Item-A' }),
        itemRepo.create({ trainerId: trainer1.id, name: 'T1-Item-B' }),
        itemRepo.create({ trainerId: trainer2.id, name: 'T2-Item-X' }),
      ]);

      trainer1Cookie = await loginAs('trainer1@foundation-c6.com');
      trainer2Cookie = await loginAs('trainer2@foundation-c6.com');

      // Set trainer context in session (simulates org selection flow)
      await setTrainerContext(trainer1Cookie, trainer1.id);
      await setTrainerContext(trainer2Cookie, trainer2.id);
    });

    it('trainer1 sees ONLY their 2 items — not trainer2 items', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/test-foundation/tenant-items')
        .set('Cookie', trainer1Cookie);

      expect(res.status).toBe(200);
      const items: TestTenantItem[] = res.body;
      expect(items).toHaveLength(2);
      const names = items.map((i) => i.name);
      expect(names).toContain('T1-Item-A');
      expect(names).toContain('T1-Item-B');
      // Must NOT contain trainer2's item
      expect(names).not.toContain('T2-Item-X');
    });

    it('trainer2 sees ONLY their 1 item — not trainer1 items', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/test-foundation/tenant-items')
        .set('Cookie', trainer2Cookie);

      expect(res.status).toBe(200);
      const items: TestTenantItem[] = res.body;
      expect(items).toHaveLength(1);
      expect(items[0].name).toBe('T2-Item-X');
      // Must NOT contain trainer1's items
      const names = items.map((i) => i.name);
      expect(names).not.toContain('T1-Item-A');
      expect(names).not.toContain('T1-Item-B');
    });

    it('unauthenticated request to tenant-scoped endpoint → 500 (no context)', async () => {
      // No session cookie → TenantMiddleware sets no context → scopedFind throws
      // TenantContextMissingError which is caught by AllExceptionsFilter → 500
      const res = await request(app.getHttpServer())
        .get('/api/v1/test-foundation/tenant-items');
      // Either 500 (TenantContextMissingError) or 401 (if auth guard catches first)
      expect([401, 500]).toContain(res.status);
    });
  });

  // ─── FR-026/SEC-009: Child principal constraints (C6 authz proof) ──────────

  describe('FR-026/SEC-009: Child principal cannot perform restricted actions', () => {
    let player: User;
    let playerCookie: string;
    let childCookie: string;

    beforeAll(async () => {
      const hash = await passwordService.hash(PASSWORD);

      player = await userRepo.save(
        userRepo.create({
          email: 'player@foundation-c6.com',
          passwordHash: hash,
          role: UserRole.PLAYER,
          status: UserStatus.ACTIVE,
        }),
      );

      // Login as player (non-child) and as child
      playerCookie = await loginAs('player@foundation-c6.com');

      // Reuse player account for child simulation — create a separate session
      childCookie = await loginAs('player@foundation-c6.com');

      // Mark child session as isChild=true
      await setChildContext(childCookie, true, player.id);
    });

    it('non-child player can call @CheckAbility("add","Trainer") → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/test-foundation/add-trainer')
        .set('Cookie', playerCookie);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('child principal hitting @CheckAbility("add","Trainer") → 403 CHILD_FORBIDDEN', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/test-foundation/add-trainer')
        .set('Cookie', childCookie);
      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('CHILD_FORBIDDEN');
    });

    it('child principal hitting @CheckAbility("manage","Payment") → 403 CHILD_FORBIDDEN', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/test-foundation/manage-payment')
        .set('Cookie', childCookie);
      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('CHILD_FORBIDDEN');
    });

    it('child principal hitting @CheckAbility("purchase","Token") → 403 CHILD_FORBIDDEN', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/test-foundation/purchase-token')
        .set('Cookie', childCookie);
      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('CHILD_FORBIDDEN');
    });

    it('child principal hitting @CheckAbility("delete","Account") → 403 CHILD_FORBIDDEN', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/test-foundation/delete-account')
        .set('Cookie', childCookie);
      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('CHILD_FORBIDDEN');
    });

    it('non-child player can call all restricted actions → 200', async () => {
      const routes = [
        '/api/v1/test-foundation/add-trainer',
        '/api/v1/test-foundation/manage-payment',
        '/api/v1/test-foundation/purchase-token',
        '/api/v1/test-foundation/delete-account',
      ];
      for (const route of routes) {
        const res = await request(app.getHttpServer())
          .get(route)
          .set('Cookie', playerCookie);
        expect(res.status).toBe(200);
      }
    });
  });

  // ─── Roles guard: SA-only route ────────────────────────────────────────────

  describe('Roles guard: SUPER_ADMIN-only route access', () => {
    let saCookie: string;
    let trainerCookie: string;

    beforeAll(async () => {
      const hash = await passwordService.hash(PASSWORD);

      await userRepo.save(
        userRepo.create({
          email: 'sa@foundation-c6.com',
          passwordHash: hash,
          role: UserRole.SUPER_ADMIN,
          status: UserStatus.ACTIVE,
        }),
      );

      await userRepo.save(
        userRepo.create({
          email: 'trainer-roles@foundation-c6.com',
          passwordHash: hash,
          role: UserRole.TRAINER,
          status: UserStatus.ACTIVE,
        }),
      );

      saCookie = await loginAs('sa@foundation-c6.com');
      trainerCookie = await loginAs('trainer-roles@foundation-c6.com');
    });

    it('SUPER_ADMIN can access @Roles("SUPER_ADMIN") route → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/test-foundation/sa-only')
        .set('Cookie', saCookie);
      expect(res.status).toBe(200);
    });

    it('TRAINER cannot access @Roles("SUPER_ADMIN") route → 403', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/test-foundation/sa-only')
        .set('Cookie', trainerCookie);
      expect(res.status).toBe(403);
    });

    it('unauthenticated request to @Roles route → 401', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/test-foundation/sa-only');
      expect(res.status).toBe(401);
    });
  });

  // ─── Health smoke ──────────────────────────────────────────────────────────

  it('GET /api/v1/health → 200 ok (Phase A infra up)', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
