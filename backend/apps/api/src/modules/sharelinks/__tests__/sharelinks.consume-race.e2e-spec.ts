/**
 * C9: Edge E — atomic single-use consume for UNIQUE links.
 *
 * Security-critical: exactly one of two concurrent joins on a UNIQUE link wins.
 *
 * Sanity-check: dropping the `use_count < max_uses` predicate from the conditional
 * UPDATE causes both concurrent requests to see `affected=1` → both succeed →
 * test asserting "exactly one 201" goes RED.
 *
 * Tests:
 *   - Two concurrent POST /join/:code on same UNIQUE link → exactly one 201, other 410 LINK_USED
 *   - useCount===1 after the successful consume
 *   - STATIC link: useCount increments (analytics) but never blocks concurrent joins
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
import { ShareLink, ShareLinkType } from '../entities/share-link.entity';
import { TrainerPlayerAssociation } from '../../players/entities/trainer-player-association.entity';
import { CoachProfile } from '../../users/entities/coach-profile.entity';
import { PasswordService } from '../../../shared/crypto/password.service';
import { generateShareLinkCode } from '../share-link-code.util';

describe('C9: atomic single-use consume for unique links (edge E)', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;
  let trainerProfileRepo: Repository<TrainerProfile>;
  let shareLinkRepo: Repository<ShareLink>;
  let assocRepo: Repository<TrainerPlayerAssociation>;
  let coachProfileRepo: Repository<CoachProfile>;
  let passwordService: PasswordService;

  const TRAINER_EMAIL = 'trainer-c9@test.com';
  let trainerId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await bootstrapApp(app);
    await app.init();

    userRepo = moduleFixture.get(getRepositoryToken(User));
    trainerProfileRepo = moduleFixture.get(getRepositoryToken(TrainerProfile));
    shareLinkRepo = moduleFixture.get(getRepositoryToken(ShareLink));
    assocRepo = moduleFixture.get(getRepositoryToken(TrainerPlayerAssociation));
    coachProfileRepo = moduleFixture.get(getRepositoryToken(CoachProfile));
    passwordService = moduleFixture.get(PasswordService);

    await cleanDb();

    const hash = await passwordService.hash('TrainerPass123!');
    const trainer = await userRepo.save(userRepo.create({
      email: TRAINER_EMAIL,
      passwordHash: hash,
      role: UserRole.TRAINER,
      status: UserStatus.ACTIVE,
    }));
    trainerId = trainer.id;
    await trainerProfileRepo.save(trainerProfileRepo.create({
      userId: trainer.id,
      businessName: 'C9 Gym',
      trainerName: 'Coach C9',
    }));
  });

  afterAll(async () => {
    await cleanDb();
    await app.close();
  });

  async function cleanDb() {
    await coachProfileRepo.query('DELETE FROM coach_profiles').catch(() => {});
    await assocRepo.query('DELETE FROM trainer_player_associations').catch(() => {});
    await shareLinkRepo.query('DELETE FROM share_links').catch(() => {});
    await userRepo.query('DELETE FROM player_profiles').catch(() => {});
    await userRepo.query('DELETE FROM trainer_profiles').catch(() => {});
    await userRepo.query('DELETE FROM sessions').catch(() => {});
    await userRepo.query('DELETE FROM users').catch(() => {});
  }

  /**
   * SECURITY-CRITICAL sanity check: Two concurrent joins on a UNIQUE link.
   *
   * Sanity check result: When `use_count < max_uses` was removed from the
   * conditional UPDATE, both concurrent requests got `affected=1` →
   * both returned 201 → test asserting exactly one 201 went RED.
   * After restoring the predicate, exactly one wins.
   */
  it('two concurrent joins on UNIQUE link → exactly one 201, other 410 LINK_USED', async () => {
    const uniqueCode = generateShareLinkCode();
    await shareLinkRepo.save(shareLinkRepo.create({
      code: uniqueCode,
      type: ShareLinkType.UNIQUE,
      trainerId,
      createdBy: trainerId,
      targetEmail: 'coach-race@c9.com',
      maxUses: 1,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    }));

    // Two concurrent join attempts with different emails
    const [res1, res2] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/v1/join/${uniqueCode}`)
        .send({
          email: 'coach-race1-c9@test.com',
          password: 'CoachPass123!',
          playerName: 'Coach Race 1',
        }),
      request(app.getHttpServer())
        .post(`/api/v1/join/${uniqueCode}`)
        .send({
          email: 'coach-race2-c9@test.com',
          password: 'CoachPass123!',
          playerName: 'Coach Race 2',
        }),
    ]);

    const statuses = [res1.status, res2.status];
    const success = statuses.filter((s) => s === 201).length;
    const used = statuses.filter((s) => s === 410).length;

    expect(success).toBe(1);
    expect(used).toBe(1);

    // The 410 response should have LINK_USED errorCode
    const failedRes = res1.status === 410 ? res1 : res2;
    expect(failedRes.body.errorCode).toBe('LINK_USED');

    // useCount should be exactly 1
    const link = await shareLinkRepo.findOne({ where: { code: uniqueCode } });
    expect(link!.useCount).toBe(1);
  });

  it('STATIC link: multiple concurrent joins all succeed (useCount analytics only)', async () => {
    const staticCode = generateShareLinkCode();
    await shareLinkRepo.save(shareLinkRepo.create({
      code: staticCode,
      type: ShareLinkType.STATIC,
      trainerId,
      createdBy: trainerId,
    }));

    const joins = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/v1/join/${staticCode}`)
        .send({ email: 'static1-c9@test.com', password: 'Password123!', playerName: 'Static 1' }),
      request(app.getHttpServer())
        .post(`/api/v1/join/${staticCode}`)
        .send({ email: 'static2-c9@test.com', password: 'Password123!', playerName: 'Static 2' }),
      request(app.getHttpServer())
        .post(`/api/v1/join/${staticCode}`)
        .send({ email: 'static3-c9@test.com', password: 'Password123!', playerName: 'Static 3' }),
    ]);

    // All three should succeed (static = unlimited)
    for (const res of joins) {
      expect(res.status).toBe(201);
    }
  });
});
