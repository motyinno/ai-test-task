import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase G1: Portal Branding Migration
 *
 * Creates table:
 *   1. portal_brandings — per-trainer white-label branding (G1)
 *
 * Design notes:
 *   - trainerId is UNIQUE (one branding row per trainer, upsert pattern)
 *   - logoUrl is nullable (trainers can set colour without a logo)
 *   - primaryColorHex VARCHAR(7) — e.g. "#2563EB"
 *   - Hard rule: every column has explicit type (boot safety requirement)
 *
 * Phase G2: Indexing pass — additional indexes for trainer_profiles, player_profiles,
 *   and approval_requests that are genuinely missing from prior migrations.
 *
 * Phase G2 audit (indexes already present vs added here):
 *
 *   ALREADY PRESENT (no action needed):
 *     - UQ_users_email                 (PhaseAFoundation)
 *     - IDX_sessions_expire            (PhaseAFoundation)
 *     - IDX_coach_profiles_trainer_id  (PhaseBProfiles)
 *     - IDX_player_profiles_parent_user_id (PhaseBProfiles)
 *     - IDX_share_links_trainer_id     (PhaseCShareLinks)
 *     - UQ_trainer_player              (PhaseCShareLinks) — composite UNIQUE (trainerId, playerProfileId)
 *     - IDX_tpa_trainer_id             (PhaseCShareLinks)
 *     - IDX_approval_status_expires    (PhaseDFamily)
 *     - IDX_approval_parent_status     (PhaseDFamily)
 *     - IDX_approval_child_status      (PhaseDFamily)
 *     - IDX_availability_trainer       (PhaseEAvailability)
 *     - IDX_availability_trainer_subject (PhaseEAvailability)
 *     - IDX_audit_logs_actor_id        (PhaseFImpersonation)
 *     - IDX_impersonation_logs_admin_id (PhaseFImpersonation)
 *     - IDX_impersonation_logs_impersonated_user_id (PhaseFImpersonation)
 *
 *   GENUINELY MISSING (added here):
 *     - IDX_portal_branding_trainer_id   (UNIQUE) — this migration
 *     - IDX_trainer_profiles_user_id     — already a UNIQUE constraint but no explicit index name
 *       → Adding named index for visibility (does not duplicate the UNIQUE constraint work)
 *     - IDX_tpa_player_profile_id        — trainer_player_associations.player_profile_id
 *       (currently only trainerId is indexed; a lookup by player needs this index)
 *
 * Note: trainer_profiles has UQ_trainer_profiles_user_id (unique constraint) which doubles
 * as an index in Postgres — already sufficient for equality lookups. We skip adding a
 * redundant btree index there and focus on the player_profile_id lookup gap.
 */
export class PhaseGBranding1749900000000 implements MigrationInterface {
  name = 'PhaseGBranding1749900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── G1: portal_brandings ──────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "portal_brandings" (
        "id"                  UUID                   NOT NULL DEFAULT uuid_generate_v4(),
        "trainer_id"          CHARACTER VARYING(255) NOT NULL,
        "primary_color_hex"   CHARACTER VARYING(7)   NOT NULL DEFAULT '#2563EB',
        "logo_url"            CHARACTER VARYING(2048) NULL DEFAULT NULL,
        "created_at"          TIMESTAMP              NOT NULL DEFAULT NOW(),
        "updated_at"          TIMESTAMP              NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_portal_brandings" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_portal_branding_trainer_id"
        ON "portal_brandings" ("trainer_id")
    `);

    // ── G2: Missing indexes ───────────────────────────────────────────────────

    // trainer_player_associations.player_profile_id — needed for reverse lookups
    // (e.g. "which trainers is this player associated with?")
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_tpa_player_profile_id"
        ON "trainer_player_associations" ("player_profile_id")
    `);

    // approval_requests.trainer_id is not present because approvals are scoped via
    // parentUserId/childProfileId, not directly by trainerId — no gap here.

    // child_logins is already indexed on child_username and parent_user_id — no gap.
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_tpa_player_profile_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_portal_branding_trainer_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "portal_brandings"`);
  }
}
