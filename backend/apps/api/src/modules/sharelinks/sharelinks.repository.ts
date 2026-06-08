import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial, EntityManager } from 'typeorm';
import { ShareLink } from './entities/share-link.entity';
import { TenantAwareRepository } from '../../shared/tenancy/tenant-aware.repository';
import { TenantContextService } from '../../shared/tenancy/tenant-context.service';

@Injectable()
export class ShareLinksRepository extends TenantAwareRepository<ShareLink> {
  constructor(
    @InjectRepository(ShareLink)
    private readonly repo: Repository<ShareLink>,
    tenantCtx: TenantContextService,
  ) {
    super(repo, tenantCtx);
  }

  /** Create and save a tenant-scoped ShareLink. */
  async createScoped(data: DeepPartial<ShareLink>): Promise<ShareLink> {
    return this.scopedSave(data);
  }

  /**
   * Find a share link by code — GLOBAL lookup (no tenant filter).
   * The code is the credential; visitor has no trainer context yet.
   * AUDITED escape hatch (A1).
   */
  async findByCode(code: string): Promise<ShareLink | null> {
    // GLOBAL lookup: the code is the credential; visitor has no trainer context.
    return this.withoutTenantScope(() =>
      // audited escape hatch (A1) — public validate/join endpoints use this
      this.scopedFindOne({ where: { code } as any }),
    );
  }

  /** Paginated list, scoped to active trainer. */
  async findPaginatedScoped(page: number, limit: number): Promise<{ data: ShareLink[]; total: number }> {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.scopedFind({ skip, take: limit, order: { createdAt: 'DESC' } } as any),
      this.scopedCount(),
    ]);
    return { data, total };
  }

  /**
   * Atomic single-use consume for UNIQUE links.
   * Returns true iff the link was still consumable (affected=1).
   * MUST be called inside the same transaction as the association write.
   */
  async consumeUnique(em: EntityManager, code: string): Promise<boolean> {
    const res = await em
      .createQueryBuilder()
      .update(ShareLink)
      .set({ useCount: () => 'use_count + 1' })
      .where(
        'code = :code AND active = true AND (expires_at IS NULL OR expires_at > now()) AND use_count < max_uses',
        { code },
      )
      .returning('id')
      .execute();
    return (res.affected ?? 0) === 1;
  }

  /**
   * Best-effort async increment for STATIC links (analytics only).
   * Never fails the join — fire-and-forget after commit (NFR-004).
   */
  async incrementUseCountBestEffort(id: string): Promise<void> {
    await this.repo.increment({ id }, 'useCount', 1);
  }
}
