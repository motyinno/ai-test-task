/**
 * B7: ProfileModule E2E Tests
 *
 * Tests:
 *   - GET /me/profile — returns role-specific fields for trainer, coach, player
 *   - PATCH /me/profile — updates profile fields; email/role read-only
 *   - POST /me/profile/photo — uploads photo via StorageService port; returns photoUrl+thumbnailUrl
 *   - Auth: unauthenticated → 401
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
import { CoachProfile } from '../../users/entities/coach-profile.entity';
import { PlayerProfile } from '../../users/entities/player-profile.entity';
import { PasswordService } from '../../../shared/crypto/password.service';
import { StorageService } from '../../../shared/integrations/storage/storage.service';

describe('B7: ProfileModule E2E', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;
  let trainerProfileRepo: Repository<TrainerProfile>;
  let coachProfileRepo: Repository<CoachProfile>;
  let playerProfileRepo: Repository<PlayerProfile>;
  let passwordService: PasswordService;
  let storageService: StorageService;

  const PASSWORD = 'Password123!';

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

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await bootstrapApp(app);
    await app.init();

    userRepo = moduleFixture.get(getRepositoryToken(User));
    trainerProfileRepo = moduleFixture.get(getRepositoryToken(TrainerProfile));
    coachProfileRepo = moduleFixture.get(getRepositoryToken(CoachProfile));
    playerProfileRepo = moduleFixture.get(getRepositoryToken(PlayerProfile));
    passwordService = moduleFixture.get(PasswordService);
    storageService = moduleFixture.get(StorageService);

    await cleanDb();
  });

  afterAll(async () => {
    await cleanDb();
    await app.close();
  });

  async function cleanDb() {
    await userRepo.query('DELETE FROM player_profiles').catch(() => {});
    await userRepo.query('DELETE FROM coach_profiles').catch(() => {});
    await userRepo.query('DELETE FROM trainer_profiles').catch(() => {});
    await userRepo.query('DELETE FROM user_deletion_log').catch(() => {});
    await userRepo.query('DELETE FROM email_verification_tokens').catch(() => {});
    await userRepo.query('DELETE FROM password_reset_tokens').catch(() => {});
    await userRepo.query('DELETE FROM sessions').catch(() => {});
    await userRepo.query('DELETE FROM users').catch(() => {});
  }

  // ─── Auth guard ───────────────────────────────────────────────────────────

  it('unauthenticated GET /me/profile → 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/me/profile');
    expect(res.status).toBe(401);
  });

  it('unauthenticated PATCH /me/profile → 401 or 403 (CSRF or auth)', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/v1/me/profile')
      .send({ bio: 'test' });
    // CSRF middleware catches unsafe methods before SessionAuthGuard runs → 403 CSRF_INVALID
    // or SessionAuthGuard catches it → 401. Both are acceptable access-denial responses.
    expect([401, 403]).toContain(res.status);
  });

  // ─── Trainer profile ──────────────────────────────────────────────────────

  describe('Trainer profile', () => {
    let trainerCookie: string;
    let csrfToken: string;
    let trainerId: string;

    beforeAll(async () => {
      const hash = await passwordService.hash(PASSWORD);
      const trainer = await userRepo.save(
        userRepo.create({
          email: 'trainer-profile-b7@test.com',
          passwordHash: hash,
          role: UserRole.TRAINER,
          status: UserStatus.ACTIVE,
        }),
      );
      trainerId = trainer.id;

      await trainerProfileRepo.save(
        trainerProfileRepo.create({
          userId: trainer.id,
          businessName: 'Elite Academy',
          trainerName: 'Coach Bob',
          phone: '+12025551234',
        }),
      );

      trainerCookie = await loginAs('trainer-profile-b7@test.com');
      csrfToken = await getCsrfToken(trainerCookie);
    });

    it('GET /me/profile returns trainer-specific fields', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/me/profile')
        .set('Cookie', trainerCookie);

      expect(res.status).toBe(200);
      expect(res.body.role).toBe(UserRole.TRAINER);
      expect(res.body.email).toBe('trainer-profile-b7@test.com');
      expect(res.body.businessName).toBe('Elite Academy');
      expect(res.body.trainerName).toBe('Coach Bob');
      expect(res.body.phone).toBe('+12025551234');
    });

    it('email is read-only in PATCH (whitelist strips it)', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/me/profile')
        .set('Cookie', trainerCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ email: 'hacker@evil.com', firstName: 'UpdatedName' });

      expect(res.status).toBe(200);
      // email must NOT change
      expect(res.body.email).toBe('trainer-profile-b7@test.com');
    });

    it('PATCH /me/profile updates trainerName via firstName field', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/me/profile')
        .set('Cookie', trainerCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ firstName: 'Coach Updated' });

      expect(res.status).toBe(200);
      expect(res.body.trainerName).toBe('Coach Updated');
    });
  });

  // ─── Coach profile ────────────────────────────────────────────────────────

  describe('Coach profile', () => {
    let coachCookie: string;
    let csrfToken: string;

    beforeAll(async () => {
      const hash = await passwordService.hash(PASSWORD);
      const trainerUser = await userRepo.save(
        userRepo.create({
          email: 'trainer-for-coach-profile@test.com',
          passwordHash: hash,
          role: UserRole.TRAINER,
          status: UserStatus.ACTIVE,
        }),
      );
      const coach = await userRepo.save(
        userRepo.create({
          email: 'coach-profile-b7@test.com',
          passwordHash: hash,
          role: UserRole.COACH,
          status: UserStatus.ACTIVE,
        }),
      );

      await coachProfileRepo.save(
        coachProfileRepo.create({
          userId: coach.id,
          trainerId: trainerUser.id,
          bio: 'Experienced soccer coach',
          publicProfile: false,
        }),
      );

      coachCookie = await loginAs('coach-profile-b7@test.com');
      csrfToken = await getCsrfToken(coachCookie);
    });

    it('GET /me/profile returns coach-specific fields', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/me/profile')
        .set('Cookie', coachCookie);

      expect(res.status).toBe(200);
      expect(res.body.role).toBe(UserRole.COACH);
      expect(res.body.bio).toBe('Experienced soccer coach');
      expect(res.body.publicProfile).toBe(false);
      expect(res.body.trainerId).toBeDefined();
    });

    it('PATCH /me/profile updates bio and publicProfile', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/me/profile')
        .set('Cookie', coachCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ bio: 'Updated bio', publicProfile: true });

      expect(res.status).toBe(200);
      expect(res.body.bio).toBe('Updated bio');
      expect(res.body.publicProfile).toBe(true);
    });
  });

  // ─── Player profile ───────────────────────────────────────────────────────

  describe('Player profile', () => {
    let playerCookie: string;
    let csrfToken: string;

    beforeAll(async () => {
      const hash = await passwordService.hash(PASSWORD);
      const player = await userRepo.save(
        userRepo.create({
          email: 'player-profile-b7@test.com',
          passwordHash: hash,
          role: UserRole.PLAYER,
          status: UserStatus.ACTIVE,
        }),
      );

      await playerProfileRepo.save(
        playerProfileRepo.create({
          userId: player.id,
          name: 'Alex Player',
          dateOfBirth: '2010-01-01', // derived age ~16 (Q-01.02)
          gender: 'MALE',
          school: 'Lincoln High',
        }),
      );

      playerCookie = await loginAs('player-profile-b7@test.com');
      csrfToken = await getCsrfToken(playerCookie);
    });

    it('GET /me/profile returns player-specific fields', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/me/profile')
        .set('Cookie', playerCookie);

      expect(res.status).toBe(200);
      expect(res.body.role).toBe(UserRole.PLAYER);
      expect(res.body.name).toBe('Alex Player');
      expect(res.body.dateOfBirth).toBe('2010-01-01');
      expect(res.body.age).toBe(16); // derived from dateOfBirth
      expect(res.body.gender).toBe('MALE');
      expect(res.body.school).toBe('Lincoln High');
    });

    it('PATCH /me/profile updates school and jerseyNumber', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/me/profile')
        .set('Cookie', playerCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ school: 'Jefferson Academy', jerseyNumber: '10' });

      expect(res.status).toBe(200);
      expect(res.body.school).toBe('Jefferson Academy');
      expect(res.body.jerseyNumber).toBe('10');
    });
  });

  // ─── Photo upload ─────────────────────────────────────────────────────────

  describe('POST /me/profile/photo — photo upload via StorageService', () => {
    let trainerCookie: string;
    let csrfToken: string;

    beforeAll(async () => {
      const hash = await passwordService.hash(PASSWORD);
      const trainer = await userRepo.save(
        userRepo.create({
          email: 'photo-upload-b7@test.com',
          passwordHash: hash,
          role: UserRole.TRAINER,
          status: UserStatus.ACTIVE,
        }),
      );
      await trainerProfileRepo.save(
        trainerProfileRepo.create({
          userId: trainer.id,
          businessName: 'Photo Biz',
          trainerName: 'Photo Coach',
        }),
      );
      trainerCookie = await loginAs('photo-upload-b7@test.com');
      csrfToken = await getCsrfToken(trainerCookie);
    });

    it('POST /me/profile/photo with PNG returns photoUrl + thumbnailUrl', async () => {
      storageService.storedFiles.length = 0;

      // Create a minimal valid 1x1 PNG buffer
      const pngBuffer = Buffer.from(
        '89504e470d0a1a0a0000000d49484452000000010000000108020000009001' +
        '2e0000000c4944415408d7636060600000000400015a28b4' +
        '00000000049454e44ae426082',
        'hex',
      );

      const res = await request(app.getHttpServer())
        .post('/api/v1/me/profile/photo')
        .set('Cookie', trainerCookie)
        .set('X-CSRF-Token', csrfToken)
        .attach('photo', pngBuffer, { filename: 'avatar.png', contentType: 'image/png' });

      expect(res.status).toBe(200);
      expect(res.body.photoUrl).toBeDefined();
      expect(typeof res.body.photoUrl).toBe('string');
      // StorageService.put with an image returns thumbnailUrl
      expect(res.body.thumbnailUrl).toBeDefined();
    });

    it('POST /me/profile/photo without file → 400 FILE_REQUIRED', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/me/profile/photo')
        .set('Cookie', trainerCookie)
        .set('X-CSRF-Token', csrfToken);

      expect(res.status).toBe(400);
    });

    it('POST /me/profile/photo with invalid MIME type → 400 INVALID_FILE_TYPE', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/me/profile/photo')
        .set('Cookie', trainerCookie)
        .set('X-CSRF-Token', csrfToken)
        .attach('photo', Buffer.from('not-an-image'), {
          filename: 'test.txt',
          contentType: 'text/plain',
        });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('INVALID_FILE_TYPE');
    });

    it('photo upload stores via StorageService port (dev adapter)', async () => {
      storageService.storedFiles.length = 0;

      const pngBuffer = Buffer.from(
        '89504e470d0a1a0a0000000d4948445200000001000000010802000000' +
        '9001' + '2e0000000c4944415408d7636060600000000400015a28b4' +
        '00000000049454e44ae426082',
        'hex',
      );

      await request(app.getHttpServer())
        .post('/api/v1/me/profile/photo')
        .set('Cookie', trainerCookie)
        .set('X-CSRF-Token', csrfToken)
        .attach('photo', pngBuffer, { filename: 'avatar2.png', contentType: 'image/png' });

      // StorageService dev adapter records the upload
      expect(storageService.storedFiles.length).toBeGreaterThanOrEqual(1);
      const stored = storageService.storedFiles[storageService.storedFiles.length - 1];
      expect(stored.file.mimeType).toBe('image/png');
    });
  });
});
