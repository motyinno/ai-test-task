import { Test } from '@nestjs/testing';
import { ClsModule, ClsService } from 'nestjs-cls';
import { TenantContextService } from '../tenant-context.service';
import { TenantInterceptor } from '../tenant.interceptor';
import { SessionContextService } from '../../../modules/auth/session-context.service';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import { UserRole, UserStatus } from '../../../modules/users/entities/user.entity';

describe('TenantInterceptor', () => {
  let interceptor: TenantInterceptor;
  let tenantCtx: TenantContextService;
  let cls: ClsService;
  let sessionCtxSvc: SessionContextService;

  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      imports: [ClsModule.forRoot({ middleware: { mount: true } })],
      providers: [TenantContextService, TenantInterceptor, SessionContextService],
    }).compile();

    interceptor = mod.get(TenantInterceptor);
    tenantCtx = mod.get(TenantContextService);
    cls = mod.get(ClsService);
    sessionCtxSvc = mod.get(SessionContextService);
  });

  function makeMockContext(principal?: object | null): ExecutionContext {
    const request = {
      session: principal !== null ? { principal } : {},
    };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  }

  const handler: CallHandler = {
    handle: () => of(null),
  };

  it('hydrates CLS from session principal with trainerId', async () => {
    await cls.run(async () => {
      const principal = {
        id: 'u1',
        role: 'TRAINER',
        email: 'trainer@test.com',
        status: UserStatus.ACTIVE,
        emailVerified: true,
        mustChangePassword: false,
        trainerId: 't1',
      };
      const ctx = makeMockContext(principal);

      await new Promise<void>((resolve) => {
        interceptor.intercept(ctx, handler).subscribe(() => resolve());
      });

      expect(tenantCtx.get()?.userId).toBe('u1');
      expect(tenantCtx.get()?.trainerId).toBe('t1');
      expect(tenantCtx.get()?.role).toBe('TRAINER');
    });
  });

  it('sets empty context for anonymous request (no session principal)', async () => {
    await cls.run(async () => {
      const ctx = makeMockContext(null);

      await new Promise<void>((resolve) => {
        interceptor.intercept(ctx, handler).subscribe(() => resolve());
      });

      expect(tenantCtx.get()).toBeUndefined();
    });
  });
});
