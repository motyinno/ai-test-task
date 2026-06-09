import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase D: Player/Parent Family Migration
 *
 * Creates tables:
 *   1. child_logins           — constrained sub-credential tied to a parent (D5)
 *   2. approval_requests      — USD/TOKEN approval state machine (D7)
 *
 * Alters tables:
 *   1. player_profiles        — adds is_child BOOLEAN column (D2)
 *
 * Design notes:
 *   - child_logins.child_username is UNIQUE (one per child profile)
 *   - child_logins.child_profile_id is UNIQUE (one login per child)
 *   - approval_requests has composite indexes for expiry sweep + parent queue + per-child view
 *   - approval_status_enum: PENDING | APPROVED | DENIED | EXPIRED | CANCELLED
 *   - payment_type_enum: USD | TOKEN
 *   - Hard rule: every column has explicit type to survive tsc startup
 */
export class PhaseDFamily1749600000000 implements MigrationInterface {
  name = 'PhaseDFamily1749600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Add is_child to player_profiles ─────────────────────────────────
    // Check if column already exists (idempotent)
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'player_profiles' AND column_name = 'is_child'
        ) THEN
          ALTER TABLE "player_profiles" ADD COLUMN "is_child" BOOLEAN NOT NULL DEFAULT FALSE;
        END IF;
      END $$
    `);

    // ── 2. child_logins ─────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "child_logins" (
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
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_child_login_username"
        ON "child_logins" ("child_username")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_child_login_parent_user_id"
        ON "child_logins" ("parent_user_id")
    `);

    // ── 3. approval_requests ────────────────────────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."approval_status_enum" AS ENUM(
          'PENDING', 'APPROVED', 'DENIED', 'EXPIRED', 'CANCELLED'
        );
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."payment_type_enum" AS ENUM('USD', 'TOKEN');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "approval_requests" (
        "id"                UUID                                    NOT NULL DEFAULT uuid_generate_v4(),
        "child_profile_id"  CHARACTER VARYING                       NOT NULL,
        "parent_user_id"    CHARACTER VARYING                       NOT NULL,
        "event_ref"         CHARACTER VARYING                       NULL DEFAULT NULL,
        "amount"            NUMERIC(12,2)                           NULL DEFAULT NULL,
        "payment_type"      "public"."payment_type_enum"           NOT NULL,
        "status"            "public"."approval_status_enum"        NOT NULL DEFAULT 'PENDING',
        "auto_approved"     BOOLEAN                                 NOT NULL DEFAULT FALSE,
        "expires_at"        TIMESTAMP                               NULL DEFAULT NULL,
        "resolved_at"       TIMESTAMP                               NULL DEFAULT NULL,
        "resolved_by"       CHARACTER VARYING                       NULL DEFAULT NULL,
        "parent_notes"      TEXT                                    NULL DEFAULT NULL,
        "created_at"        TIMESTAMP                               NOT NULL DEFAULT NOW(),
        "updated_at"        TIMESTAMP                               NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_approval_requests" PRIMARY KEY ("id")
      )
    `);

    // Indexes per spec (D5 / Q6):
    //   (status, expires_at) — cheap expiry sweep
    //   (parent_user_id, status) — parent queue view
    //   (child_profile_id, status) — per-child view
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_approval_status_expires"
        ON "approval_requests" ("status", "expires_at")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_approval_parent_status"
        ON "approval_requests" ("parent_user_id", "status")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_approval_child_status"
        ON "approval_requests" ("child_profile_id", "status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // approval_requests
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_approval_child_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_approval_parent_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_approval_status_expires"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "approval_requests"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."payment_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."approval_status_enum"`);

    // child_logins
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_child_login_parent_user_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_child_login_username"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "child_logins"`);

    // player_profiles.is_child
    await queryRunner.query(`
      ALTER TABLE "player_profiles" DROP COLUMN IF EXISTS "is_child"
    `);
  }
}
