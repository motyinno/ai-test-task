/**
 * Unified migration runner — Phase A + Phase B.
 *
 * Single source of truth for all schema migrations (M4 fix).
 * run-phase-b-migrations.mjs has been removed; this file now covers both phases.
 *
 * Prerequisite: PostgreSQL must have the uuid-ossp extension enabled:
 *   CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
 *
 * Usage (from backend/ directory):
 *   DATABASE_URL=postgresql://... node apps/api/src/shared/database/run-migrations.mjs
 *
 * Or (auto-loads .env.test when DATABASE_URL is not set):
 *   node apps/api/src/shared/database/run-migrations.mjs
 *
 * Idempotent: uses IF NOT EXISTS / DO blocks and checks typeorm_migrations table
 * before running each migration.
 *
 * Phase A prerequisite: uuid extension + base tables (users, sessions, etc.)
 * Phase B prerequisite: Phase A must be applied first.
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

// ── Phase A: Foundation ───────────────────────────────────────────────────────

const PHASE_A_MIGRATION_NAME = 'PhaseAFoundation1749340000000';

const PHASE_A_QUERIES = [
  // Prerequisite: uuid extension (idempotent)
  `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`,

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

// ── Phase B: Profiles ────────────────────────────────────────────────────────


const PHASE_B_MIGRATION_NAME = 'PhaseBProfiles1749400000000';

const PHASE_B_QUERIES = [
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

  /*
   * NOTE: parent_user_id intentionally has no FK constraint (D7 GDPR design):
   * when a parent user is anonymized, the child PlayerProfile row must remain
   * intact. A hard FK would prevent anonymization without deleting the child.
   * Relationship integrity is maintained at the service layer.
   */
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

// ── Phase C: ShareLinks & Invitations ─────────────────────────────────────────

const PHASE_C_MIGRATION_NAME = 'PhaseCShareLinks1749500000000';

const PHASE_C_QUERIES = [
  // share_links_type_enum
  `DO $$ BEGIN
    CREATE TYPE "public"."share_links_type_enum" AS ENUM('STATIC', 'UNIQUE');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$`,

  // share_links
  `CREATE TABLE IF NOT EXISTS "share_links" (
    "id"           UUID                                 NOT NULL DEFAULT uuid_generate_v4(),
    "code"         CHARACTER VARYING                    NOT NULL,
    "type"         "public"."share_links_type_enum"    NOT NULL,
    "trainer_id"   UUID                                 NOT NULL,
    "created_by"   UUID                                 NOT NULL,
    "target_email" CHARACTER VARYING                    NULL DEFAULT NULL,
    "expires_at"   TIMESTAMP                            NULL DEFAULT NULL,
    "max_uses"     INTEGER                              NULL DEFAULT NULL,
    "use_count"    INTEGER                              NOT NULL DEFAULT 0,
    "active"       BOOLEAN                              NOT NULL DEFAULT TRUE,
    "created_at"   TIMESTAMP                            NOT NULL DEFAULT NOW(),
    "updated_at"   TIMESTAMP                            NOT NULL DEFAULT NOW(),
    CONSTRAINT "PK_share_links" PRIMARY KEY ("id"),
    CONSTRAINT "UQ_share_links_code" UNIQUE ("code")
  )`,

  `CREATE INDEX IF NOT EXISTS "IDX_share_links_trainer_id" ON "share_links" ("trainer_id")`,

  // association_status_enum
  `DO $$ BEGIN
    CREATE TYPE "public"."association_status_enum" AS ENUM('ACTIVE', 'REMOVED');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$`,

  // trainer_player_associations
  `CREATE TABLE IF NOT EXISTS "trainer_player_associations" (
    "id"                UUID                                    NOT NULL DEFAULT uuid_generate_v4(),
    "trainer_id"        UUID                                    NOT NULL,
    "player_profile_id" UUID                                    NOT NULL,
    "via_share_link_id" UUID                                    NULL DEFAULT NULL,
    "status"            "public"."association_status_enum"      NOT NULL DEFAULT 'ACTIVE',
    "connected_at"      TIMESTAMP                               NOT NULL DEFAULT NOW(),
    CONSTRAINT "PK_trainer_player_associations" PRIMARY KEY ("id"),
    CONSTRAINT "UQ_trainer_player" UNIQUE ("trainer_id", "player_profile_id")
  )`,

  `CREATE INDEX IF NOT EXISTS "IDX_tpa_trainer_id" ON "trainer_player_associations" ("trainer_id")`,
];

// ── Phase D: Player/Parent Family ─────────────────────────────────────────────

const PHASE_D_MIGRATION_NAME = 'PhaseDFamily1749600000000';

