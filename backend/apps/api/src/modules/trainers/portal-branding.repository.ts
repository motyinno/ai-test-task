import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantAwareRepository } from '../../shared/tenancy/tenant-aware.repository';
import { TenantContextService } from '../../shared/tenancy/tenant-context.service';
import { PortalBranding } from './entities/portal-branding.entity';

/**
 * PortalBrandingRepository — scoped to the active tenant (G1).
 *
 * All reads/writes automatically include the `trainerId` WHERE clause via
 * TenantAwareRepository. The only escape hatch (withoutTenantScope) is used
 * internally for upsert (SA-originated or system-level operations).
 */
@Injectable()
export class PortalBrandingRepository extends TenantAwareRepository<PortalBranding> {
  constructor(
    @InjectRepository(PortalBranding)
    private readonly repo: Repository<PortalBranding>,
    tenantCtx: TenantContextService,
  ) {
    super(repo, tenantCtx);
  }

  /**
   * Find branding for the active trainer tenant.
   * Returns null if no row exists yet.
   */
  async findForActiveTenant(): Promise<PortalBranding | null> {
    return this.scopedFindOne({ where: {} as never });
  }

  /**
   * Find branding by explicit trainerId (system-context lookup — no tenant scope).
   * Used by the service when upserting from an authenticated trainer request.
   */
  async findByTrainerId(trainerId: string): Promise<PortalBranding | null> {
    return this.withoutTenantScope(() =>
      this.repo.findOne({ where: { trainerId } }),
    );
  }

  /**
   * Upsert branding for a trainer.
   * If a row already exists for the trainerId, updates it.
   * If none exists, creates a new one.
   */
  async upsert(trainerId: string, partial: Partial<PortalBranding>): Promise<PortalBranding> {
    return this.withoutTenantScope(async () => {
      let branding = await this.repo.findOne({ where: { trainerId } });
      if (branding) {
        Object.assign(branding, partial);
        return this.repo.save(branding);
      }
      branding = this.repo.create({ trainerId, ...partial });
      return this.repo.save(branding);
    });
  }
}
