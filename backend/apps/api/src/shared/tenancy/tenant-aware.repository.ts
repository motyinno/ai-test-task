import {
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  Repository,
  UpdateResult,
  DeleteResult,
  DeepPartial,
  SelectQueryBuilder,
} from 'typeorm';
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
 *
 * H6: All read AND write paths are structurally scoped. Raw baseRepo access is not
 * exposed. The `withoutTenantScope` escape hatch is the only way to bypass tenant
 * filtering, and it is audited at the call site.
 *
 * C5: withoutTenantScope/setSystemContext is now honoured by scopedFind/scopedFindOne/
 * requireTrainerId — when isSystemContext() is true the trainerId WHERE is skipped.
 */
export abstract class TenantAwareRepository<T extends { trainerId?: string }> {
  private readonly _baseRepo: Repository<T>;
  protected readonly tenantCtx: TenantContextService;

  constructor(baseRepo: Repository<T>, tenantCtx: TenantContextService) {
    this._baseRepo = baseRepo;
    this.tenantCtx = tenantCtx;
  }

  // ─── Scoped read paths ────────────────────────────────────────────────────

  /**
   * Scoped find — automatically appends `WHERE trainerId = <active trainer>`.
   * When inside withoutTenantScope(), skips the filter (C5 fix).
   * Throws TenantContextMissingError if no context is active and not in system context.
   */
  async scopedFind(options: FindManyOptions<T>): Promise<T[]> {
    if (this.tenantCtx.isSystemContext()) {
      return this._baseRepo.find(options);
    }
    const trainerId = this.requireTrainerId();
    const where = Array.isArray(options.where)
      ? options.where.map((w) => ({ ...w, trainerId }))
      : { ...(options.where ?? {}), trainerId };
    return this._baseRepo.find({ ...options, where } as FindManyOptions<T>);
  }

  /**
   * Scoped findOne — automatically appends `WHERE trainerId = <active trainer>`.
   * When inside withoutTenantScope(), skips the filter (C5 fix).
   */
  async scopedFindOne(options: FindOneOptions<T>): Promise<T | null> {
    if (this.tenantCtx.isSystemContext()) {
      return this._baseRepo.findOne(options);
    }
    const trainerId = this.requireTrainerId();
    const where = Array.isArray(options.where)
      ? options.where.map((w) => ({ ...w, trainerId }))
      : { ...(options.where ?? {}), trainerId };
    return this._baseRepo.findOne({ ...options, where } as FindOneOptions<T>);
  }

  // ─── Scoped write paths (H6) ─────────────────────────────────────────────

  /**
   * Scoped save — injects the active trainerId onto the entity before persisting.
   * System context bypasses the injection (escape hatch for SA operations).
   */
  async scopedSave(entity: DeepPartial<T>): Promise<T> {
    if (!this.tenantCtx.isSystemContext()) {
      const trainerId = this.requireTrainerId();
      (entity as Record<string, unknown>)['trainerId'] = trainerId;
    }
    return this._baseRepo.save(entity as DeepPartial<T>);
  }

  /**
   * Scoped update — appends trainerId to the WHERE clause so cross-tenant rows
   * cannot be mutated even if the caller passes a different id.
   */
  async scopedUpdate(
    criteria: string | FindOptionsWhere<T>,
    partialEntity: Partial<T>,
  ): Promise<UpdateResult> {
    // TypeORM's update() types are complex; cast via unknown to satisfy strict generics.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update = (c: unknown, e: unknown) => this._baseRepo.update(c as any, e as any);
    if (this.tenantCtx.isSystemContext()) {
      return update(criteria, partialEntity);
    }
    const trainerId = this.requireTrainerId();
    const scopedCriteria =
      typeof criteria === 'string'
        ? { id: criteria, trainerId }
        : { ...(criteria as object), trainerId };
    return update(scopedCriteria, partialEntity);
  }

  /**
   * Scoped delete — appends trainerId to the WHERE clause.
   */
  async scopedDelete(criteria: string | FindOptionsWhere<T>): Promise<DeleteResult> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const del = (c: unknown) => this._baseRepo.delete(c as any);
    if (this.tenantCtx.isSystemContext()) {
      return del(criteria);
    }
    const trainerId = this.requireTrainerId();
    const scopedCriteria =
      typeof criteria === 'string'
        ? { id: criteria, trainerId }
        : { ...(criteria as object), trainerId };
    return del(scopedCriteria);
  }

  /**
   * Scoped count — appends trainerId to the WHERE clause.
   */
  async scopedCount(options?: FindManyOptions<T>): Promise<number> {
    if (this.tenantCtx.isSystemContext()) {
      return this._baseRepo.count(options);
    }
    const trainerId = this.requireTrainerId();
    const where = options?.where
      ? Array.isArray(options.where)
        ? options.where.map((w) => ({ ...w, trainerId }))
        : { ...(options.where as object), trainerId }
      : { trainerId };
    return this._baseRepo.count({ ...options, where } as FindManyOptions<T>);
  }

  /**
   * Scoped QueryBuilder — adds a WHERE trainerId condition.
   * Use for complex queries; the caller MUST NOT remove the trainerId condition.
   */
  scopedQueryBuilder(alias: string): SelectQueryBuilder<T> {
    const qb = this._baseRepo.createQueryBuilder(alias);
    if (!this.tenantCtx.isSystemContext()) {
      const trainerId = this.requireTrainerId();
      qb.andWhere(`${alias}.trainerId = :trainerId`, { trainerId });
    }
    return qb;
  }

  /**
   * Create entity (no persistence). Passthrough to base repo.
   * trainerId is injected by scopedSave when persisting.
   */
  create(entityLike: DeepPartial<T>): T {
    return this._baseRepo.create(entityLike);
  }

  // ─── Escape hatch ────────────────────────────────────────────────────────

  /**
   * Runs `fn` in a system context that bypasses the tenant filter.
   * MUST be audited by the caller — any use of this escape hatch requires an audit log entry.
   *
   * C5 fix: scopedFind/scopedFindOne/requireTrainerId now read isSystemContext() and
   * short-circuit when it is true.
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

  // ─── Internal helpers ─────────────────────────────────────────────────────

  private requireTrainerId(): string {
    const ctx = this.tenantCtx.get();
    if (!ctx?.trainerId) {
      throw new TenantContextMissingError();
    }
    return ctx.trainerId;
  }
}
