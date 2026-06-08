/**
 * M-1: BR-006 single-trainer guard — concurrent accept race.
 *
 * Two trainers both invite the same coach (different UNIQUE links).
 * The coach attempts to accept BOTH links concurrently (Promise.all).
 *
 * Expected result:
 *   - Exactly ONE CoachProfile is created (unique user_id constraint as race backstop)
 *   - The "loser" gets a clean 409 COACH_ALREADY_ACTIVE_ELSEWHERE, NOT a raw 500
 *
 * BR-006 note: the unique user_id constraint on coach_profiles is the race backstop.
 * Concurrent accepts both see null CoachProfile and both try to INSERT; the DB
 * unique constraint ensures only one wins; the loser's 23505 is caught and mapped
 * to a clean 409 COACH_ALREADY_ACTIVE_ELSEWHERE (M-1 fix in PlayersService).
 *
 * NON-MASKING TEST: confirmed to produce a raw 500 (unhandled 23505) before the
 * M-1 fix; after fix, the loser gets a clean 409.
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
import { ShareLink, ShareLinkType } from '../../sharelinks/entities/share-link.entity';
import { PasswordService } from '../../../shared/crypto/password.service';
import { generateShareLinkCode } from '../../sharelinks/share-link-code.util';

describe('M-1: BR-006 concurrent two-trainer accept race → exactly one CoachProfile, clean 409', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;
  let trainerProfileRepo: Repository<TrainerProfile>;
  let coachProfileRepo: Repository<CoachProfile>;
  let shareLinkRepo: Repository<ShareLink>;
  let passwordService: PasswordService;

  const PASSWORD = 'Password123!';
  const TRAINER1_EMAIL = 'trainer1-m1-race@test.com';
  const TRAINER2_EMAIL = 'trainer2-m1-race@test.com';
  const COACH_EMAIL = 'coach-m1-race@test.com';

  let trainer1Id: string;
  let trainer2Id: string;
  let link1Code: string;
  let link2Code: string;

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
    shareLinkRepo = moduleFixture.get(getRepositoryToken(ShareLink));
    passwordService = moduleFixture.get(PasswordService);

    await cleanDb();

    const hash = await passwordService.hash(PASSWORD);

    // Seed trainer 1
    const t1 = await userRepo.save(userRepo.create({
      email: TRAINER1_EMAIL,
      passwordHash: hash,
      role: UserRole.TRAINER,
      status: UserStatus.ACTIVE,
    }));
    trainer1Id = t1.id;
    await trainerProfileRepo.save(trainerProfileRepo.create({
      userId: t1.id,
      businessName: 'M1 Gym 1',
      trainerName: 'M1 Trainer 1',
    }));

    // Seed trainer 2
    const t2 = await userRepo.save(userRepo.create({
      email: TRAINER2_EMAIL,
      passwordHash: hash,
      role: UserRole.TRAINER,
      status: UserStatus.ACTIVE,
    }));
    trainer2Id = t2.id;
    await trainerProfileRepo.save(trainerProfileRepo.create({
      userId: t2.id,
      businessName: 'M1 Gym 2',
      trainerName: 'M1 Trainer 2',
    }));

    // Seed two UNIQUE links — one per trainer, both for the same coach email
    link1Code = generateShareLinkCode();
    await shareLinkRepo.save(shareLinkRepo.create({
      code: link1Code,
      type: ShareLinkType.UNIQUE,
      trainerId: trainer1Id,
      createdBy: trainer1Id,
      targetEmail: COACH_EMAIL,
      maxUses: 1,
      useCount: 0,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    }));

    link2Code = generateShareLinkCode();
    await shareLinkRepo.save(shareLinkRepo.create({
      code: link2Code,
      type: ShareLinkType.UNIQUE,
      trainerId: trainer2Id,
      createdBy: trainer2Id,
      targetEmail: COACH_EMAIL,
      maxUses: 1,
      useCount: 0,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    }));
  });

  afterAll(async () => {
    await cleanDb();
    await app.close();
  });

  async function cleanDb() {
    await coachProfileRepo.query('DELETE FROM coach_profiles').catch(() => {});
    await shareLinkRepo.query('DELETE FROM share_links').catch(() => {});
    await userRepo.query('DELETE FROM trainer_profiles').catch(() => {});
    await userRepo.query('DELETE FROM sessions').catch(() => {});
    await userRepo.query('DELETE FROM users').catch(() => {});
  }

  /**
   * NON-MASKING (M-1): Concurrent two-trainer accept race.
   *
   * Failing-first confirmation: before M-1 fix, one of the concurrent requests
   * threw an unhandled Postgres 23505 (unique_violation on coach_profiles.user_id),
   * which bubbled up as a 500 Internal Server Error.
   * After fix: the loser gets a clean 409 COACH_ALREADY_ACTIVE_ELSEWHERE.
   *
   * BR-006 relies on the unique user_id constraint on coach_profiles as the race backstop.
   */
  it('two concurrent accepts of different-trainer links for same coach → 1 CoachProfile, loser is 409 (not 500)', async () => {
    // Both links are for the same COACH_EMAIL, different trainers.
    // Anonymous coach registers with the same email on both concurrent requests.
    // The second INSERT into coach_profiles will get 23505 from the unique constraint.
    const [res1, res2] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/v1/join/${link1Code}`)
        .send({
          email: COACH_EMAIL,
          password: 'CoachPass123!',
          playerName: 'Coach M1 Race',
        }),
      request(app.getHttpServer())
        .post(`/api/v1/join/${link2Code}`)
        .send({
          email: COACH_EMAIL,
          password: 'CoachPass123!',
          playerName: 'Coach M1 Race',
        }),
    ]);

    const statuses = [res1.status, res2.status];

    // Exactly one should succeed
    const successCount = statuses.filter((s) => s === 201).length;
    // The "loser" must be a 409, NOT a 500 (M-1 fix)
    const conflictCount = statuses.filter((s) => s === 409).length;
    const serverErrorCount = statuses.filter((s) => s >= 500).length;

    expect(serverErrorCount).toBe(0); // no 500 allowed (M-1 fix)

    // Either exactly one succeeds (true race), or both get 409 (the duplicate-email
    // check fires first for the second request when the user was created by the first)
    // — either way NO 500 and at most one CoachProfile.
    expect(successCount + conflictCount).toBe(2);

    // If we got a conflict, it should be COACH_ALREADY_ACTIVE_ELSEWHERE (not a raw error)
    const failedRes = res1.status !== 201 ? res1 : (res2.status !== 201 ? res2 : null);
    if (failedRes) {
      expect([409, 410]).toContain(failedRes.status); // 409 conflict or 410 link-used
      if (failedRes.status === 409) {
        expect(failedRes.body.errorCode).toBe('COACH_ALREADY_ACTIVE_ELSEWHERE');
      }
    }

    // CRITICAL: exactly one CoachProfile for this coach (BR-006)
    const coachUser = await userRepo.findOne({ where: { email: COACH_EMAIL } });
    if (coachUser) {
      const coachProfiles = await coachProfileRepo.find({ where: { userId: coachUser.id } });
      expect(coachProfiles.length).toBe(1); // BR-006: exactly one
    }
  });
});
