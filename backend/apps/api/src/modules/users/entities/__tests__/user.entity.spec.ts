import { Test } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DatabaseModule } from '../../../../shared/database/database.module';
import { User, UserRole, UserStatus } from '../user.entity';

describe('User entity', () => {
  let repo: Repository<User>;
  let moduleRef: any;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [DatabaseModule, TypeOrmModule.forFeature([User])],
    }).compile();
    moduleRef = mod;
    repo = mod.get(getRepositoryToken(User));
  });

  afterAll(async () => {
    await moduleRef?.close();
  });

  beforeEach(async () => {
    await repo.clear();
  });

  it('has required columns via entity metadata', () => {
    const meta = (repo as any).metadata;
    const colNames = meta.columns.map((c: any) => c.propertyName);
    expect(colNames).toContain('id');
    expect(colNames).toContain('email');
    expect(colNames).toContain('passwordHash');
    expect(colNames).toContain('role');
    expect(colNames).toContain('status');
    expect(colNames).toContain('anonymizedAt');
    expect(colNames).toContain('emailVerified');
    expect(colNames).toContain('mustChangePassword');
    expect(colNames).toContain('createdAt');
    expect(colNames).toContain('updatedAt');
  });

  it('saves a user and returns a UUID v4 id', async () => {
    const user = repo.create({
      email: 'test@example.com',
      passwordHash: 'hashed',
      role: UserRole.TRAINER,
      status: UserStatus.ACTIVE,
    });
    const saved = await repo.save(user);
    expect(saved.id).toBeDefined();
    expect(saved.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(saved.emailVerified).toBe(false);
    expect(saved.mustChangePassword).toBe(false);
    expect(saved.status).toBe(UserStatus.ACTIVE);
  });

  it('enforces unique email constraint', async () => {
    const user1 = repo.create({
      email: 'dup@example.com',
      passwordHash: 'hash1',
      role: UserRole.TRAINER,
      status: UserStatus.ACTIVE,
    });
    await repo.save(user1);

    const user2 = repo.create({
      email: 'dup@example.com',
      passwordHash: 'hash2',
      role: UserRole.COACH,
      status: UserStatus.ACTIVE,
    });
    await expect(repo.save(user2)).rejects.toThrow();
  });

  it('defaults status to ACTIVE when not provided', async () => {
    const user = repo.create({
      email: 'default-status@example.com',
      passwordHash: 'hash',
      role: UserRole.PLAYER,
    });
    const saved = await repo.save(user);
    expect(saved.status).toBe(UserStatus.ACTIVE);
  });
});
