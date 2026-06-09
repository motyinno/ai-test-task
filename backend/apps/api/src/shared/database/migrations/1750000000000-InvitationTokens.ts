import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Invitation tokens migration.
 *
 * Creates table:
 *   1. invitation_tokens — single-use account-onboarding tokens (7-day expiry).
 *
 * Used by the trainer invite flow (Super Admin creates a trainer in INVITE_LINK
 * mode → invitee sets their own password via /join-invite/:token).
 * Mirrors password_reset_tokens / email_verification_tokens (PhaseAFoundation).
 */
export class InvitationTokens1750000000000 implements MigrationInterface {
  name = 'InvitationTokens1750000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "invitation_tokens" (
        "id"         UUID      NOT NULL DEFAULT uuid_generate_v4(),
        "token"      TEXT      NOT NULL,
        "user_id"    UUID      NOT NULL,
        "expires_at" TIMESTAMP NOT NULL,
        "used_at"    TIMESTAMP NULL DEFAULT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_invitation_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "FK_invitation_tokens_user"
          FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_invitation_tokens_token"
        ON "invitation_tokens" ("token")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_invitation_tokens_token"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "invitation_tokens"`);
  }
}
