import { SetMetadata } from '@nestjs/common';

export const CHECK_ABILITY_KEY = 'checkAbility';

export interface AbilityCheck {
  action: string;
  subject: string;
}

/**
 * Decorator to specify required CASL ability on a route handler.
 * Usage: @CheckAbility('rsvp', 'Event')
 */
export const CheckAbility = (action: string, subject: string): MethodDecorator & ClassDecorator =>
  SetMetadata(CHECK_ABILITY_KEY, { action, subject } as AbilityCheck);
