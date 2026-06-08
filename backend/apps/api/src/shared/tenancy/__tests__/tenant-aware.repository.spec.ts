import { Test } from '@nestjs/testing';
import { ClsModule, ClsService } from 'nestjs-cls';
import { TenantContextService } from '../tenant-context.service';
import {
  TenantAwareRepository,
  TenantContextMissingError,
} from '../tenant-aware.repository';
import { DataSource, Repository } from 'typeorm';

// Minimal test entity
class TestEntity {
  id!: string;
  trainerId!: string;
  name!: string;
}

// Concrete implementation of TenantAwareRepository for testing
class TestRepository extends TenantAwareRepository<TestEntity> {
  constructor(
    repo: Repository<TestEntity>,
    tenantCtx: TenantContextService,
  ) {
    super(repo, tenantCtx);
  }
}

describe('TenantAwareRepository', () => {
  let tenantCtx: TenantContextService;
  let cls: ClsService;
  let repo: TestRepository;
  const mockBaseRepo: Partial<Repository<TestEntity>> = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      imports: [ClsModule.forRoot({ middleware: { mount: true } })],
      providers: [TenantContextService],
    }).compile();
    tenantCtx = mod.get(TenantContextService);
    cls = mod.get(ClsService);
    repo = new TestRepository(
      mockBaseRepo as Repository<TestEntity>,
      tenantCtx,
    );
    jest.clearAllMocks();
  });

  it('scopedFind appends trainerId from context', async () => {
    await cls.run(async () => {
      tenantCtx.set({ userId: 'u1', role: 'TRAINER', trainerId: 't1', isChild: false });
      (mockBaseRepo.find as jest.Mock).mockResolvedValue([]);
      await repo.scopedFind({ where: { name: 'test' } as any });
      expect(mockBaseRepo.find).toHaveBeenCalledWith({
        where: { name: 'test', trainerId: 't1' },
      });
    });
  });

  it('scopedFind with no context throws TenantContextMissingError', async () => {
    await cls.run(async () => {
      // No tenantCtx.set — context is missing
      await expect(
        repo.scopedFind({ where: {} as any }),
      ).rejects.toBeInstanceOf(TenantContextMissingError);
    });
  });

  it('withoutTenantScope runs fn with system context', async () => {
    await cls.run(async () => {
      (mockBaseRepo.find as jest.Mock).mockResolvedValue([]);
      let wasSystem = false;
      await repo.withoutTenantScope(async () => {
        wasSystem = tenantCtx.isSystemContext();
      });
      expect(wasSystem).toBe(true);
    });
  });

  it('withoutTenantScope restores previous system context state', async () => {
    await cls.run(async () => {
      tenantCtx.setSystemContext(false);
      await repo.withoutTenantScope(async () => {
        // inside it's true
      });
      // after it restores false
      expect(tenantCtx.isSystemContext()).toBe(false);
    });
  });
});
