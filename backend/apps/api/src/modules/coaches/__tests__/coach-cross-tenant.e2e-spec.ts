/**
 * M-2: Coach list/resend must be tenant-isolated.
 * Trainer1 cannot list or resend trainer2's invitations.
 *
 * Before M-2 fix: CoachesService.listInvitations and resendInvitation used
 * the raw @InjectRepository(ShareLink) with only a hand-passed trainerId —
 * this relied on the caller to pass the correct trainerId (sufficient for
 * direct-call paths, but not structurally enforced).
 *
 * After M-2 fix: both methods route through ShareLinksRepository scoped
 * methods (findAllForTrainer / findUniqueForTrainer) with explicit trainerId
 * filter, providing structural tenant isolation.
 *
 * Tests:
 *   - Trainer1 can list their own invitations
 *   - Trainer1 cannot list trainer2's invitations (returns empty list)
 *   - Trainer1 cannot resend trainer2's invitation link (404 LINK_NOT_FOUND)
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

describe('M-2: coach invitation tenant isolation — trainer cannot access other trainer invitations', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;
  let trainerProfileRepo: Repository<TrainerProfile>;
  let coachProfileRepo: Repository<CoachProfile>;
  let shareLinkRepo: Repository<ShareLink>;
  let passwordService: PasswordService;

  const PASSWORD = 'Password123!';
  const TRAINER1_EMAIL = 'trainer1-m2@test.com';
  const TRAINER2_EMAIL = 'trainer2-m2@test.com';

  let trainer1Id: string;
  let trainer2Id: string;
  let trainer2LinkId: string;
  let trainer1Cookie: string;
  let trainer1Csrf: string;

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
      businessName: 'M2 Gym 1',
      trainerName: 'M2 Trainer 1',
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
      businessName: 'M2 Gym 2',
      trainerName: 'M2 Trainer 2',
    }));

    // Seed a UNIQUE invite link for trainer2's coach
    const t2Link = await shareLinkRepo.save(shareLinkRepo.create({
      code: generateShareLinkCode(),
      type: ShareLinkType.UNIQUE,
      trainerId: trainer2Id,
      createdBy: trainer2Id,
      targetEmail: 'coach-of-trainer2-m2@test.com',
      maxUses: 1,
      useCount: 0,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    }));
    trainer2LinkId = t2Link.id;

    // Seed a UNIQUE invite link for trainer1's own coach
    await shareLinkRepo.save(shareLinkRepo.create({
      code: generateShareLinkCode(),
      type: ShareLinkType.UNIQUE,
      trainerId: trainer1Id,
      createdBy: trainer1Id,
      targetEmail: 'coach-of-trainer1-m2@test.com',
      maxUses: 1,
      useCount: 0,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    }));

    trainer1Cookie = await loginAs(TRAINER1_EMAIL);
    trainer1Csrf = await getCsrfToken(trainer1Cookie);
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

  it("trainer1 GET /coaches/invitations → only sees their own invitations (not trainer2's)", async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/coaches/invitations')
      .set('Cookie', trainer1Cookie);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    // trainer1's own invite is visible
    const trainer1Invite = res.body.find(
      (i: any) => i.targetEmail === 'coach-of-trainer1-m2@test.com',
    );
    expect(trainer1Invite).toBeDefined();

    // trainer2's invite must NOT appear in trainer1's list (M-2 tenant isolation)
    const trainer2Invite = res.body.find(
      (i: any) => i.targetEmail === 'coach-of-trainer2-m2@test.com',
    );
    expect(trainer2Invite).toBeUndefined();
  });

  it("trainer1 POST /coaches/invitations/:id/resend on trainer2's link → 404 LINK_NOT_FOUND", async () => {
    // trainer1 tries to resend a link that belongs to trainer2
    const res = await request(app.getHttpServer())
      .post(`/api/v1/coaches/invitations/${trainer2LinkId}/resend`)
      .set('Cookie', trainer1Cookie)
      .set('X-CSRF-Token', trainer1Csrf);

    expect(res.status).toBe(404);
    expect(res.body.errorCode).toBe('LINK_NOT_FOUND');
  });
});
