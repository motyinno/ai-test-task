import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, ILike } from 'typeorm';
import { User, UserStatus } from './entities/user.entity';
import { UserDeletionLog } from './entities/user-deletion-log.entity';
import { ListUsersQueryDto } from './dto/list-users-query.dto';

/**
 * UsersRepository — global entity (no tenant scope needed for SA operations).
 *
 * SA always uses system context (withoutTenantScope) via the service layer;
 * this repository does NOT extend TenantAwareRepository since User is a
 * global entity (A1 architecture decision).
 */
@Injectable()
export class UsersRepository {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
    @InjectRepository(UserDeletionLog)
    private readonly deletionLogRepo: Repository<UserDeletionLog>,
    private readonly dataSource: DataSource,
  ) {}

  async findById(id: string): Promise<User | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.repo.findOne({ where: { email } });
  }

  async save(user: Partial<User>): Promise<User> {
    return this.repo.save(user as User);
  }

  async create(data: Partial<User>): Promise<User> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async update(id: string, data: Partial<User>): Promise<void> {
    await this.repo.update(id, data);
  }

  /**
   * B2: Paginated directory with search + role + status filters.
   * SA uses system context — no tenant filtering.
   */
  async findPaginated(
    query: ListUsersQueryDto,
  ): Promise<{ data: User[]; total: number }> {
    const { page, limit, search, role, status } = query;
    const skip = (page - 1) * limit;

    const qb = this.repo.createQueryBuilder('u');

    if (search) {
      qb.andWhere(
        '(u.email ILIKE :search OR CAST(u.id AS TEXT) ILIKE :search)',
        { search: `%${search}%` },
      );
    }
    if (role) {
      qb.andWhere('u.role = :role', { role });
    }
    if (status) {
      qb.andWhere('u.status = :status', { status });
    }

    qb.orderBy('u.createdAt', 'DESC').skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  /**
   * B6: GDPR anonymize in ONE transaction (D7 / US-01.13).
   * Overwrites all PII columns, sets anonymizedAt + status=DELETED,
   * and inserts a UserDeletionLog row in the same transaction.
   * Idempotent: if already anonymized, no-op (returns existing).
   */
  async anonymizeInTransaction(
    userId: string,
    opts: {
      originalEmail: string;
      deletedBy: string;
      reason: string;
    },
  ): Promise<User> {
    return this.dataSource.transaction(async (em) => {
      const user = await em.findOne(User, { where: { id: userId } });
      if (!user) {
        throw new Error(`User ${userId} not found`);
      }

      // Idempotent: already anonymized — return as-is
      if (user.anonymizedAt) {
        return user;
      }

      // Wipe PII in-place (D7)
      await em.update(User, userId, {
        email: `deleted_${userId}@example.com`,
        passwordHash: 'ANONYMIZED',
        anonymizedAt: new Date(),
        status: UserStatus.DELETED,
        lastLoginAt: null,
      });

      // Write audit log in same transaction
      const logEntry = em.create(UserDeletionLog, {
        originalUserId: userId,
        originalEmail: opts.originalEmail,
        deletedBy: opts.deletedBy,
        reason: opts.reason,
      });
      await em.save(UserDeletionLog, logEntry);

      // Return the updated user
      return em.findOne(User, { where: { id: userId } }) as Promise<User>;
    });
  }
}
