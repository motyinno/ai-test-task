import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase B Profiles Migration
 *
 * Creates all Phase B tables:
 *   1. trainer_profiles  — 1:1 with users (role=TRAINER)
 *   2. coach_profiles    — 1:1 with users (role=COACH), org-bound (trainerId)
 *   3. player_profiles   — 1:1 with users (role=PLAYER), parentUserId for child accounts
 *   4. user_deletion_log — GDPR audit log (B6)
 *
 * Open gaps flagged:
 *   Q-01.01 skill_level enum — stored as VARCHAR until values are defined
 *   Epic-05 Stripe fields on trainer_profiles — nullable placeholder column
 */
export class PhaseBProfiles1749400000000 implements MigrationInterface {
  name = 'PhaseBProfiles1749400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. trainer_profiles ─────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "trainer_profiles" (
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
      )
    `);

    // ── 2. coach_profiles ───────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "coach_profiles" (
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
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_coach_profiles_trainer_id" ON "coach_profiles" ("trainer_id")
    `);

    // ── 3. player_profiles ──────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE "public"."player_profiles_gender_enum" AS ENUM('MALE', 'FEMALE', 'OTHER')
    `);

    await queryRunner.query(`
      CREATE TABLE "player_profiles" (
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
      )
    `);

    /*
     * NOTE: parent_user_id intentionally does NOT have a FK constraint here.
     * This is by design (D7 GDPR): when a parent user is anonymized, the child
     * PlayerProfile row must remain intact (FKs preserved, no cascade delete).
     * A hard FK would prevent anonymization without deleting the child. The
     * relationship integrity is maintained at the service layer.
     */
    await queryRunner.query(`
      CREATE INDEX "IDX_player_profiles_parent_user_id" ON "player_profiles" ("parent_user_id")
    `);

    // ── 4. user_deletion_log ─────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "user_deletion_log" (
        "id"               UUID                   NOT NULL DEFAULT uuid_generate_v4(),
        "original_user_id" UUID                   NOT NULL,
        "original_email"   TEXT                   NOT NULL,
        "deleted_by"       UUID                   NOT NULL,
        "reason"           TEXT                   NOT NULL,
        "deleted_at"       TIMESTAMP              NOT NULL DEFAULT NOW(),
        "backup_ref"       TEXT                   NULL DEFAULT NULL,
        CONSTRAINT "PK_user_deletion_log" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_user_deletion_log_original_user_id"
        ON "user_deletion_log" ("original_user_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_deletion_log_original_user_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_deletion_log"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_player_profiles_parent_user_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "player_profiles"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."player_profiles_gender_enum"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_coach_profiles_trainer_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "coach_profiles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "trainer_profiles"`);
  }
}
