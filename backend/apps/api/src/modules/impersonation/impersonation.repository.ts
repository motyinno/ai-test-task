import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { ImpersonationLog } from './entities/impersonation-log.entity';
import { ImpersonationHistoryQueryDto } from './dto/impersonation.dto';

@Injectable()
export class ImpersonationRepository {
  constructor(
    @InjectRepository(ImpersonationLog)
    private readonly repo: Repository<ImpersonationLog>,
  ) {}

  /**
   * Open a new impersonation bracket (F3).
   * endAt + durationSeconds remain null until exit/auto-cap.
   */
  async openBracket(opts: {
    adminId: string;
    impersonatedUserId: string;
    startAt: Date;
  }): Promise<ImpersonationLog> {
    const log = this.repo.create({
      adminId: opts.adminId,
      impersonatedUserId: opts.impersonatedUserId,
      startAt: opts.startAt,
      endAt: null,
      durationSeconds: null,
    });
    return this.repo.save(log);
  }

  /**
   * Close the bracket for a given log id (F4).
   * Sets endAt + durationSeconds (integer seconds rounded down).
   */
  async closeBracket(id: string, endAt: Date): Promise<ImpersonationLog | null> {
    const log = await this.repo.findOne({ where: { id } });
    if (!log) return null;

    const durationSeconds = Math.floor(
      (endAt.getTime() - log.startAt.getTime()) / 1000,
    );

    await this.repo.update(id, {
      endAt,
      durationSeconds,
    });
    return this.repo.findOne({ where: { id } });
  }

  async findById(id: string): Promise<ImpersonationLog | null> {
    return this.repo.findOne({ where: { id } });
  }

  /**
   * Find the most-recent OPEN bracket (endAt IS NULL) for an admin+subject pair.
   * Used by exitImpersonation and dual-actor context building.
   */
  async findOpenBracket(
    adminId: string,
    impersonatedUserId: string,
  ): Promise<ImpersonationLog | null> {
    return this.repo
      .createQueryBuilder('il')
      .where('il.admin_id = :adminId', { adminId })
      .andWhere('il.impersonated_user_id = :impersonatedUserId', { impersonatedUserId })
      .andWhere('il.end_at IS NULL')
      .orderBy('il.start_at', 'DESC')
      .getOne();
  }

  /**
   * F6: Paginated history with optional adminId / impersonatedUserId filters.
   */
  async findPaginated(
    query: ImpersonationHistoryQueryDto,
  ): Promise<{ data: ImpersonationLog[]; total: number }> {
    const { page, limit, adminId, impersonatedUserId } = query;
    const skip = (page - 1) * limit;

    const where: FindOptionsWhere<ImpersonationLog> = {};
    if (adminId) where.adminId = adminId;
    if (impersonatedUserId) where.impersonatedUserId = impersonatedUserId;

    const [data, total] = await this.repo.findAndCount({
      where,
      order: { startAt: 'DESC' },
      skip,
      take: limit,
    });
    return { data, total };
  }
}