const PHASE_D_QUERIES = [
  // Add is_child column to player_profiles (idempotent)
  `DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'player_profiles' AND column_name = 'is_child'
    ) THEN
      ALTER TABLE "player_profiles" ADD COLUMN "is_child" BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;
  END $$`,

  // child_logins
  `CREATE TABLE IF NOT EXISTS "child_logins" (
    "id"                UUID                   NOT NULL DEFAULT uuid_generate_v4(),
    "child_profile_id"  UUID                   NOT NULL,
    "parent_user_id"    UUID                   NOT NULL,
    "child_username"    CHARACTER VARYING(50)  NOT NULL,
    "password_hash"     TEXT                   NOT NULL,
    "token_spend_allowed" BOOLEAN              NOT NULL DEFAULT FALSE,
    "is_active"         BOOLEAN                NOT NULL DEFAULT TRUE,
    "created_at"        TIMESTAMP              NOT NULL DEFAULT NOW(),
    "updated_at"        TIMESTAMP              NOT NULL DEFAULT NOW(),
    CONSTRAINT "PK_child_logins" PRIMARY KEY ("id"),
    CONSTRAINT "UQ_child_login_username" UNIQUE ("child_username"),
    CONSTRAINT "UQ_child_login_profile" UNIQUE ("child_profile_id")
  )`,

  `CREATE INDEX IF NOT EXISTS "IDX_child_login_username" ON "child_logins" ("child_username")`,

  `CREATE INDEX IF NOT EXISTS "IDX_child_login_parent_user_id" ON "child_logins" ("parent_user_id")`,

  // approval_status_enum
  `DO $$ BEGIN
    CREATE TYPE "public"."approval_status_enum" AS ENUM(
      'PENDING', 'APPROVED', 'DENIED', 'EXPIRED', 'CANCELLED'
    );
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$`,

  // payment_type_enum
  `DO $$ BEGIN
    CREATE TYPE "public"."payment_type_enum" AS ENUM('USD', 'TOKEN');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$`,

  // approval_requests
  `CREATE TABLE IF NOT EXISTS "approval_requests" (
    "id"                CHARACTER VARYING       NOT NULL DEFAULT uuid_generate_v4()::text,
    "child_profile_id"  CHARACTER VARYING       NOT NULL,
    "parent_user_id"    CHARACTER VARYING       NOT NULL,
    "event_ref"         CHARACTER VARYING       NULL DEFAULT NULL,
    "amount"            NUMERIC(12,2)           NULL DEFAULT NULL,
    "payment_type"      "public"."payment_type_enum"   NOT NULL,
    "status"            "public"."approval_status_enum" NOT NULL DEFAULT 'PENDING',
    "auto_approved"     BOOLEAN                 NOT NULL DEFAULT FALSE,
    "expires_at"        TIMESTAMP               NULL DEFAULT NULL,
    "resolved_at"       TIMESTAMP               NULL DEFAULT NULL,
    "resolved_by"       CHARACTER VARYING       NULL DEFAULT NULL,
    "parent_notes"      TEXT                    NULL DEFAULT NULL,
    "created_at"        TIMESTAMP               NOT NULL DEFAULT NOW(),
    "updated_at"        TIMESTAMP               NOT NULL DEFAULT NOW(),
    CONSTRAINT "PK_approval_requests" PRIMARY KEY ("id")
  )`,

  `CREATE INDEX IF NOT EXISTS "IDX_approval_status_expires" ON "approval_requests" ("status", "expires_at")`,

  `CREATE INDEX IF NOT EXISTS "IDX_approval_parent_status" ON "approval_requests" ("parent_user_id", "status")`,

  `CREATE INDEX IF NOT EXISTS "IDX_approval_child_status" ON "approval_requests" ("child_profile_id", "status")`,
];

// ── Runner ────────────────────────────────────────────────────────────────────

async function runMigration(client, name, timestamp, queries) {
  const existing = await client.query(
    `SELECT 1 FROM "typeorm_migrations" WHERE "name" = $1 LIMIT 1`,
    [name],
  );

  if (existing.rows.length > 0) {
    console.log(`Migration ${name} already applied — skipping`);
    return;
  }

  await client.query('BEGIN');
  console.log(`Running migration: ${name}`);

  for (const query of queries) {
    const preview = query.trim().split('\n')[0].trim().substring(0, 80);
    console.log(`  > ${preview}...`);
    await client.query(query);
  }

  await client.query(
    `INSERT INTO "typeorm_migrations" ("timestamp", "name") VALUES ($1, $2)`,
    [timestamp, name],
  );

  await client.query('COMMIT');
  console.log(`Migration ${name} completed successfully`);
}

async function run() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log('Connected to database');

  try {
    // Ensure migrations tracking table exists (outside transaction so it persists)
    await client.query(`CREATE TABLE IF NOT EXISTS "typeorm_migrations" (
      "id"         SERIAL  NOT NULL,
      "timestamp"  BIGINT  NOT NULL,
      "name"       VARCHAR NOT NULL,
      CONSTRAINT "PK_typeorm_migrations" PRIMARY KEY ("id")
    )`);

    // Phase A: Foundation (prerequisite for Phase B)
    await runMigration(client, PHASE_A_MIGRATION_NAME, 1749340000000, PHASE_A_QUERIES);

    // Phase B: Profiles
    await runMigration(client, PHASE_B_MIGRATION_NAME, 1749400000000, PHASE_B_QUERIES);

    // Phase C: ShareLinks & Invitations
    await runMigration(client, PHASE_C_MIGRATION_NAME, 1749500000000, PHASE_C_QUERIES);

    // Phase D: Player/Parent Family
    await runMigration(client, PHASE_D_MIGRATION_NAME, 1749600000000, PHASE_D_QUERIES);

    // Verify key tables exist
    const tables = [
      'users',
      'trainer_profiles',
      'coach_profiles',
      'player_profiles',
      'user_deletion_log',
      'share_links',
      'trainer_player_associations',
      'child_logins',
      'approval_requests',
    ];
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

    console.log('\nAll migrations applied successfully.');
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
