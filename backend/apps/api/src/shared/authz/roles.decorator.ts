import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../modules/users/entities/user.entity';

export const ROLES_KEY = 'roles';

/**
 * Marks a controller method with required roles.
 * RolesGuard reads this metadata and enforces it.
 * Usage: @Roles('SUPER_ADMIN') or @Roles(UserRole.TRAINER, UserRole.COACH)
 */
export const Roles = (...roles: (UserRole | string)[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
