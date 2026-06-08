import { Test } from '@nestjs/testing';
import { ClsModule, ClsService } from 'nestjs-cls';
import { TenantContextService } from '../tenant-context.service';
import {
  TenantAwareRepository,
  TenantContextMissingError,
} from '../tenant-aware.repository';
import { Repository } from 'typeorm';

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
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
    create: jest.fn(),
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

  // ─── scopedFind ──────────────────────────────────────────────────────────

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

  // ─── C5: escape hatch actually bypasses filter ──────────────────────────

  it('C5: scopedFind inside withoutTenantScope skips trainerId filter', async () => {
    await cls.run(async () => {
      // No tenant context set at all — system context should bypass the check
      (mockBaseRepo.find as jest.Mock).mockResolvedValue([
        { id: 'r1', trainerId: 't1', name: 'Row-T1' },
        { id: 'r2', trainerId: 't2', name: 'Row-T2' },
      ]);

      let resultInsideScope: TestEntity[] = [];
      await repo.withoutTenantScope(async () => {
        resultInsideScope = await repo.scopedFind({});
      });

      // Called without trainerId filter
      expect(mockBaseRepo.find).toHaveBeenCalledWith({});
      // Returns all rows (cross-tenant)
      expect(resultInsideScope).toHaveLength(2);
    });
  });

  it('C5: scopedFindOne inside withoutTenantScope skips trainerId filter', async () => {
    await cls.run(async () => {
      (mockBaseRepo.findOne as jest.Mock).mockResolvedValue({ id: 'r2', trainerId: 't2', name: 'Row-T2' });

      let result: TestEntity | null = null;
      await repo.withoutTenantScope(async () => {
        result = await repo.scopedFindOne({ where: { id: 'r2' } as any });
      });

      // findOne called without trainerId
      expect(mockBaseRepo.findOne).toHaveBeenCalledWith({ where: { id: 'r2' } });
      expect(result?.trainerId).toBe('t2');
    });
  });

  it('C5: after withoutTenantScope exits, system context is restored (false)', async () => {
    await cls.run(async () => {
      tenantCtx.setSystemContext(false);
      await repo.withoutTenantScope(async () => {
        // system context is true inside
        expect(tenantCtx.isSystemContext()).toBe(true);
      });
      // restored to false after exit
      expect(tenantCtx.isSystemContext()).toBe(false);
    });
  });

  it('C5: scopedFind outside withoutTenantScope still enforces filter', async () => {
    await cls.run(async () => {
      tenantCtx.set({ userId: 'u1', role: 'TRAINER', trainerId: 't1', isChild: false });
      (mockBaseRepo.find as jest.Mock).mockResolvedValue([]);

      // inside
      await repo.withoutTenantScope(async () => {
        await repo.scopedFind({});
      });
      expect(mockBaseRepo.find).toHaveBeenCalledWith({});

      // outside — filter is re-applied
      jest.clearAllMocks();
      (mockBaseRepo.find as jest.Mock).mockResolvedValue([]);
      await repo.scopedFind({});
      expect(mockBaseRepo.find).toHaveBeenCalledWith({ where: { trainerId: 't1' } });
    });
  });

  // ─── withoutTenantScope ─────────────────────────────────────────────────

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

  // ─── H6: scoped write paths ──────────────────────────────────────────────

  it('H6: scopedSave injects trainerId before persisting', async () => {
    await cls.run(async () => {
      tenantCtx.set({ userId: 'u1', role: 'TRAINER', trainerId: 't1', isChild: false });
      (mockBaseRepo.save as jest.Mock).mockResolvedValue({ id: 'e1', trainerId: 't1', name: 'Item' });

      await repo.scopedSave({ name: 'Item' } as any);

      expect(mockBaseRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Item', trainerId: 't1' }),
      );
    });
  });

  it('H6: scopedSave inside withoutTenantScope does NOT inject trainerId', async () => {
    await cls.run(async () => {
      (mockBaseRepo.save as jest.Mock).mockResolvedValue({ id: 'e1', name: 'Admin' });

      await repo.withoutTenantScope(async () => {
        await repo.scopedSave({ name: 'Admin' } as any);
      });

      // trainerId not injected
      expect(mockBaseRepo.save).toHaveBeenCalledWith(
        expect.not.objectContaining({ trainerId: expect.anything() }),
      );
    });
  });

  it('H6: scopedUpdate appends trainerId to criteria', async () => {
    await cls.run(async () => {
      tenantCtx.set({ userId: 'u1', role: 'TRAINER', trainerId: 't1', isChild: false });
      (mockBaseRepo.update as jest.Mock).mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] });

      await repo.scopedUpdate({ id: 'e1' } as any, { name: 'Updated' } as any);

      expect(mockBaseRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'e1', trainerId: 't1' }),
        { name: 'Updated' },
      );
    });
  });

  it('H6: scopedDelete appends trainerId to criteria', async () => {
    await cls.run(async () => {
      tenantCtx.set({ userId: 'u1', role: 'TRAINER', trainerId: 't1', isChild: false });
      (mockBaseRepo.delete as jest.Mock).mockResolvedValue({ affected: 1, raw: [] });

      await repo.scopedDelete({ id: 'e1' } as any);

      expect(mockBaseRepo.delete).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'e1', trainerId: 't1' }),
      );
    });
  });

  it('H6: scopedCount appends trainerId to options', async () => {
    await cls.run(async () => {
      tenantCtx.set({ userId: 'u1', role: 'TRAINER', trainerId: 't1', isChild: false });
      (mockBaseRepo.count as jest.Mock).mockResolvedValue(5);

      await repo.scopedCount({ where: {} as any });

      expect(mockBaseRepo.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ trainerId: 't1' }) }),
      );
    });
  });
});
