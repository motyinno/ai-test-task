import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AbilityFactory } from './ability.factory';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { CHECK_ABILITY_KEY, AbilityCheck } from './check-ability.decorator';

/**
 * AbilityGuard enforces CASL @CheckAbility constraints (A2/D3).
 *
 * Registered globally as APP_GUARD (after ThrottlerGuard + RolesGuard).
 * TenantMiddleware runs before guards so the CLS context is always populated
 * for authenticated requests by the time this guard executes (C1 fix).
 *
 * Fail-closed behaviour (C2):
 * - If @CheckAbility is present and CLS context is missing → 401 (not authenticated)
 * - If @CheckAbility is present and ability check fails → 403 CHILD_FORBIDDEN
 * - If no @CheckAbility → pass-through (allow)
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

    // No @CheckAbility metadata → pass-through (route is not ability-gated)
    if (!check) return true;

    const ctx = this.tenantCtx.get();

    // @CheckAbility present but no tenant context → unauthenticated request reached
    // an ability-gated route. Fail closed (401).
    if (!ctx) {
      throw new UnauthorizedException('Authentication required');
    }

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
