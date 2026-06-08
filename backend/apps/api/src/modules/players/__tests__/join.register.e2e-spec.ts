/**
 * C7: POST /join/:code — anonymous player registration via static share link.
 *
 * Tests:
 *   - New registration: creates User (PLAYER, argon2 hash), PlayerProfile,
 *     TrainerPlayerAssociation; establishes session.
 *   - Duplicate email → 409 EMAIL_EXISTS.
 *   - Atomic transaction: simulating failure (bad code) leaves no orphan User.
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
import { ShareLink, ShareLinkType } from '../../sharelinks/entities/share-link.entity';
import { TrainerPlayerAssociation } from '../entities/trainer-player-association.entity';
import { PasswordService } from '../../../shared/crypto/password.service';
import { generateShareLinkCode } from '../../sharelinks/share-link-code.util';

describe('C7: POST /join/:code — new player registration', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;
  let trainerProfileRepo: Repository<TrainerProfile>;
  let playerProfileRepo: Repository<PlayerProfile>;
  let shareLinkRepo: Repository<ShareLink>;
  let assocRepo: Repository<TrainerPlayerAssociation>;
  let passwordService: PasswordService;

  const TRAINER_PASSWORD = 'TrainerPass123!';
  const TRAINER_EMAIL = 'trainer-c7@test.com';
  let trainerId: string;
  let staticLinkCode: string;
  let staticLinkId: string;

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
    assocRepo = moduleFixture.get(getRepositoryToken(TrainerPlayerAssociation));
    passwordService = moduleFixture.get(PasswordService);

    await cleanDb();

    const hash = await passwordService.hash(TRAINER_PASSWORD);
    const trainer = await userRepo.save(userRepo.create({
      email: TRAINER_EMAIL,
      passwordHash: hash,
      role: UserRole.TRAINER,
      status: UserStatus.ACTIVE,
    }));
    trainerId = trainer.id;
    await trainerProfileRepo.save(trainerProfileRepo.create({
      userId: trainer.id,
      businessName: 'C7 Gym',
      trainerName: 'Coach C7',
    }));

    // Seed a static share link
    staticLinkCode = generateShareLinkCode();
    const link = await shareLinkRepo.save(shareLinkRepo.create({
      code: staticLinkCode,
      type: ShareLinkType.STATIC,
      trainerId,
      createdBy: trainerId,
    }));
    staticLinkId = link.id;
  });

  afterAll(async () => {
    await cleanDb();
    await app.close();
  });

  async function cleanDb() {
    await assocRepo.query('DELETE FROM trainer_player_associations').catch(() => {});
    await shareLinkRepo.query('DELETE FROM share_links').catch(() => {});
    await userRepo.query('DELETE FROM player_profiles').catch(() => {});
    await userRepo.query('DELETE FROM trainer_profiles').catch(() => {});
    await userRepo.query('DELETE FROM sessions').catch(() => {});
    await userRepo.query('DELETE FROM users').catch(() => {});
  }

  it('POST /join/:code creates User + PlayerProfile + association, returns 201', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/join/${staticLinkCode}`)
      .send({
        email: 'newplayer-c7@test.com',
        password: 'PlayerPass123!',
        playerName: 'Player C7',
        age: 16,
        gender: 'MALE',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.userId).toBeDefined();

    // Verify User created with PLAYER role
    const user = await userRepo.findOne({ where: { email: 'newplayer-c7@test.com' } });
    expect(user).not.toBeNull();
    expect(user!.role).toBe(UserRole.PLAYER);
    expect(user!.status).toBe(UserStatus.ACTIVE);
    // Password must be hashed (argon2)
    expect(user!.passwordHash).not.toBe('PlayerPass123!');
    const valid = await passwordService.verify(user!.passwordHash, 'PlayerPass123!');
    expect(valid).toBe(true);

    // Verify PlayerProfile created
    const profile = await playerProfileRepo.findOne({ where: { userId: user!.id } });
    expect(profile).not.toBeNull();
    expect(profile!.name).toBe('Player C7');
    expect(profile!.age).toBe(16);
    expect(profile!.gender).toBe('MALE');

    // Verify TrainerPlayerAssociation created
    const assoc = await assocRepo.findOne({
      where: { trainerId, playerProfileId: profile!.id },
    });
    expect(assoc).not.toBeNull();
    expect(assoc!.viaShareLinkId).toBe(staticLinkId);
  });

  it('session is established after registration (set-cookie present)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/join/${staticLinkCode}`)
      .send({
        email: 'session-player-c7@test.com',
        password: 'PlayerPass123!',
        playerName: 'Session Player C7',
      });

    expect(res.status).toBe(201);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    // Session cookie should be present (connect.sid)
    const cookieStr = Array.isArray(cookies) ? cookies.join(';') : (cookies || '');
    expect(cookieStr).toContain('connect.sid');
  });

  it('duplicate email → 409 EMAIL_EXISTS', async () => {
    // First registration
    await request(app.getHttpServer())
      .post(`/api/v1/join/${staticLinkCode}`)
      .send({
        email: 'dup-player-c7@test.com',
        password: 'PlayerPass123!',
        playerName: 'Dup Player',
      });

    // Second attempt with same email
    const res = await request(app.getHttpServer())
      .post(`/api/v1/join/${staticLinkCode}`)
      .send({
        email: 'dup-player-c7@test.com',
        password: 'PlayerPass123!',
        playerName: 'Dup Player 2',
      });

    expect(res.status).toBe(409);
    expect(res.body.errorCode).toBe('EMAIL_EXISTS');
  });

  it('invalid (nonexistent) code → 404 LINK_NOT_FOUND', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/join/totally-invalid-code')
      .send({
        email: 'nobody@test.com',
        password: 'Pass123!',
        playerName: 'Nobody',
      });

    expect(res.status).toBe(404);
    expect(res.body.errorCode).toBe('LINK_NOT_FOUND');

    // No orphan User created
    const user = await userRepo.findOne({ where: { email: 'nobody@test.com' } });
    expect(user).toBeNull();
  });
});
