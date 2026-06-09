import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './audit-log.entity';

export interface WriteAuditEntryOptions {
  /** The apparent actor performing the action */
  actorId: string;
  /** D6: real SA when under impersonation (null otherwise) */
  actingAdminId?: string | null;
  /** D6: open ImpersonationLog bracket id (null when not impersonating) */
  viaImpersonationLogId?: string | null;
  /** Action verb: "IMPERSONATION_START" | "IMPERSONATION_EXIT" | "USER_DELETED" | … */
  action: string;
  /** Entity kind, e.g. "ImpersonationLog", "User" */
  targetType?: string | null;
  /** Entity UUID */
  targetId?: string | null;
  /** Extra context */
  metadata?: Record<string, unknown> | null;
}

/**
 * AuditService — centralized cross-cutting audit writes (F1).
 *
 * Used by ImpersonationService (start/exit), UsersService (deletion),
 * and any future mutation that requires an audit trail or dual-actor
 * attribution (D6 / SEC-006).
 *
 * This service is SYNCHRONOUS with the calling transaction where
 * possible — callers should either await it or pass it a repository
 * to share the same EntityManager.
 */
@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepo: Repository<AuditLog>,
  ) {}

  async write(opts: WriteAuditEntryOptions): Promise<AuditLog> {
    const entry = this.auditLogRepo.create({
      actorId: opts.actorId,
      actingAdminId: opts.actingAdminId ?? null,
      viaImpersonationLogId: opts.viaImpersonationLogId ?? null,
      action: opts.action,
      targetType: opts.targetType ?? null,
      targetId: opts.targetId ?? null,
      metadata: opts.metadata ?? null,
    });
    return this.auditLogRepo.save(entry);
  }
}
