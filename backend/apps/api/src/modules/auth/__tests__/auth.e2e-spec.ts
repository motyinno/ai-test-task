import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '../../../app/app.module';
import { bootstrapApp } from '../../../shared/bootstrap/bootstrap';
import { User, UserRole, UserStatus } from '../../users/entities/user.entity';
import { PasswordService } from '../../../shared/crypto/password.service';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;
  let passwordService: PasswordService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await bootstrapApp(app);
    await app.init();

    userRepo = moduleFixture.get(getRepositoryToken(User));
    passwordService = moduleFixture.get(PasswordService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await userRepo.query('DELETE FROM password_reset_tokens');
    await userRepo.query('DELETE FROM email_verification_tokens');
    await userRepo.query('DELETE FROM users');
  });

  async function createUser(overrides: Partial<User> = {}): Promise<User> {
    const hash = await passwordService.hash('password123');
    const user = userRepo.create({
      email: 'trainer@example.com',
      passwordHash: hash,
      role: UserRole.TRAINER,
      status: UserStatus.ACTIVE,
      ...overrides,
    });
    return userRepo.save(user);
  }

  it('POST /api/v1/auth/login with valid credentials returns 200 + MeResponseDto + Set-Cookie', async () => {
    await createUser();
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'trainer@example.com', password: 'password123' })
      .expect(200);

    expect(res.body).toMatchObject({ id: expect.any(String), role: UserRole.TRAINER });
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies).toBeDefined();
    expect(Array.isArray(cookies) ? cookies.join(' ') : cookies).toContain('connect.sid');
  });

  it('POST /api/v1/auth/login with invalid credentials returns 401', async () => {
    await createUser();
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'trainer@example.com', password: 'wrong-password' })
      .expect(401);
  });

  it('GET /api/v1/auth/me with session cookie returns principal', async () => {
    await createUser();
    // Login to get session cookie
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'trainer@example.com', password: 'password123' });

    const cookies = loginRes.headers['set-cookie'] as unknown as string[];
    const sidCookie = (Array.isArray(cookies) ? cookies : [cookies]).find((c) =>
      c.includes('connect.sid'),
    )!;
    const sidPart = sidCookie.split(';')[0];

    const meRes = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', sidPart)
      .expect(200);

    expect(meRes.body).toMatchObject({ role: UserRole.TRAINER });
  });

  it('GET /api/v1/auth/me without session returns 401', async () => {
    await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
  });

  it('POST /api/v1/auth/logout destroys session — subsequent /me returns 401', async () => {
    await createUser();
    // Login
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'trainer@example.com', password: 'password123' });

    const cookies = loginRes.headers['set-cookie'] as unknown as string[];
    const sidCookie = (Array.isArray(cookies) ? cookies : [cookies]).find((c) =>
      c.includes('connect.sid'),
    )!;
    const sidPart = sidCookie.split(';')[0];

    // Get CSRF token first
    const csrfRes = await request(app.getHttpServer())
      .get('/api/v1/auth/csrf')
      .set('Cookie', sidPart);
    const csrfToken = csrfRes.body.token;

    // Logout with CSRF token
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', sidPart)
      .set('X-CSRF-Token', csrfToken)
      .expect(200);

    // Subsequent /me should fail
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', sidPart)
      .expect(401);
  });
});
