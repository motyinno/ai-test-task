import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AbilityFactory } from './ability.factory';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { CHECK_ABILITY_KEY, AbilityCheck } from './check-ability.decorator';

/**
 * AbilityGuard enforces CASL @CheckAbility constraints.
 * Used primarily for child sub-login restrictions (A2/D3).
 */
@Injectable()
export class AbilityGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly abilityFactory: AbilityFactory,
    private readonly tenantCtx: TenantContextService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const check = this.reflector.getAllAndOverride<AbilityCheck | undefined>(
      CHECK_ABILITY_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No check metadata → allow
    if (!check) return true;

    const ctx = this.tenantCtx.get();
    if (!ctx) return true; // No context (anonymous) → delegate to auth guards

    const ability = this.abilityFactory.forContext(ctx);

    if (!ability.can(check.action, check.subject)) {
      throw new ForbiddenException({
        message: `Child accounts cannot perform action '${check.action}' on '${check.subject}'`,
        errorCode: `CHILD_FORBIDDEN`,
      });
    }

    return true;
  }
}
