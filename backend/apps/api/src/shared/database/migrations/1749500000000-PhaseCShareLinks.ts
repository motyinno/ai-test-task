import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase C ShareLinks & Invitations Migration
 *
 * Creates tables:
 *   1. share_links              — opaque CSPRNG tokens for player & coach invitations (C1)
 *   2. trainer_player_associations — org-bound join between trainer and player (C6)
 *
 * Design notes:
 *   - share_links.code is UNIQUE (credential; DB is source of truth per D4)
 *   - trainer_player_associations has UQ(trainer_id, player_profile_id) for BR-005
 *   - share_links_type_enum: STATIC (player registration) | UNIQUE (coach invite)
 *   - association_status_enum: ACTIVE | REMOVED
 */
export class PhaseCShareLinks1749500000000 implements MigrationInterface {
  name = 'PhaseCShareLinks1749500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. share_links ──────────────────────────────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."share_links_type_enum" AS ENUM('STATIC', 'UNIQUE');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      CREATE TABLE "share_links" (
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
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_share_links_trainer_id" ON "share_links" ("trainer_id")
    `);

    // ── 2. trainer_player_associations ──────────────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."association_status_enum" AS ENUM('ACTIVE', 'REMOVED');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      CREATE TABLE "trainer_player_associations" (
        "id"                UUID                                    NOT NULL DEFAULT uuid_generate_v4(),
        "trainer_id"        UUID                                    NOT NULL,
        "player_profile_id" UUID                                    NOT NULL,
        "via_share_link_id" UUID                                    NULL DEFAULT NULL,
        "status"            "public"."association_status_enum"      NOT NULL DEFAULT 'ACTIVE',
        "connected_at"      TIMESTAMP                               NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_trainer_player_associations" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_trainer_player" UNIQUE ("trainer_id", "player_profile_id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_tpa_trainer_id" ON "trainer_player_associations" ("trainer_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_tpa_trainer_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "trainer_player_associations"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."association_status_enum"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_share_links_trainer_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "share_links"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."share_links_type_enum"`);
  }
}
