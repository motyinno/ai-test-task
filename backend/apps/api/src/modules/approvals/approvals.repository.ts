import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager, LessThan } from 'typeorm';
import { ApprovalRequest, ApprovalStatus } from './entities/approval-request.entity';

export interface ListApprovalsOptions {
  parentUserId: string;
  status?: ApprovalStatus;
  childProfileId?: string;
  page: number;
  limit: number;
}

@Injectable()
export class ApprovalsRepository {
  constructor(
    @InjectRepository(ApprovalRequest)
    private readonly repo: Repository<ApprovalRequest>,
  ) {}

  async save(req: ApprovalRequest): Promise<ApprovalRequest> {
    return this.repo.save(req);
  }

  async create(data: Partial<ApprovalRequest>): Promise<ApprovalRequest> {
    return this.repo.save(this.repo.create(data));
  }

  async findById(id: string): Promise<ApprovalRequest | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByParent(opts: ListApprovalsOptions): Promise<[ApprovalRequest[], number]> {
    const where: Record<string, unknown> = { parentUserId: opts.parentUserId };
    if (opts.status) where['status'] = opts.status;
    if (opts.childProfileId) where['childProfileId'] = opts.childProfileId;

    return this.repo.findAndCount({
      where: where as any,
      order: { createdAt: 'DESC' },
      skip: (opts.page - 1) * opts.limit,
      take: opts.limit,
    });
  }

  /**
   * Race-safe terminal-state guard: only transitions a PENDING row.
   * Returns the number of rows affected (0 = already terminal → 409).
   */
  async guardedTransition(
    id: string,
    newStatus: ApprovalStatus.APPROVED | ApprovalStatus.DENIED | ApprovalStatus.CANCELLED,
    resolvedBy: string | null,
    parentNotes: string | null,
  ): Promise<number> {
    const result = await this.repo.update(
      { id, status: ApprovalStatus.PENDING },
      {
        status: newStatus,
        resolvedAt: new Date(),
        resolvedBy,
        parentNotes,
      },
    );
    return result.affected ?? 0;
  }

  /**
   * Expiry sweep: atomically transitions all stale Pending rows to Expired.
   * Idempotent guarded UPDATE (WHERE status='Pending' AND expiresAt < now()).
   * Returns the number of rows transitioned.
   */
  async expireStale(em?: EntityManager): Promise<number> {
    const repo = em ? em.getRepository(ApprovalRequest) : this.repo;
    const result = await repo
      .createQueryBuilder()
      .update(ApprovalRequest)
      .set({ status: ApprovalStatus.EXPIRED, resolvedAt: new Date() })
      .where('status = :status', { status: ApprovalStatus.PENDING })
      .andWhere('expires_at < NOW()')
      .andWhere('auto_approved = false')
      .execute();
    return result.affected ?? 0;
  }

  async findExpiredPending(): Promise<ApprovalRequest[]> {
    return this.repo.find({
      where: {
        status: ApprovalStatus.PENDING,
        autoApproved: false,
        expiresAt: LessThan(new Date()),
      },
    });
  }
}
