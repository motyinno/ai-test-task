import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * PortalBranding — per-trainer white-label customisation (G1).
 *
 * One row per trainer (trainerId UNIQUE). Org-bound entity — extends the structural
 * tenant filter via trainerId. The PortalBrandingRepository scopes all reads/writes
 * to the active TenantContext.
 *
 * Fields:
 *   - primaryColorHex: CSS hex colour (e.g. "#FF5A1F") — validated by UpdateBrandingDto.
 *   - logoUrl: URL returned by StorageService.put() after a logo upload.
 *                Nullable — trainers may have a colour without a logo.
 *
 * Hard rule: every column has an explicit `type:` so the app boots without
 * TypeORM inferred-type warnings.
 */
@Entity('portal_brandings')
@Index('IDX_portal_branding_trainer_id', ['trainerId'], { unique: true })
export class PortalBranding {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Org scope — FK to users.id (TRAINER role). */
  @Column({ name: 'trainer_id', type: 'varchar' })
  trainerId!: string;

  /**
   * CSS hex colour code, 7 chars (e.g. "#FF5A1F").
   * Default: PracticePerfect brand primary (per DESIGN_TOKENS.md).
   */
  @Column({
    name: 'primary_color_hex',
    type: 'varchar',
    length: 7,
    default: '#2563EB',
  })
  primaryColorHex: string = '#2563EB';

  /**
   * Logo URL returned by StorageService — nullable.
   * NULL = no custom logo; the frontend uses the default PracticePerfect logo.
   */
  @Column({ name: 'logo_url', type: 'varchar', nullable: true, default: null })
  logoUrl: string | null = null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;
}
