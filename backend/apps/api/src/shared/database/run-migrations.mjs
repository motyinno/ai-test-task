/**
 * Standalone migration runner for Phase A Foundation tables (C4).
 *
 * Runs the same SQL as PhaseAFoundation1749340000000 migration.
 * Uses the `pg` client directly — no TypeScript compilation needed.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... node apps/api/src/shared/database/run-migrations.mjs
 *
 * Or (loads .env.test automatically if DATABASE_URL not set):
 *   node apps/api/src/shared/database/run-migrations.mjs
 *
 * Idempotent: uses IF NOT EXISTS / ON CONFLICT DO NOTHING so it is safe to run multiple times.
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pkg from 'pg';
const { Client } = pkg;

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.test if DATABASE_URL not set
if (!process.env.DATABASE_URL) {
  try {
    const envPath = join(__dirname, '../../../../../.env.test');
    const envContent = readFileSync(envPath, 'utf8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && !process.env[key]) {
          process.env[key] = valueParts.join('=');
        }
      }
    }
  } catch {
    // .env.test not found — DATABASE_URL must be in environment
  }
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  process.exit(1);
}

const MIGRATION_NAME = 'PhaseAFoundation1749340000000';

const UP_QUERIES = [
  // Enums (idempotent via DO block)
  `DO $$ BEGIN
    CREATE TYPE "public"."users_role_enum" AS ENUM(
      'SUPER_ADMIN', 'TRAINER', 'COACH', 'PLAYER'
    );
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$`,

  `DO $$ BEGIN
    CREATE TYPE "public"."users_status_enum" AS ENUM(
      'ACTIVE', 'INACTIVE', 'DELETED'
    );
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$`,

  // users
  `CREATE TABLE IF NOT EXISTS "users" (
    "id"                   UUID                          NOT NULL DEFAULT uuid_generate_v4(),
    "email"                CHARACTER VARYING(255)        NOT NULL,
    "password_hash"        TEXT                          NOT NULL,
    "role"                 "public"."users_role_enum"   NOT NULL,
    "status"               "public"."users_status_enum" NOT NULL DEFAULT 'ACTIVE',
    "anonymized_at"        TIMESTAMP                     NULL DEFAULT NULL,
    "email_verified"       BOOLEAN                       NOT NULL DEFAULT FALSE,
    "must_change_password" BOOLEAN                       NOT NULL DEFAULT FALSE,
    "last_login_at"        TIMESTAMP                     NULL DEFAULT NULL,
    "created_at"           TIMESTAMP                     NOT NULL DEFAULT NOW(),
    "updated_at"           TIMESTAMP                     NOT NULL DEFAULT NOW(),
    CONSTRAINT "PK_users" PRIMARY KEY ("id")
  )`,

  `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_users_email" ON "users" ("email")`,

  // password_reset_tokens
  `CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
    "id"         UUID      NOT NULL DEFAULT uuid_generate_v4(),
    "token"      TEXT      NOT NULL,
    "user_id"    UUID      NOT NULL,
    "expires_at" TIMESTAMP NOT NULL,
    "used_at"    TIMESTAMP NULL DEFAULT NULL,
    "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT "PK_password_reset_tokens" PRIMARY KEY ("id"),
    CONSTRAINT "FK_password_reset_tokens_user"
      FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE
  )`,

  `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_password_reset_tokens_token"
    ON "password_reset_tokens" ("token")`,

  // email_verification_tokens
  `CREATE TABLE IF NOT EXISTS "email_verification_tokens" (
    "id"         UUID      NOT NULL DEFAULT uuid_generate_v4(),
    "token"      TEXT      NOT NULL,
    "user_id"    UUID      NOT NULL,
    "expires_at" TIMESTAMP NOT NULL,
    "used_at"    TIMESTAMP NULL DEFAULT NULL,
    "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT "PK_email_verification_tokens" PRIMARY KEY ("id"),
    CONSTRAINT "FK_email_verification_tokens_user"
      FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE
  )`,

  `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_email_verification_tokens_token"
    ON "email_verification_tokens" ("token")`,

  // sessions (connect-pg-simple)
  `CREATE TABLE IF NOT EXISTS "sessions" (
    "sid"    VARCHAR        NOT NULL,
    "sess"   JSON           NOT NULL,
    "expire" TIMESTAMP(6)  NOT NULL,
    CONSTRAINT "PK_sessions" PRIMARY KEY ("sid")
  )`,

  `CREATE INDEX IF NOT EXISTS "IDX_sessions_expire" ON "sessions" ("expire")`,

  // test_tenant_items (test-only, Phase A smoke gate A19)
  `CREATE TABLE IF NOT EXISTS "test_tenant_items" (
    "id"         UUID                   NOT NULL DEFAULT uuid_generate_v4(),
    "trainer_id" CHARACTER VARYING(255) NOT NULL,
    "name"       CHARACTER VARYING(255) NOT NULL,
    CONSTRAINT "PK_test_tenant_items" PRIMARY KEY ("id")
  )`,
];

async function run() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log('Connected to database');

  try {
    // Step 1: Ensure migrations tracking table exists (outside transaction so it persists)
    await client.query(`CREATE TABLE IF NOT EXISTS "typeorm_migrations" (
      "id"         SERIAL  NOT NULL,
      "timestamp"  BIGINT  NOT NULL,
      "name"       VARCHAR NOT NULL,
      CONSTRAINT "PK_typeorm_migrations" PRIMARY KEY ("id")
    )`);

    // Step 2: Check if this migration already ran
    const existing = await client.query(
      `SELECT 1 FROM "typeorm_migrations" WHERE "name" = $1 LIMIT 1`,
      [MIGRATION_NAME],
    );

    if (existing.rows.length > 0) {
      console.log(`Migration ${MIGRATION_NAME} already applied — skipping`);
      return;
    }

    // Step 3: Run all UP queries in a transaction
    await client.query('BEGIN');
    console.log(`Running migration: ${MIGRATION_NAME}`);
    for (const query of UP_QUERIES) {
      const preview = query.trim().split('\n')[0].trim().substring(0, 80);
      console.log(`  > ${preview}...`);
      await client.query(query);
    }

    // Record migration
    await client.query(
      `INSERT INTO "typeorm_migrations" ("timestamp", "name") VALUES ($1, $2)`,
      [1749340000000, MIGRATION_NAME],
    );

    await client.query('COMMIT');
    console.log(`Migration ${MIGRATION_NAME} completed successfully`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
