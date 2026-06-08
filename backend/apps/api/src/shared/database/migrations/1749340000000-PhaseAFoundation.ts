import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase A Foundation Migration (C4)
 *
 * Creates all Phase A tables:
 *   1. users                      — core user accounts (D7 anonymization fields included)
 *   2. password_reset_tokens      — single-use, 1h expiry (SEC-005)
 *   3. email_verification_tokens  — single-use, 24h expiry (D3)
 *   4. sessions                   — connect-pg-simple session store (express-session)
 *   5. typeorm_migrations         — managed by TypeORM itself (auto-created, listed for clarity)
 *   6. test_tenant_items          — test-only entity for Phase A smoke e2e (A19)
 *
 * Designed to run with synchronize: false on a clean database.
 */
export class PhaseAFoundation1749340000000 implements MigrationInterface {
  name = 'PhaseAFoundation1749340000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. users ────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE "public"."users_role_enum" AS ENUM(
        'SUPER_ADMIN', 'TRAINER', 'COACH', 'PLAYER'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."users_status_enum" AS ENUM(
        'ACTIVE', 'INACTIVE', 'DELETED'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "users" (
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
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_users_email" ON "users" ("email")
    `);

    // ── 2. password_reset_tokens ────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "password_reset_tokens" (
        "id"         UUID      NOT NULL DEFAULT uuid_generate_v4(),
        "token"      TEXT      NOT NULL,
        "user_id"    UUID      NOT NULL,
        "expires_at" TIMESTAMP NOT NULL,
        "used_at"    TIMESTAMP NULL DEFAULT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_password_reset_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "FK_password_reset_tokens_user"
          FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_password_reset_tokens_token" ON "password_reset_tokens" ("token")
    `);

    // ── 3. email_verification_tokens ────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "email_verification_tokens" (
        "id"         UUID      NOT NULL DEFAULT uuid_generate_v4(),
        "token"      TEXT      NOT NULL,
        "user_id"    UUID      NOT NULL,
        "expires_at" TIMESTAMP NOT NULL,
        "used_at"    TIMESTAMP NULL DEFAULT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_email_verification_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "FK_email_verification_tokens_user"
          FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_email_verification_tokens_token"
        ON "email_verification_tokens" ("token")
    `);

    // ── 4. sessions (connect-pg-simple) ──────────────────────────────────────
    // Standard schema from connect-pg-simple documentation.
    // The `sid` column stores the session ID; `sess` is the JSON session data;
    // `expire` is used by the store for TTL-based cleanup.
    await queryRunner.query(`
      CREATE TABLE "sessions" (
        "sid"    VARCHAR        NOT NULL,
        "sess"   JSON           NOT NULL,
        "expire" TIMESTAMP(6)  NOT NULL,
        CONSTRAINT "PK_sessions" PRIMARY KEY ("sid")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_sessions_expire" ON "sessions" ("expire")
    `);

    // ── 5. test_tenant_items (test-only, A19 smoke gate) ─────────────────────
    // Created in all environments so migration:run on a clean DB always succeeds.
    // The table is only populated and used in test environment.
    await queryRunner.query(`
      CREATE TABLE "test_tenant_items" (
        "id"         UUID                   NOT NULL DEFAULT uuid_generate_v4(),
        "trainer_id" CHARACTER VARYING(255) NOT NULL,
        "name"       CHARACTER VARYING(255) NOT NULL,
        CONSTRAINT "PK_test_tenant_items" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "test_tenant_items"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_sessions_expire"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sessions"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_email_verification_tokens_token"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "email_verification_tokens"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_password_reset_tokens_token"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "password_reset_tokens"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_users_email"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."users_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."users_role_enum"`);
  }
}
