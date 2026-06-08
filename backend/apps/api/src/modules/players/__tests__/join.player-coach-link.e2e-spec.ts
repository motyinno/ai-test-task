/**
 * M-4: Logged-in PLAYER must not be able to consume a coach UNIQUE link.
 *
 * Before M-4 fix: joinViaLink routes on link.type===UNIQUE with no principal check,
 * so a PLAYER (not a COACH) who holds a coach-invite link hits handleCoachAcceptance
 * and a CoachProfile gets created under that trainer for the player's user id.
 *
 * After M-4 fix: when a logged-in principal whose role≠COACH AND email≠link.targetEmail
 * attempts to accept a UNIQUE coach link, the service rejects with 403
 * INVITE_RECIPIENT_MISMATCH. No CoachProfile is created and the link is not consumed.
 *
 * NON-MASKING TEST: confirmed to return 201 (and create CoachProfile) before the
 * M-4 fix; after fix, returns 403.
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
import { CoachProfile } from '../../users/entities/coach-profile.entity';
import { ShareLink, ShareLinkType } from '../../sharelinks/entities/share-link.entity';
import { PasswordService } from '../../../shared/crypto/password.service';
import { generateShareLinkCode } from '../../sharelinks/share-link-code.util';

describe('M-4: logged-in PLAYER cannot consume a coach UNIQUE link', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;
  let trainerProfileRepo: Repository<TrainerProfile>;
  let playerProfileRepo: Repository<PlayerProfile>;
  let coachProfileRepo: Repository<CoachProfile>;
  let shareLinkRepo: Repository<ShareLink>;
  let passwordService: PasswordService;

  const PASSWORD = 'Password123!';
  const TRAINER_EMAIL = 'trainer-m4@test.com';
  const PLAYER_EMAIL = 'player-m4@test.com';
  const COACH_TARGET_EMAIL = 'intended-coach-m4@test.com';

  let trainerId: string;
  let playerId: string;
  let uniqueLinkCode: string;
  let uniqueLinkId: string;
  let playerCookie: string;
  let playerCsrf: string;

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
    coachProfileRepo = moduleFixture.get(getRepositoryToken(CoachProfile));
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
      businessName: 'M4 Gym',
      trainerName: 'M4 Trainer',
    }));

    // Seed a PLAYER user
    const player = await userRepo.save(userRepo.create({
      email: PLAYER_EMAIL,
      passwordHash: hash,
      role: UserRole.PLAYER,
      status: UserStatus.ACTIVE,
    }));
    playerId = player.id;
    await playerProfileRepo.save(playerProfileRepo.create({
      userId: player.id,
      name: 'Player M4',
    }));

    // Seed a UNIQUE (coach invite) link targeting a DIFFERENT email (not the player's)
    uniqueLinkCode = generateShareLinkCode();
    const link = await shareLinkRepo.save(shareLinkRepo.create({
      code: uniqueLinkCode,
      type: ShareLinkType.UNIQUE,
      trainerId,
      createdBy: trainerId,
      targetEmail: COACH_TARGET_EMAIL, // intended for a coach, NOT for PLAYER_EMAIL
      maxUses: 1,
      useCount: 0,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    }));
    uniqueLinkId = link.id;

    // Login as PLAYER
    playerCookie = await loginAs(PLAYER_EMAIL);
    playerCsrf = await getCsrfToken(playerCookie);
  });

  afterAll(async () => {
    await cleanDb();
    await app.close();
  });

  async function cleanDb() {
    await coachProfileRepo.query('DELETE FROM coach_profiles').catch(() => {});
    await shareLinkRepo.query('DELETE FROM share_links').catch(() => {});
    await playerProfileRepo.query('DELETE FROM player_profiles').catch(() => {});
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

  /**
   * SECURITY-CRITICAL (M-4): A logged-in PLAYER whose email != link.targetEmail
   * must be rejected when trying to accept a UNIQUE coach invite link.
   *
   * Failing-first confirmation: before M-4 fix, this returned 201 and created
   * a CoachProfile under trainer for the PLAYER's user id.
   * After fix: returns 403 INVITE_RECIPIENT_MISMATCH.
   */
  it('logged-in PLAYER hitting coach UNIQUE link → 403 INVITE_RECIPIENT_MISMATCH', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/join/${uniqueLinkCode}`)
      .set('Cookie', playerCookie)
      .set('X-CSRF-Token', playerCsrf)
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('INVITE_RECIPIENT_MISMATCH');
  });

  it('no CoachProfile created for the PLAYER after rejected join', async () => {
    const coachProfile = await coachProfileRepo.findOne({ where: { userId: playerId } });
    expect(coachProfile).toBeNull(); // no CoachProfile should have been created
  });

  it('coach link is NOT consumed (useCount still 0) after rejected PLAYER join', async () => {
    const link = await shareLinkRepo.findOne({ where: { id: uniqueLinkId } });
    expect(link!.useCount).toBe(0); // link should not have been consumed
    expect(link!.active).toBe(true); // still active
  });
});
