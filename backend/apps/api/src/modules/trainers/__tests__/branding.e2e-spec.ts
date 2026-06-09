/**
 * G1: Branding API E2E Tests
 *
 * Tests:
 *   G1a: GET /trainers/me/branding — returns defaults if no branding set
 *   G1b: PUT /trainers/me/branding — upserts branding, validates hex format
 *   G1c: POST /trainers/me/branding/logo — uploads logo, rejects invalid type/size
 *   G1d: Tenant isolation — Trainer A cannot read/modify Trainer B's branding
 *
 * Sanity checks (verified to fail if guards are removed):
 *   - Hex format validation: "#ZZZZZZ" → 400 (validates DTO regex)
 *   - Logo type rejection: text/plain → 400 INVALID_FILE_TYPE
 *   - Logo size rejection: file > 2MB → 400 FILE_TOO_LARGE
 *   - Tenant isolation: Trainer B cannot affect Trainer A's branding row
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
import { PortalBranding } from '../entities/portal-branding.entity';
import { TrainerProfile } from '../../users/entities/trainer-profile.entity';

describe('G1: Branding API', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;
  let brandingRepo: Repository<PortalBranding>;
  let trainerProfileRepo: Repository<TrainerProfile>;
  let passwordService: PasswordService;

  const PASSWORD = 'Password123!';
  const TRAINER_A_EMAIL = 'trainer-a-branding@test.com';
  const TRAINER_B_EMAIL = 'trainer-b-branding@test.com';

  let trainerACookie: string;
  let trainerBCookie: string;
  let trainerAId: string;
  let trainerBId: string;
  let csrfToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await bootstrapApp(app);
    await app.init();

    userRepo = moduleFixture.get(getRepositoryToken(User));
    brandingRepo = moduleFixture.get(getRepositoryToken(PortalBranding));
    trainerProfileRepo = moduleFixture.get(getRepositoryToken(TrainerProfile));
    passwordService = moduleFixture.get(PasswordService);

    // Clean slate
    await brandingRepo.query('DELETE FROM portal_brandings').catch(() => {});
    await userRepo.delete({ email: TRAINER_A_EMAIL });
    await userRepo.delete({ email: TRAINER_B_EMAIL });

    const hash = await passwordService.hash(PASSWORD);

    // Seed Trainer A
    const trainerA = await userRepo.save(
      userRepo.create({
        email: TRAINER_A_EMAIL,
        passwordHash: hash,
        role: UserRole.TRAINER,
        status: UserStatus.ACTIVE,
        emailVerified: true,
      }),
    );
    trainerAId = trainerA.id;
    await trainerProfileRepo.save(
      trainerProfileRepo.create({
        userId: trainerA.id,
        businessName: 'Trainer A Academy',
        trainerName: 'Trainer A',
      }),
    );

    // Seed Trainer B
    const trainerB = await userRepo.save(
      userRepo.create({
        email: TRAINER_B_EMAIL,
        passwordHash: hash,
        role: UserRole.TRAINER,
        status: UserStatus.ACTIVE,
        emailVerified: true,
      }),
    );
    trainerBId = trainerB.id;
    await trainerProfileRepo.save(
      trainerProfileRepo.create({
        userId: trainerB.id,
        businessName: 'Trainer B Academy',
        trainerName: 'Trainer B',
      }),
    );

    // Login both trainers (login is CSRF-exempt)
    trainerACookie = await loginAs(TRAINER_A_EMAIL);
    csrfToken = await getCsrfToken(trainerACookie);

    trainerBCookie = await loginAs(TRAINER_B_EMAIL);
  });

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

  afterAll(async () => {
    await brandingRepo.query('DELETE FROM portal_brandings').catch(() => {});
    await userRepo.delete({ email: TRAINER_A_EMAIL });
    await userRepo.delete({ email: TRAINER_B_EMAIL });
    await app.close();
  });

  // ─── G1a: GET branding ────────────────────────────────────────────────────

  describe('GET /trainers/me/branding', () => {
    it('returns default branding when none has been set', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/trainers/me/branding')
        .set('Cookie', trainerACookie)
        .expect(200);

      expect(res.body.trainerId).toBe(trainerAId);
      expect(res.body.primaryColorHex).toBe('#2563EB');
      expect(res.body.logoUrl).toBeNull();
    });

    it('returns 401 when unauthenticated', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/trainers/me/branding')
        .expect(401);
    });
  });

  // ─── G1b: PUT branding ────────────────────────────────────────────────────

  describe('PUT /trainers/me/branding', () => {
    it('upserts branding with a valid hex colour', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/trainers/me/branding')
        .set('Cookie', trainerACookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ primaryColorHex: '#FF5A1F' })
        .expect(200);

      expect(res.body.trainerId).toBe(trainerAId);
      expect(res.body.primaryColorHex).toBe('#FF5A1F');
    });

    it('persists the updated branding (GET reflects PUT)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/trainers/me/branding')
        .set('Cookie', trainerACookie)
        .expect(200);

      expect(res.body.primaryColorHex).toBe('#FF5A1F');
    });

    it('400 on invalid hex format — sanity check DTO validation', async () => {
      // SANITY CHECK: If the DTO regex is removed, this test fails (returns 200 instead of 400)
      await request(app.getHttpServer())
        .put('/api/v1/trainers/me/branding')
        .set('Cookie', trainerACookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ primaryColorHex: '#ZZZZZZ' })
        .expect(400);
    });

    it('400 on short hex (3-digit shorthand not allowed)', async () => {
      await request(app.getHttpServer())
        .put('/api/v1/trainers/me/branding')
        .set('Cookie', trainerACookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ primaryColorHex: '#FFF' })
        .expect(400);
    });

    it('400 on hex without #', async () => {
      await request(app.getHttpServer())
        .put('/api/v1/trainers/me/branding')
        .set('Cookie', trainerACookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ primaryColorHex: 'FF5A1F' })
        .expect(400);
    });
  });

  // ─── G1c: Logo upload ─────────────────────────────────────────────────────

  describe('POST /trainers/me/branding/logo', () => {
    it('rejects non-image file types — sanity check type validation', async () => {
      // SANITY CHECK: removing the MIME check would cause this to return 200 instead of 400
      await request(app.getHttpServer())
        .post('/api/v1/trainers/me/branding/logo')
        .set('Cookie', trainerACookie)
        .set('X-CSRF-Token', csrfToken)
        .attach('logo', Buffer.from('not an image'), {
          filename: 'logo.txt',
          contentType: 'text/plain',
        })
        .expect(400)
        .then((res) => {
          expect(res.body.errorCode).toBe('INVALID_FILE_TYPE');
        });
    });

    it('rejects files over 2MB — sanity check size validation', async () => {
      // SANITY CHECK: removing the size check would cause this to return 200 instead of 400
      const bigFile = Buffer.alloc(2 * 1024 * 1024 + 1, 0); // 2MB + 1 byte
      await request(app.getHttpServer())
        .post('/api/v1/trainers/me/branding/logo')
        .set('Cookie', trainerACookie)
        .set('X-CSRF-Token', csrfToken)
        .attach('logo', bigFile, {
          filename: 'big.png',
          contentType: 'image/png',
        })
        .expect(400)
        .then((res) => {
          expect(res.body.errorCode).toBe('FILE_TOO_LARGE');
        });
    });

    it('accepts a valid PNG logo and returns logoUrl', async () => {
      const pngPixel = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64',
      );
      const res = await request(app.getHttpServer())
        .post('/api/v1/trainers/me/branding/logo')
        .set('Cookie', trainerACookie)
        .set('X-CSRF-Token', csrfToken)
        .attach('logo', pngPixel, { filename: 'logo.png', contentType: 'image/png' })
        .expect(200);

      expect(res.body.logoUrl).toBeDefined();
      expect(typeof res.body.logoUrl).toBe('string');
      expect(res.body.logoUrl.length).toBeGreaterThan(0);
    });

    it('GET branding reflects the uploaded logoUrl', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/trainers/me/branding')
        .set('Cookie', trainerACookie)
        .expect(200);

      expect(res.body.logoUrl).toBeDefined();
      expect(res.body.logoUrl).not.toBeNull();
    });
  });

  // ─── G1d: Tenant isolation — CRITICAL sanity check ────────────────────────

  describe('Tenant isolation', () => {
    it('Trainer B cannot read Trainer A branding row via GET — each gets own context', async () => {
      // Trainer A has branding set (#FF5A1F) from the PUT test above
      // Trainer B should get their own (default) branding, NOT Trainer A's
      const resB = await request(app.getHttpServer())
        .get('/api/v1/trainers/me/branding')
        .set('Cookie', trainerBCookie)
        .expect(200);

      expect(resB.body.trainerId).toBe(trainerBId);
      // Trainer B's branding is independent — should still be default colour
      // (Trainer A set #FF5A1F; Trainer B has NOT set anything yet)
      expect(resB.body.primaryColorHex).not.toBe('#FF5A1F');
    });

    it('Trainer B updating their branding does NOT affect Trainer A branding', async () => {
      // Get Trainer B's own CSRF token
      const csrfB = await getCsrfToken(trainerBCookie);
      // Trainer B sets a different colour
      await request(app.getHttpServer())
        .put('/api/v1/trainers/me/branding')
        .set('Cookie', trainerBCookie)
        .set('X-CSRF-Token', csrfB)
        .send({ primaryColorHex: '#123456' })
        .expect(200);

      // Trainer A branding unchanged — SANITY CHECK: proves tenant scope is enforced
      const resA = await request(app.getHttpServer())
        .get('/api/v1/trainers/me/branding')
        .set('Cookie', trainerACookie)
        .expect(200);

      expect(resA.body.trainerId).toBe(trainerAId);
      expect(resA.body.primaryColorHex).toBe('#FF5A1F');
    });
  });
});
