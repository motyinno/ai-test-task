/**
 * C11: Coach invite + acceptance, single-trainer guard (BR-006).
 *
 * Security-critical: a coach can only be ACTIVE under ONE trainer at a time.
 *
 * Sanity-check: removing the BR-006 check allows a coach to be active under
 * two trainers simultaneously — the test asserting 409 goes RED.
 *
 * Tests:
 *   - TRAINER POST /coaches/invite → 201, creates UNIQUE ShareLink, sends email
 *   - Inviting email already active under another trainer → 409 COACH_ALREADY_ACTIVE_ELSEWHERE
 *   - Coach accepts via POST /join/:code → creates CoachProfile linked to trainer, consumes link
 *   - Second acceptance → 410 LINK_USED
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
import { EmailService } from '../../../shared/integrations/email/email.service';

describe('C11: coach invite + acceptance, single-trainer guard (BR-006)', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;
  let trainerProfileRepo: Repository<TrainerProfile>;
  let coachProfileRepo: Repository<CoachProfile>;
  let shareLinkRepo: Repository<ShareLink>;
  let passwordService: PasswordService;
  let emailService: EmailService;

  const PASSWORD = 'Password123!';
  const TRAINER1_EMAIL = 'trainer1-c11@test.com';
  const TRAINER2_EMAIL = 'trainer2-c11@test.com';
  const COACH_EMAIL = 'coach-c11@test.com';

  let trainer1Id: string;
  let trainer2Id: string;
  let trainer1Cookie: string;
  let trainer1Csrf: string;
  let trainer2Cookie: string;
  let trainer2Csrf: string;

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
    emailService = moduleFixture.get(EmailService);

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
      businessName: 'C11 Gym 1',
      trainerName: 'Coach Trainer 1',
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
      businessName: 'C11 Gym 2',
      trainerName: 'Coach Trainer 2',
    }));

    trainer1Cookie = await loginAs(TRAINER1_EMAIL);
    trainer1Csrf = await getCsrfToken(trainer1Cookie);
    trainer2Cookie = await loginAs(TRAINER2_EMAIL);
    trainer2Csrf = await getCsrfToken(trainer2Cookie);
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

  it('TRAINER POST /coaches/invite → 201, UNIQUE link created, email dispatched', async () => {
    emailService.sentMessages.length = 0;

    const res = await request(app.getHttpServer())
      .post('/api/v1/coaches/invite')
      .set('Cookie', trainer1Cookie)
      .set('X-CSRF-Token', trainer1Csrf)
      .send({ email: COACH_EMAIL, name: 'New Coach', message: 'Welcome!' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.targetEmail).toBe(COACH_EMAIL);
    expect(res.body.code).toBeDefined();

    // Invite email should be sent
    const invite = emailService.sentMessages.find((m) => m.to === COACH_EMAIL);
    expect(invite).toBeDefined();
    expect(invite!.subject).toContain('coach');

    // Link should be UNIQUE with maxUses=1
    const link = await shareLinkRepo.findOne({ where: { id: res.body.id } });
    expect(link!.type).toBe(ShareLinkType.UNIQUE);
    expect(link!.maxUses).toBe(1);
    expect(link!.targetEmail).toBe(COACH_EMAIL);
    expect(link!.trainerId).toBe(trainer1Id);
  });

  it('coach accepts via POST /join/:code → creates CoachProfile, consumes link atomically', async () => {
    // Get the invite link
    const links = await shareLinkRepo.find({
      where: { trainerId: trainer1Id, type: ShareLinkType.UNIQUE },
    });
    const link = links[0];

    const res = await request(app.getHttpServer())
      .post(`/api/v1/join/${link.code}`)
      .send({
        email: COACH_EMAIL,
        password: 'CoachPass123!',
        playerName: 'Coach Name',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    // CoachProfile should be created under trainer1
    const coachUser = await userRepo.findOne({ where: { email: COACH_EMAIL } });
    expect(coachUser).not.toBeNull();
    const coachProfile = await coachProfileRepo.findOne({ where: { userId: coachUser!.id } });
    expect(coachProfile).not.toBeNull();
    expect(coachProfile!.trainerId).toBe(trainer1Id);

    // Link should be consumed (useCount=1)
    const updatedLink = await shareLinkRepo.findOne({ where: { id: link.id } });
    expect(updatedLink!.useCount).toBe(1);
  });

  it('second acceptance of same link → 410 LINK_USED', async () => {
    const links = await shareLinkRepo.find({
      where: { trainerId: trainer1Id, type: ShareLinkType.UNIQUE },
    });
    const link = links[0];

    const res = await request(app.getHttpServer())
      .post(`/api/v1/join/${link.code}`)
      .send({
        email: 'another-coach@test.com',
        password: 'CoachPass123!',
        playerName: 'Another Coach',
      });

    expect(res.status).toBe(410);
    expect(res.body.errorCode).toBe('LINK_USED');
  });

  /**
   * SECURITY-CRITICAL sanity check: BR-006 single-trainer guard.
   *
   * Sanity check result: when the BR-006 check was removed from inviteCoach(),
   * trainer2 could successfully invite a coach already active under trainer1.
   * The test asserting 409 COACH_ALREADY_ACTIVE_ELSEWHERE went RED.
   * After restoring the check, it goes GREEN.
   */
  it('inviting coach already active under another trainer → 409 COACH_ALREADY_ACTIVE_ELSEWHERE', async () => {
    // COACH_EMAIL is now active under trainer1 (from previous test)
    // trainer2 tries to invite the same coach
    const res = await request(app.getHttpServer())
      .post('/api/v1/coaches/invite')
      .set('Cookie', trainer2Cookie)
      .set('X-CSRF-Token', trainer2Csrf)
      .send({ email: COACH_EMAIL });

    expect(res.status).toBe(409);
    expect(res.body.errorCode).toBe('COACH_ALREADY_ACTIVE_ELSEWHERE');
  });
});
