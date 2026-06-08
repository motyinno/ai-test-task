import { FindManyOptions, FindOneOptions, Repository } from 'typeorm';
import { TenantContextService } from './tenant-context.service';

/**
 * Error thrown when a scoped query is attempted without an active tenant context.
 */
export class TenantContextMissingError extends Error {
  constructor() {
    super('TenantContext is required for this operation but was not set.');
    this.name = 'TenantContextMissingError';
  }
}

/**
 * Org-bound entities carry a `trainerId` column and must go through TenantAwareRepository.
 * Global entities (User, Session, ImpersonationLog, etc.) do NOT extend this base.
 *
 * Org-bound entities: TrainerPlayerAssociation, ShareLink, CoachProfile, Availability,
 * ApprovalRequest, PortalBranding, CoachAvailabilityOverride.
 */
export abstract class TenantAwareRepository<T extends { trainerId?: string }> {
  protected readonly baseRepo: Repository<T>;
  protected readonly tenantCtx: TenantContextService;

  constructor(baseRepo: Repository<T>, tenantCtx: TenantContextService) {
    this.baseRepo = baseRepo;
    this.tenantCtx = tenantCtx;
  }

  /**
   * Scoped find — automatically appends `WHERE trainerId = <active trainer>`.
   * Throws TenantContextMissingError if no context is active.
   */
  async scopedFind(options: FindManyOptions<T>): Promise<T[]> {
    const trainerId = this.requireTrainerId();
    const where = Array.isArray(options.where)
      ? options.where.map((w) => ({ ...w, trainerId }))
      : { ...(options.where ?? {}), trainerId };
    return this.baseRepo.find({ ...options, where } as FindManyOptions<T>);
  }

  /**
   * Scoped findOne — automatically appends `WHERE trainerId = <active trainer>`.
   */
  async scopedFindOne(options: FindOneOptions<T>): Promise<T | null> {
    const trainerId = this.requireTrainerId();
    const where = Array.isArray(options.where)
      ? options.where.map((w) => ({ ...w, trainerId }))
      : { ...(options.where ?? {}), trainerId };
    return this.baseRepo.findOne({ ...options, where } as FindOneOptions<T>);
  }

  /**
   * Runs `fn` in a system context that bypasses the tenant filter.
   * MUST be audited by the caller — any use of this escape hatch requires an audit log entry.
   */
  async withoutTenantScope<R>(fn: () => Promise<R>): Promise<R> {
    const previous = this.tenantCtx.isSystemContext();
    this.tenantCtx.setSystemContext(true);
    try {
      return await fn();
    } finally {
      this.tenantCtx.setSystemContext(previous);
    }
  }

  private requireTrainerId(): string {
    const ctx = this.tenantCtx.get();
    if (!ctx?.trainerId) {
      throw new TenantContextMissingError();
    }
    return ctx.trainerId;
  }
}
