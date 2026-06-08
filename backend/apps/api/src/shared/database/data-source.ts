/**
 * TypeORM CLI DataSource — used by `typeorm migration:run`, `migration:generate`, etc.
 *
 * Usage (from backend/ directory):
 *   npx typeorm -d apps/api/src/shared/database/data-source.ts migration:run
 *
 * Requires DATABASE_URL to be set in the environment (.env.test or shell env).
 * Reads from process.env at startup; not injected by NestJS.
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as path from 'path';

// Load env from .env.test if DATABASE_URL not already set (CLI convenience)
if (!process.env.DATABASE_URL) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('dotenv').config({ path: path.join(__dirname, '../../../../.env.test') });
  } catch {
    // dotenv not available — DATABASE_URL must be set in env
  }
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required for migrations');
}

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: DATABASE_URL,
  synchronize: false,
  logging: true,
  entities: [path.join(__dirname, '../../modules/**/*.entity.{ts,js}')],
  migrations: [path.join(__dirname, 'migrations/*.{ts,js}')],
  migrationsTableName: 'typeorm_migrations',
});
