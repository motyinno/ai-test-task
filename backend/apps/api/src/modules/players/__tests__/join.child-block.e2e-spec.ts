/**
 * C10: Edge D — child principal block + parent notification (FR-027).
 *
 * Security-critical: child session (isChild=true) attempting to join via any
 * share link must be blocked with 403 CHILD_SHARELINK_BLOCKED. No association
 * is created. A parent notification email is sent.
 *
 * Sanity-check: removing the isChild gate in PlayersService causes the child
 * to get associated instead of blocked — the test asserting 403 goes RED.
 *
 * Note: child sub-login creation is Phase D; here we only test the BLOCK using
 * the isChild session flag (set manually in the session for test isolation).
 *
 * Tests:
 *   - Child principal POST /join/:code → 403 CHILD_SHARELINK_BLOCKED
 *   - No association created after blocked join
 *   - Parent notification email sent (dev adapter records it)
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../../../app/app.module';
import { bootstrapApp } from '../../../shared/bootstrap/bootstrap';
import { User, UserRole, UserStatus } from '../../users/entities/user.entity';
import { TrainerProfile } from '../../users/entities/trainer-profile.entity';
import { PlayerProfile } from '../../users/entities/player-profile.entity';
import { ShareLink, ShareLinkType } from '../../sharelinks/entities/share-link.entity';
import { TrainerPlayerAssociation } from '../entities/trainer-player-association.entity';
import { PasswordService } from '../../../shared/crypto/password.service';
import { EmailService } from '../../../shared/integrations/email/email.service';
import { generateShareLinkCode } from '../../sharelinks/share-link-code.util';

describe('C10: child block + parent email (FR-027, edge D)', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;
  let trainerProfileRepo: Repository<TrainerProfile>;
  let playerProfileRepo: Repository<PlayerProfile>;
  let shareLinkRepo: Repository<ShareLink>;
  let assocRepo: Repository<TrainerPlayerAssociation>;
  let passwordService: PasswordService;
  let emailService: EmailService;
  let dataSource: DataSource;

  const PASSWORD = 'Password123!';
  const TRAINER_EMAIL = 'trainer-c10@test.com';
  const PARENT_EMAIL = 'parent-c10@test.com';
  const CHILD_EMAIL = 'child-c10@test.com';

  let trainerId: string;
  let parentUserId: string;
  let childUserId: string;
  let childProfileId: string;
  let staticLinkCode: string;
  let childCookie: string;

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
    emailService = moduleFixture.get(EmailService);
    dataSource = moduleFixture.get(DataSource);

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
      businessName: 'C10 Gym',
      trainerName: 'Coach C10',
    }));

    // Seed parent user
    const parent = await userRepo.save(userRepo.create({
      email: PARENT_EMAIL,
      passwordHash: hash,
      role: UserRole.PLAYER,
      status: UserStatus.ACTIVE,
    }));
    parentUserId = parent.id;
    await playerProfileRepo.save(playerProfileRepo.create({
      userId: parent.id,
      name: 'Parent C10',
    }));

    // Seed child user (child of the parent)
    const child = await userRepo.save(userRepo.create({
      email: CHILD_EMAIL,
      passwordHash: hash,
      role: UserRole.PLAYER,
      status: UserStatus.ACTIVE,
    }));
    childUserId = child.id;
    const childProfile = await playerProfileRepo.save(playerProfileRepo.create({
      userId: child.id,
      name: 'Child C10',
      parentUserId: parentUserId,
    }));
    childProfileId = childProfile.id;

    // Seed static share link
    staticLinkCode = generateShareLinkCode();
    await shareLinkRepo.save(shareLinkRepo.create({
      code: staticLinkCode,
      type: ShareLinkType.STATIC,
      trainerId,
      createdBy: trainerId,
    }));

    // Log in as child user, then modify session to set isChild=true
    childCookie = await loginAndSetChildFlag(CHILD_EMAIL, parentUserId);
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

  async function loginAndSetChildFlag(email: string, parentUserId: string): Promise<string> {
    // Log in normally to get a session
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD });
    expect(loginRes.status).toBe(200);

    const cookies = loginRes.headers['set-cookie'] as unknown as string[];
    const sid = (Array.isArray(cookies) ? cookies : [cookies])
      .find((c) => c.includes('connect.sid'))!;
    const sidCookie = sid.split(';')[0];

    // Extract the session ID from the cookie value
    const sidValue = sidCookie.replace('connect.sid=', '').trim();
    // connect.sid is URL-encoded s%3A<sessionId>.<signature>
    const decoded = decodeURIComponent(sidValue);
    // Remove the 's:' prefix and signature: s:<sessionId>.<signature>
    const sessionId = decoded.replace(/^s:/, '').split('.')[0];

    // Update the session in the DB to set isChild=true on the principal
    await dataSource.query(
      `UPDATE sessions SET sess = jsonb_set(
        sess::jsonb,
        '{principal}',
        (sess->'principal')::jsonb || $1::jsonb
       ) WHERE sid = $2`,
      [JSON.stringify({ isChild: true, parentUserId }), sessionId],
    );

    return sidCookie;
  }

  /**
   * SECURITY-CRITICAL sanity check: Child block gate.
   *
   * Sanity check result: When the `if (ctx.isChild)` gate was removed from
   * PlayersService.joinViaLink(), a child principal could successfully join
   * a trainer. The test asserting 403 CHILD_SHARELINK_BLOCKED went RED.
   * After restoring the gate, the test goes GREEN.
   */
  it('child principal POST /join/:code → 403 CHILD_SHARELINK_BLOCKED', async () => {
    emailService.sentMessages.length = 0;

    const res = await request(app.getHttpServer())
      .post(`/api/v1/join/${staticLinkCode}`)
      .set('Cookie', childCookie)
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('CHILD_SHARELINK_BLOCKED');
  });

  it('NO association created after child block', async () => {
    const assoc = await assocRepo.findOne({
      where: { trainerId, playerProfileId: childProfileId },
    });
    expect(assoc).toBeNull();
  });

  it('parent notification email is dispatched', async () => {
    const parentEmail = emailService.sentMessages.find(
      (m) => m.to === PARENT_EMAIL,
    );
    expect(parentEmail).toBeDefined();
    expect(parentEmail!.subject).toContain('child');
    // Email contains trainer context
    expect(parentEmail!.text ?? parentEmail!.data?.trainerId).toBeTruthy();
  });
});
