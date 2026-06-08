import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../app/app.module';
import { bootstrapApp } from '../../bootstrap/bootstrap';

/**
 * A8: Session store + cookie hardening e2e test.
 * Verifies that:
 * 1. Routes that set session data return Set-Cookie with HttpOnly
 * 2. Subsequent requests with the cookie can read session data back
 */
describe('Session (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await bootstrapApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health still works (session middleware applied)', async () => {
    await request(app.getHttpServer()).get('/api/v1/health').expect(200);
  });

  it('POST /api/v1/auth/session-test sets HttpOnly cookie', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/session-test/set')
      .send({ value: 'hello' })
      .expect(201);

    const cookies = response.headers['set-cookie'] as string[] | string | undefined;
    expect(cookies).toBeDefined();
    const cookieArr = Array.isArray(cookies) ? cookies : [cookies as string];
    const sessionCookie = cookieArr.find((c) => c.includes('connect.sid'));
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toMatch(/HttpOnly/i);
    expect(sessionCookie).toMatch(/SameSite/i);
  });

  it('reads session value back with cookie', async () => {
    // Step 1: Set value in session
    const setResponse = await request(app.getHttpServer())
      .post('/api/v1/session-test/set')
      .send({ value: 'test-value' })
      .expect(201);

    const cookies = setResponse.headers['set-cookie'] as string[] | string;
    const cookieStr = Array.isArray(cookies) ? cookies.join('; ') : cookies;
    const sessionCookie = (Array.isArray(cookies) ? cookies : [cookies]).find((c) =>
      c.includes('connect.sid'),
    );
    expect(sessionCookie).toBeDefined();

    // Extract just the sid=value part
    const sidPart = sessionCookie!.split(';')[0];

    // Step 2: Read session value back
    const getResponse = await request(app.getHttpServer())
      .get('/api/v1/session-test/get')
      .set('Cookie', sidPart)
      .expect(200);

    expect(getResponse.body).toEqual({ value: 'test-value' });
  });
});
