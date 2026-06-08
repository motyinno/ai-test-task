/**
 * Phase B migration runner — verifies Phase B tables exist on the test DB.
 *
 * Idempotent: uses IF NOT EXISTS / DO blocks.
 * Tables created: trainer_profiles, coach_profiles, player_profiles, user_deletion_log
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pkg from 'pg';
const { Client } = pkg;

const __dirname = dirname(fileURLToPath(import.meta.url));

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
    // .env.test not found
  }
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is required');
  process.exit(1);
}

const MIGRATION_NAME = 'PhaseBProfiles1749400000000';

const UP_QUERIES = [
  // trainer_profiles
  `CREATE TABLE IF NOT EXISTS "trainer_profiles" (
    "id"                UUID                        NOT NULL DEFAULT uuid_generate_v4(),
    "user_id"           UUID                        NOT NULL,
    "business_name"     CHARACTER VARYING(200)      NOT NULL,
    "trainer_name"      CHARACTER VARYING(100)      NOT NULL,
    "phone"             CHARACTER VARYING(20)       NULL DEFAULT NULL,
    "photo_url"         TEXT                        NULL DEFAULT NULL,
    "stripe_account_id" TEXT                        NULL DEFAULT NULL,
    "created_at"        TIMESTAMP                   NOT NULL DEFAULT NOW(),
    "updated_at"        TIMESTAMP                   NOT NULL DEFAULT NOW(),
    CONSTRAINT "PK_trainer_profiles" PRIMARY KEY ("id"),
    CONSTRAINT "UQ_trainer_profiles_user_id" UNIQUE ("user_id"),
    CONSTRAINT "FK_trainer_profiles_user"
      FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE
  )`,

  // coach_profiles
  `CREATE TABLE IF NOT EXISTS "coach_profiles" (
    "id"             UUID                   NOT NULL DEFAULT uuid_generate_v4(),
    "user_id"        UUID                   NOT NULL,
    "trainer_id"     UUID                   NOT NULL,
    "bio"            TEXT                   NULL DEFAULT NULL,
    "credentials"    TEXT                   NULL DEFAULT NULL,
    "public_profile" BOOLEAN                NOT NULL DEFAULT FALSE,
    "photo_url"      TEXT                   NULL DEFAULT NULL,
    "created_at"     TIMESTAMP              NOT NULL DEFAULT NOW(),
    "updated_at"     TIMESTAMP              NOT NULL DEFAULT NOW(),
    CONSTRAINT "PK_coach_profiles" PRIMARY KEY ("id"),
    CONSTRAINT "UQ_coach_profiles_user_id" UNIQUE ("user_id"),
    CONSTRAINT "FK_coach_profiles_user"
      FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE
  )`,

  `CREATE INDEX IF NOT EXISTS "IDX_coach_profiles_trainer_id" ON "coach_profiles" ("trainer_id")`,

  // player_profiles (gender enum)
  `DO $$ BEGIN
    CREATE TYPE "public"."player_profiles_gender_enum" AS ENUM('MALE', 'FEMALE', 'OTHER');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$`,

  `CREATE TABLE IF NOT EXISTS "player_profiles" (
    "id"                              UUID                                        NOT NULL DEFAULT uuid_generate_v4(),
    "user_id"                         UUID                                        NOT NULL,
    "parent_user_id"                  UUID                                        NULL DEFAULT NULL,
    "name"                            CHARACTER VARYING(200)                      NOT NULL,
    "age"                             INTEGER                                     NULL DEFAULT NULL,
    "gender"                          "public"."player_profiles_gender_enum"      NULL DEFAULT NULL,
    "school"                          CHARACTER VARYING(200)                      NULL DEFAULT NULL,
    "jersey_number"                   CHARACTER VARYING(20)                       NULL DEFAULT NULL,
    "skill_level"                     CHARACTER VARYING(50)                       NULL DEFAULT NULL,
    "photo_url"                       TEXT                                        NULL DEFAULT NULL,
    "allow_token_spend_without_approval" BOOLEAN                                 NOT NULL DEFAULT FALSE,
    "created_at"                      TIMESTAMP                                   NOT NULL DEFAULT NOW(),
    "updated_at"                      TIMESTAMP                                   NOT NULL DEFAULT NOW(),
    CONSTRAINT "PK_player_profiles" PRIMARY KEY ("id"),
    CONSTRAINT "UQ_player_profiles_user_id" UNIQUE ("user_id"),
    CONSTRAINT "FK_player_profiles_user"
      FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE
  )`,

  `CREATE INDEX IF NOT EXISTS "IDX_player_profiles_parent_user_id" ON "player_profiles" ("parent_user_id")`,

  // user_deletion_log
  `CREATE TABLE IF NOT EXISTS "user_deletion_log" (
    "id"               UUID                   NOT NULL DEFAULT uuid_generate_v4(),
    "original_user_id" UUID                   NOT NULL,
    "original_email"   TEXT                   NOT NULL,
    "deleted_by"       UUID                   NOT NULL,
    "reason"           TEXT                   NOT NULL,
    "deleted_at"       TIMESTAMP              NOT NULL DEFAULT NOW(),
    "backup_ref"       TEXT                   NULL DEFAULT NULL,
    CONSTRAINT "PK_user_deletion_log" PRIMARY KEY ("id")
  )`,

  `CREATE INDEX IF NOT EXISTS "IDX_user_deletion_log_original_user_id"
    ON "user_deletion_log" ("original_user_id")`,
];

async function run() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log('Connected to database');

  try {
    await client.query(`CREATE TABLE IF NOT EXISTS "typeorm_migrations" (
      "id"         SERIAL  NOT NULL,
      "timestamp"  BIGINT  NOT NULL,
      "name"       VARCHAR NOT NULL,
      CONSTRAINT "PK_typeorm_migrations" PRIMARY KEY ("id")
    )`);

    const existing = await client.query(
      `SELECT 1 FROM "typeorm_migrations" WHERE "name" = $1 LIMIT 1`,
      [MIGRATION_NAME],
    );

    if (existing.rows.length > 0) {
      console.log(`Migration ${MIGRATION_NAME} already applied — skipping`);
      return;
    }

    await client.query('BEGIN');
    console.log(`Running migration: ${MIGRATION_NAME}`);

    for (const query of UP_QUERIES) {
      const preview = query.trim().split('\n')[0].trim().substring(0, 80);
      console.log(`  > ${preview}...`);
      await client.query(query);
    }

    await client.query(
      `INSERT INTO "typeorm_migrations" ("timestamp", "name") VALUES ($1, $2)`,
      [1749400000000, MIGRATION_NAME],
    );

    await client.query('COMMIT');
    console.log(`Migration ${MIGRATION_NAME} completed successfully`);

    // Verify tables exist
    const tables = ['trainer_profiles', 'coach_profiles', 'player_profiles', 'user_deletion_log'];
    for (const table of tables) {
      const result = await client.query(
        `SELECT 1 FROM information_schema.tables WHERE table_name = $1`,
        [table],
      );
      if (result.rows.length === 0) {
        console.error(`ERROR: Table ${table} was not created!`);
        process.exit(1);
      }
      console.log(`  ✓ Table "${table}" exists`);
    }
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
