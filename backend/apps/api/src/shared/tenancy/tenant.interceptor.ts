import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
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
 * Runs after session resolution and Passport deserialization.
 * Reads the session principal and hydrates the CLS TenantContext for the request.
 * Order in main.ts: session middleware → passport → this interceptor (registered as APP_INTERCEPTOR).
 */
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  constructor(private readonly tenantCtx: TenantContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      session?: Record<string, unknown>;
    }>();

    const rawPrincipal = request.session?.['principal'] as RawPrincipal | undefined;

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

    return next.handle();
  }
}
