import { Test } from '@nestjs/testing';
import { ClsModule, ClsService } from 'nestjs-cls';
import { TenantContextService } from '../tenant-context.service';

describe('TenantContextService', () => {
  let svc: TenantContextService;
  let cls: ClsService;

  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      imports: [ClsModule.forRoot({ middleware: { mount: true } })],
      providers: [TenantContextService],
    }).compile();
    svc = mod.get(TenantContextService);
    cls = mod.get(ClsService);
  });

  it('stores and reads active trainerId within a CLS run', async () => {
    await cls.run(async () => {
      svc.set({ userId: 'u1', role: 'TRAINER', trainerId: 't1', isChild: false });
      expect(svc.get().trainerId).toBe('t1');
    });
  });

  it('returns undefined context outside a CLS run', () => {
    const ctx = svc.get();
    expect(ctx).toBeUndefined();
  });

  it('stores child context flags', async () => {
    await cls.run(async () => {
      svc.set({
        userId: 'c1',
        role: 'PLAYER',
        trainerId: 't1',
        isChild: true,
        parentUserId: 'p1',
      });
      const ctx = svc.get();
      expect(ctx?.isChild).toBe(true);
      expect(ctx?.parentUserId).toBe('p1');
    });
  });

  it('supports system context flag for escape hatch', async () => {
    await cls.run(async () => {
      svc.setSystemContext(true);
      expect(svc.isSystemContext()).toBe(true);
    });
  });
});
