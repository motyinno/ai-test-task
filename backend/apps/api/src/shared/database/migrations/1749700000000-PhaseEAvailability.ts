import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase E: Availability Migration
 *
 * Creates tables:
 *   1. availability_slots          — per-profile (player + coach) weekly recurring slots (E1)
 *   2. coach_availability_overrides — audit log for BR-016 override with reason (E5)
 *
 * Design notes:
 *   - availability_subject_type_enum: COACH | PLAYER (subjectId points to respective profile)
 *   - day_of_week_enum: MON | TUE | WED | THU | FRI | SAT | SUN
 *   - trainerId on availability_slots enables TenantAwareRepository structural filtering (A1)
 *   - No FK from subject_id → profiles (loose reference; GDPR anonymization safety, D7)
 *   - coach_availability_overrides: eventId nullable until Epic-02 event domain is built
 *   - BR-016: reason is NOT NULL (non-empty enforced at service layer)
 *   - Hard rule: every column has explicit type (boot safety requirement)
 */
export class PhaseEAvailability1749700000000 implements MigrationInterface {
  name = 'PhaseEAvailability1749700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Enums ──────────────────────────────────────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."availability_subject_type_enum" AS ENUM('COACH', 'PLAYER');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."day_of_week_enum" AS ENUM(
          'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'
        );
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    // ── 2. availability_slots ─────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "availability_slots" (
        "id"           UUID                                          NOT NULL DEFAULT uuid_generate_v4(),
        "trainer_id"   CHARACTER VARYING                            NOT NULL,
        "subject_type" "public"."availability_subject_type_enum"   NOT NULL,
        "subject_id"   CHARACTER VARYING                            NOT NULL,
        "day_of_week"  "public"."day_of_week_enum"                 NOT NULL,
        "start_time"   CHARACTER VARYING(5)                         NOT NULL,
        "end_time"     CHARACTER VARYING(5)                         NOT NULL,
        "is_available" BOOLEAN                                      NOT NULL DEFAULT TRUE,
        "created_at"   TIMESTAMP                                    NOT NULL DEFAULT NOW(),
        "updated_at"   TIMESTAMP                                    NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_availability_slots" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_availability_subject"
        ON "availability_slots" ("subject_type", "subject_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_availability_trainer"
        ON "availability_slots" ("trainer_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_availability_trainer_subject"
        ON "availability_slots" ("trainer_id", "subject_type")
    `);

    // ── 3. coach_availability_overrides ──────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "coach_availability_overrides" (
        "id"                       UUID                   NOT NULL DEFAULT uuid_generate_v4(),
        "coach_id"                 CHARACTER VARYING      NOT NULL,
        "overridden_by_trainer_id" CHARACTER VARYING      NOT NULL,
        "event_id"                 CHARACTER VARYING      NULL DEFAULT NULL,
        "reason"                   TEXT                   NOT NULL,
        "created_at"               TIMESTAMP              NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_coach_availability_overrides" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cao_coach_id"
        ON "coach_availability_overrides" ("coach_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cao_trainer_id"
        ON "coach_availability_overrides" ("overridden_by_trainer_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cao_trainer_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cao_coach_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "coach_availability_overrides"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_availability_trainer_subject"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_availability_trainer"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_availability_subject"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "availability_slots"`);

    await queryRunner.query(`DROP TYPE IF EXISTS "public"."day_of_week_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."availability_subject_type_enum"`);
  }
}
