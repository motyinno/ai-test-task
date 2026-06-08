import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';

type SessionRecord = Record<string, unknown>;

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No roles metadata → public/unguarded handler
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ session?: SessionRecord }>();
    const session = request.session as SessionRecord | undefined;
    const principal = session?.['principal'] as { role?: string } | undefined;

    if (!principal?.role) {
      throw new UnauthorizedException('Not authenticated');
    }

    if (!requiredRoles.includes(principal.role)) {
      throw new ForbiddenException(`Role '${principal.role}' is not authorized`);
    }

    return true;
  }
}
