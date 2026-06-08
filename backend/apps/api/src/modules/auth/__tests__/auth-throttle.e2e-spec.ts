import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '../../../app/app.module';
import { HttpExceptionFilter } from '../../../shared/errors/http-exception.filter';
import { setupSession } from '../../../shared/session/session.setup';
import { User, UserRole, UserStatus } from '../../users/entities/user.entity';
import { PasswordService } from '../../../shared/crypto/password.service';

describe('Auth Rate Limiting (e2e)', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;
  let passwordService: PasswordService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    setupSession(app);
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    userRepo = moduleFixture.get(getRepositoryToken(User));
    passwordService = moduleFixture.get(PasswordService);

    await userRepo.query('DELETE FROM password_reset_tokens');
    await userRepo.query('DELETE FROM email_verification_tokens');
    await userRepo.query('DELETE FROM users');
    const hash = await passwordService.hash('password123');
    await userRepo.save(
      userRepo.create({
        email: 'throttle-test@example.com',
        passwordHash: hash,
        role: UserRole.TRAINER,
        status: UserStatus.ACTIVE,
      }),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('triggers 429 after exceeding rate limit on login', async () => {
    // The test throttle config allows 3 attempts then blocks
    const failedLogin = () =>
      request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'throttle-test@example.com', password: 'wrong-password' });

    // First few attempts should be 401 (wrong password)
    await failedLogin();
    await failedLogin();
    await failedLogin();

    // After enough rapid failures, should get 429
    let got429 = false;
    for (let i = 0; i < 10; i++) {
      const res = await failedLogin();
      if (res.status === 429) {
        got429 = true;
        break;
      }
    }
    expect(got429).toBe(true);
  });
});
