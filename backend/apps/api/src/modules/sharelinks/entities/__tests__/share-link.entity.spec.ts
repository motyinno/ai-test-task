import { Test } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DatabaseModule } from '../../../../shared/database/database.module';
import { ShareLink, ShareLinkType } from '../share-link.entity';

describe('ShareLink entity', () => {
  let repo: Repository<ShareLink>;
  let moduleRef: any;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [DatabaseModule, TypeOrmModule.forFeature([ShareLink])],
    }).compile();
    moduleRef = mod;
    repo = mod.get(getRepositoryToken(ShareLink));
  });

  afterAll(async () => {
    await moduleRef?.close();
  });

  beforeEach(async () => {
    await repo.query('DELETE FROM share_links');
  });

  it('persists a static link with defaults', async () => {
    const link = await repo.save(
      repo.create({
        code: 'code-c1-static',
        type: ShareLinkType.STATIC,
        trainerId: 'trainer-1',
        createdBy: 'trainer-1',
      }),
    );
    expect(link.id).toMatch(/[0-9a-f-]{36}/);
    expect(link.active).toBe(true);
    expect(link.useCount).toBe(0);
    expect(link.expiresAt).toBeNull();
    expect(link.maxUses).toBeNull();
  });

  it('persists a unique link with maxUses and expiresAt', async () => {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const link = await repo.save(
      repo.create({
        code: 'code-c1-unique',
        type: ShareLinkType.UNIQUE,
        trainerId: 'trainer-1',
        createdBy: 'trainer-1',
        targetEmail: 'coach@example.com',
        maxUses: 1,
        expiresAt,
      }),
    );
    expect(link.maxUses).toBe(1);
    expect(link.expiresAt).toBeDefined();
    expect(link.targetEmail).toBe('coach@example.com');
  });

  it('enforces unique code', async () => {
    await repo.save(
      repo.create({
        code: 'dup-c1',
        type: ShareLinkType.STATIC,
        trainerId: 't',
        createdBy: 't',
      }),
    );
    await expect(
      repo.save(
        repo.create({
          code: 'dup-c1',
          type: ShareLinkType.STATIC,
          trainerId: 't',
          createdBy: 't',
        }),
      ),
    ).rejects.toThrow();
  });
});
