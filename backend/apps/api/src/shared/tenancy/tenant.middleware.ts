import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { TenantContextService } from './tenant-context.service';
import type { TenantContext, UserRole } from './tenant-context';

interface RawPrincipal {
  id?: string;
  role?: string;
  trainerId?: string;
  isChild?: boolean;
  parentUserId?: string;
  impersonatorId?: string;
}

/**
 * TenantMiddleware — runs in the Express middleware pipeline, BEFORE NestJS guards.
 *
 * Reads the session principal (already populated by express-session + passport) and
 * hydrates the CLS TenantContext so AbilityGuard and RolesGuard have a valid context.
 *
 * Ordering guarantee:
 *   session middleware → passport.initialize/session → TenantMiddleware → Guards → Interceptors
 *
 * This replaces TenantInterceptor which ran AFTER guards (breaking AbilityGuard — C1).
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly tenantCtx: TenantContextService) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    const session = req.session as unknown as Record<string, unknown> | undefined;
    const rawPrincipal = session?.['principal'] as RawPrincipal | undefined;

    if (rawPrincipal?.id) {
      const ctx: TenantContext = {
        userId: rawPrincipal.id,
        role: rawPrincipal.role as UserRole,
        trainerId: rawPrincipal.trainerId,
        isChild: rawPrincipal.isChild ?? false,
        parentUserId: rawPrincipal.parentUserId,
        impersonatorId: rawPrincipal.impersonatorId,
      };
      this.tenantCtx.set(ctx);
    }
    // Anonymous request — no context set; tenantCtx.get() returns undefined

    next();
  }
}
