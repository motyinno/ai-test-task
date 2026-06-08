import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const session = require('express-session') as typeof import('express-session');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const connectPgSimple = require('connect-pg-simple');
import { Pool } from 'pg';

const PgSession = connectPgSimple(session);

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function setupSession(app: INestApplication): void {
  const configService = app.get(ConfigService);
  const databaseUrl = configService.getOrThrow<string>('DATABASE_URL');
  const sessionSecret = configService.getOrThrow<string>('SESSION_SECRET');
  const isProd = process.env.NODE_ENV === 'production';

  const pool = new Pool({ connectionString: databaseUrl });

  app.use(
    session({
      store: new PgSession({
        pool,
        tableName: 'sessions',
        createTableIfMissing: true,
      }),
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: isProd,
        maxAge: THIRTY_DAYS_MS,
      },
    }),
  );
}
