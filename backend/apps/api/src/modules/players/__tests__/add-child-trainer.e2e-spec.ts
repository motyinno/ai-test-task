/**
 * POST /players/me/children/:childId/trainers — add a trainer to a child.
 *
 * Focus: FR-024 one-step onboarding. A valid share-link code is the trainer's
 * consent, so adding a trainer to a child via a code auto-connects the parent
 * (and the child) even when the parent wasn't previously associated. The
 * direct-trainerId path keeps the original "parent must be associated" gate.
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

describe('POST /players/me/children/:childId/trainers — FR-024 one-step connect', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;
  let trainerProfileRepo: Repository<TrainerProfile>;
  let playerProfileRepo: Repository<PlayerProfile>;
  let shareLinkRepo: Repository<ShareLink>;
  let assocRepo: Repository<TrainerPlayerAssociation>;
  let passwordService: PasswordService;

  const PASSWORD = 'Password123!';
  const TRAINER_EMAIL = 'trainer-act@test.com';
  const TRAINER2_EMAIL = 'trainer2-act@test.com';
  const PARENT_EMAIL = 'parent-act@test.com';

  let trainerId: string;
  let trainer2Id: string;
  let parentProfileId: string;
  let childProfileId: string;
  let shareCode: string;
  let parentCookie: string;
  let parentCsrf: string;

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

    const trainer = await userRepo.save(userRepo.create({
      email: TRAINER_EMAIL, passwordHash: hash, role: UserRole.TRAINER, status: UserStatus.ACTIVE,
    }));
    trainerId = trainer.id;
    await trainerProfileRepo.save(trainerProfileRepo.create({
      userId: trainer.id, businessName: 'Act Gym', trainerName: 'Coach Act',
    }));

    const trainer2 = await userRepo.save(userRepo.create({
      email: TRAINER2_EMAIL, passwordHash: hash, role: UserRole.TRAINER, status: UserStatus.ACTIVE,
    }));
    trainer2Id = trainer2.id;
    await trainerProfileRepo.save(trainerProfileRepo.create({
      userId: trainer2.id, businessName: 'Act Gym 2', trainerName: 'Coach Act 2',
    }));

    // Parent (PLAYER with own profile) + a child profile under them.
    const parent = await userRepo.save(userRepo.create({
      email: PARENT_EMAIL, passwordHash: hash, role: UserRole.PLAYER, status: UserStatus.ACTIVE,
    }));
    const parentProfile = await playerProfileRepo.save(playerProfileRepo.create({
      userId: parent.id, name: 'Parent Act',
    }));
    parentProfileId = parentProfile.id;
    // Child profiles have their own minimal User (internal email) + parentUserId.
    const childUser = await userRepo.save(userRepo.create({
      email: `child-act-${Date.now()}@child.internal`,
      passwordHash: hash, role: UserRole.PLAYER, status: UserStatus.ACTIVE,
    }));
    const childProfile = await playerProfileRepo.save(playerProfileRepo.create({
      userId: childUser.id, parentUserId: parent.id, name: 'Child Act', isChild: true,
    }));
    childProfileId = childProfile.id;

    shareCode = generateShareLinkCode();
    await shareLinkRepo.save(shareLinkRepo.create({
      code: shareCode, type: ShareLinkType.STATIC, trainerId, createdBy: trainerId,
    }));

    parentCookie = await loginAs(PARENT_EMAIL);
    parentCsrf = await getCsrfToken(parentCookie);
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

  it('via share code: auto-connects the parent AND adds the child (201)', async () => {
    // Precondition: parent is NOT associated with the trainer.
    const before = await assocRepo.findOne({ where: { trainerId, playerProfileId: parentProfileId } });
    expect(before).toBeNull();

    const res = await request(app.getHttpServer())
      .post(`/api/v1/players/me/children/${childProfileId}/trainers`)
      .set('Cookie', parentCookie)
      .set('X-CSRF-Token', parentCsrf)
      .send({ shareLinkCode: shareCode });

    expect(res.status).toBe(201);

    // Both parent and child are now ACTIVE-associated with the trainer.
    const parentAssoc = await assocRepo.findOne({ where: { trainerId, playerProfileId: parentProfileId } });
    const childAssoc = await assocRepo.findOne({ where: { trainerId, playerProfileId: childProfileId } });
    expect(parentAssoc?.status).toBe(AssociationStatus.ACTIVE);
    expect(childAssoc?.status).toBe(AssociationStatus.ACTIVE);
  });

  it('via direct trainerId when parent is not associated: still blocked (403)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/players/me/children/${childProfileId}/trainers`)
      .set('Cookie', parentCookie)
      .set('X-CSRF-Token', parentCsrf)
      .send({ trainerId: trainer2Id });

    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('PARENT_NOT_ASSOCIATED_WITH_TRAINER');
  });
});
