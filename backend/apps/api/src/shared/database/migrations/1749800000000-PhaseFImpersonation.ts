import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase F: Impersonation + Audit Migration
 *
 * Creates tables:
 *   1. audit_logs         — generic cross-cutting audit channel (F1)
 *   2. impersonation_logs — bracketed impersonation session audit (F2)
 *
 * Design notes:
 *   - audit_logs.acting_admin_id: populated when action was performed under impersonation
 *     (D6 dual-actor attribution). NULL when acting directly.
 *   - audit_logs.via_impersonation_log_id: links audit entry to open ImpersonationLog bracket.
 *   - impersonation_logs: end_at / duration_seconds are NULL while bracket is open (active session).
 *   - Indexes on (admin_id) and (impersonated_user_id) for the history report (F6).
 *   - Hard rule: every column has explicit type (boot safety requirement).
 */
export class PhaseFImpersonation1749800000000 implements MigrationInterface {
  name = 'PhaseFImpersonation1749800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. audit_logs ─────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audit_logs" (
        "id"                        UUID                   NOT NULL DEFAULT uuid_generate_v4(),
        "actor_id"                  CHARACTER VARYING(255) NOT NULL,
        "acting_admin_id"           CHARACTER VARYING(255) NULL DEFAULT NULL,
        "via_impersonation_log_id"  CHARACTER VARYING(255) NULL DEFAULT NULL,
        "action"                    CHARACTER VARYING(100) NOT NULL,
        "target_type"               CHARACTER VARYING(100) NULL DEFAULT NULL,
        "target_id"                 CHARACTER VARYING(255) NULL DEFAULT NULL,
        "metadata"                  JSONB                  NULL DEFAULT NULL,
        "created_at"                TIMESTAMP              NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_audit_logs" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_audit_logs_actor_id"
        ON "audit_logs" ("actor_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_audit_logs_acting_admin_id"
        ON "audit_logs" ("acting_admin_id")
    `);

    // ── 2. impersonation_logs ─────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "impersonation_logs" (
        "id"                    UUID                   NOT NULL DEFAULT uuid_generate_v4(),
        "admin_id"              CHARACTER VARYING(255) NOT NULL,
        "impersonated_user_id"  CHARACTER VARYING(255) NOT NULL,
        "start_at"              TIMESTAMP              NOT NULL,
        "end_at"                TIMESTAMP              NULL DEFAULT NULL,
        "duration_seconds"      INTEGER                NULL DEFAULT NULL,
        "created_at"            TIMESTAMP              NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_impersonation_logs" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_impersonation_logs_admin_id"
        ON "impersonation_logs" ("admin_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_impersonation_logs_impersonated_user_id"
        ON "impersonation_logs" ("impersonated_user_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_impersonation_logs_impersonated_user_id"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_impersonation_logs_admin_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "impersonation_logs"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_logs_acting_admin_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_logs_actor_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs"`);
  }
}
