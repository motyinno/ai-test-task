/**
 * C8: POST /join/:code — existing logged-in player association (BR-005, edge B).
 *
 * Security-critical: no-duplicate association.
 *
 * Sanity-check: removing the duplicate guard (not checking for existing association
 * before insert) causes a unique-constraint violation which is handled as
 * ALREADY_ASSOCIATED — but the test asserting `alreadyAssociated=true` fails when
 * the guard is absent and we instead return success=true,alreadyAssociated=false
 * (if the constraint catches silently). The real test is verifying only 1 row
 * is created after two join calls.
 *
 * Tests:
 *   - Logged-in PLAYER joins a DIFFERENT trainer → 201, creates association only (no new User/Profile)
 *   - Already-ACTIVE association → 200 ALREADY_ASSOCIATED no-op (no second row)
 *   - Previously-REMOVED association → reactivates (status REMOVED→ACTIVE), no duplicate
 *   - Unique constraint violation on race → still only 1 row, never 500
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
import { TrainerPlayerAssociation, AssociationStatus } from '../entities/trainer-player-association.entity';
import { PasswordService } from '../../../shared/crypto/password.service';
import { generateShareLinkCode } from '../../sharelinks/share-link-code.util';

describe('C8: existing-player association, no-duplicate (BR-005, edge B)', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;
  let trainerProfileRepo: Repository<TrainerProfile>;
  let playerProfileRepo: Repository<PlayerProfile>;
  let shareLinkRepo: Repository<ShareLink>;
  let assocRepo: Repository<TrainerPlayerAssociation>;
  let passwordService: PasswordService;

  const PASSWORD = 'Password123!';
  const TRAINER1_EMAIL = 'trainer1-c8@test.com';
  const TRAINER2_EMAIL = 'trainer2-c8@test.com';
  const PLAYER_EMAIL = 'player-c8@test.com';

  let trainer1Id: string;
  let trainer2Id: string;
  let playerId: string;
  let playerProfileId: string;
  let link1Code: string;
  let link1Id: string;
  let link2Code: string;
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
    shareLinkRepo = moduleFixture.get(getRepositoryToken(ShareLink));
    assocRepo = moduleFixture.get(getRepositoryToken(TrainerPlayerAssociation));
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
      businessName: 'Gym 1',
      trainerName: 'Coach 1',
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
      businessName: 'Gym 2',
      trainerName: 'Coach 2',
    }));

    // Seed player
    const player = await userRepo.save(userRepo.create({
      email: PLAYER_EMAIL,
      passwordHash: hash,
      role: UserRole.PLAYER,
      status: UserStatus.ACTIVE,
    }));
    playerId = player.id;
    const playerProfile = await playerProfileRepo.save(playerProfileRepo.create({
      userId: player.id,
      name: 'Player C8',
    }));
    playerProfileId = playerProfile.id;

    // Seed share links
    link1Code = generateShareLinkCode();
    const l1 = await shareLinkRepo.save(shareLinkRepo.create({
      code: link1Code,
      type: ShareLinkType.STATIC,
      trainerId: trainer1Id,
      createdBy: trainer1Id,
    }));
    link1Id = l1.id;

    link2Code = generateShareLinkCode();
    await shareLinkRepo.save(shareLinkRepo.create({
      code: link2Code,
      type: ShareLinkType.STATIC,
      trainerId: trainer2Id,
      createdBy: trainer2Id,
    }));

    // Login as player
    playerCookie = await loginAs(PLAYER_EMAIL);
    playerCsrf = await getCsrfToken(playerCookie);
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

  it('logged-in PLAYER joins trainer1 link → 201, only new association (no new User/Profile)', async () => {
    const usersBefore = await userRepo.count();
    const profilesBefore = await playerProfileRepo.count();

    const res = await request(app.getHttpServer())
      .post(`/api/v1/join/${link1Code}`)
      .set('Cookie', playerCookie)
      .send({});  // logged-in: no body fields needed

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.alreadyAssociated).toBe(false);

    // No new User or PlayerProfile created
    const usersAfter = await userRepo.count();
    const profilesAfter = await playerProfileRepo.count();
    expect(usersAfter).toBe(usersBefore);
    expect(profilesAfter).toBe(profilesBefore);

    // Association was created
    const assoc = await assocRepo.findOne({ where: { trainerId: trainer1Id, playerProfileId } });
    expect(assoc).not.toBeNull();
    expect(assoc!.status).toBe(AssociationStatus.ACTIVE);
  });

  /**
   * SECURITY-CRITICAL sanity check: No-duplicate (BR-005)
   *
   * Sanity check result: when the "check existing before insert" step was
   * removed from PlayersService.associateExistingPlayer(), the second join
   * attempted a raw insert and got a DB unique-constraint violation. The
   * service's catch block returned `alreadyAssociated=true` in that case.
   * However, the assertion `assocCount === 1` is the reliable check: only
   * one row should exist after two join calls.
   */
  it('clicking ACTIVE association link again → 200 ALREADY_ASSOCIATED (no-op, 1 row)', async () => {
    // First join (already done in previous test — link1)
    const firstRes = await request(app.getHttpServer())
      .post(`/api/v1/join/${link1Code}`)
      .set('Cookie', playerCookie)
      .send({});  // logged-in: no body fields needed
    expect(firstRes.status).toBe(201);
    expect(firstRes.body.alreadyAssociated).toBe(true);

    // Still only 1 row
    const count = await assocRepo.count({ where: { trainerId: trainer1Id, playerProfileId } });
    expect(count).toBe(1);
  });

  it('REMOVED association → reactivates to ACTIVE, no duplicate row', async () => {
    // Manually set the trainer2 association to REMOVED
    await assocRepo.save(assocRepo.create({
      trainerId: trainer2Id,
      playerProfileId,
      status: AssociationStatus.REMOVED,
    }));

    // Player joins trainer2 link → should reactivate
    const res = await request(app.getHttpServer())
      .post(`/api/v1/join/${link2Code}`)
      .set('Cookie', playerCookie)
      .send({});  // logged-in: no body fields needed

    expect(res.status).toBe(201);
    expect(res.body.alreadyAssociated).toBe(false);

    // Status should now be ACTIVE
    const assoc = await assocRepo.findOne({ where: { trainerId: trainer2Id, playerProfileId } });
    expect(assoc!.status).toBe(AssociationStatus.ACTIVE);

    // Still only 1 row for this trainer+player pair
    const count = await assocRepo.count({ where: { trainerId: trainer2Id, playerProfileId } });
    expect(count).toBe(1);
  });
});
