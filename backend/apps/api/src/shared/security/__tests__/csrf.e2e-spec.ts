import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '../../../app/app.module';
import { bootstrapApp } from '../../bootstrap/bootstrap';
import { User, UserRole, UserStatus } from '../../../modules/users/entities/user.entity';
import { PasswordService } from '../../crypto/password.service';

describe('CSRF Protection (e2e)', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;
  let passwordService: PasswordService;
  let sessionCookie: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await bootstrapApp(app);
    await app.init();

    userRepo = moduleFixture.get(getRepositoryToken(User));
    passwordService = moduleFixture.get(PasswordService);

    await userRepo.query('DELETE FROM password_reset_tokens');
    await userRepo.query('DELETE FROM email_verification_tokens');
    await userRepo.query('DELETE FROM users');
    const hash = await passwordService.hash('password123');
    await userRepo.save(
      userRepo.create({
        email: 'csrf-test@example.com',
        passwordHash: hash,
        role: UserRole.TRAINER,
        status: UserStatus.ACTIVE,
      }),
    );

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'csrf-test@example.com', password: 'password123' });

    const cookies = loginRes.headers['set-cookie'] as unknown as string[];
    const sidCookie = (Array.isArray(cookies) ? cookies : [cookies]).find((c) =>
      c.includes('connect.sid'),
    )!;
    sessionCookie = sidCookie.split(';')[0];
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST without X-CSRF-Token on a protected route returns 403 CSRF_INVALID', async () => {
    // logout is a protected state-changing route
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', sessionCookie)
      .expect(403);
    expect(res.body).toMatchObject({ errorCode: 'CSRF_INVALID' });
  });

  it('GET /api/v1/auth/csrf returns a token', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/csrf')
      .set('Cookie', sessionCookie)
      .expect(200);
    expect(res.body).toHaveProperty('token');
    expect(typeof res.body.token).toBe('string');
  });

  it('POST with valid X-CSRF-Token passes', async () => {
    // Get a CSRF token
    const csrfRes = await request(app.getHttpServer())
      .get('/api/v1/auth/csrf')
      .set('Cookie', sessionCookie);
    const csrfToken = csrfRes.body.token;

    // Now logout with CSRF token — should succeed
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', sessionCookie)
      .set('X-CSRF-Token', csrfToken)
      .expect(200);
  });
});
