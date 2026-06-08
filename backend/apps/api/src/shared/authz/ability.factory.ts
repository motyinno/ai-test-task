import { Injectable } from '@nestjs/common';
import {
  AbilityBuilder,
  createMongoAbility,
  MongoAbility,
  InferSubjects,
} from '@casl/ability';
import { TenantContext } from '../tenancy/tenant-context';

/**
 * CASL subject strings — kept as string literals for maximum flexibility
 * across epics (Event, Payment, Token, Account, Trainer, etc.)
 */
type AppSubjects = string | 'all';
type AppActions = string;

export type AppAbility = MongoAbility<[AppActions, AppSubjects]>;

/**
 * CASL Ability Factory (A2 refines D3).
 *
 * Scoped narrowly to the child sub-login problem:
 * - Child principals: allow read/rsvp on Event; deny add-Trainer, manage-Payment,
 *   purchase-Token, delete-Account (FR-026, SEC-009).
 * - All other principals: allow everything (coarse role gate is in RolesGuard).
 */
@Injectable()
export class AbilityFactory {
  forContext(ctx: TenantContext): AppAbility {
    const { can, cannot, build } = new AbilityBuilder<AppAbility>(createMongoAbility);

    if (ctx.isChild) {
      // Child sub-login: scalpel constraints
      can('read', 'Event');
      can('rsvp', 'Event');
      // Explicitly deny the four blocked actions
      cannot('add', 'Trainer');
      cannot('manage', 'Payment');
      cannot('purchase', 'Token');
      cannot('delete', 'Account');
    } else {
      // Non-child: full capability (role gate + structural tenant filter handle access)
      can('manage', 'all');
    }

    return build();
  }
}
