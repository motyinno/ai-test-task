/**
 * Typed shapes for the CLS-based tenant context.
 */
export type UserRole = 'SUPER_ADMIN' | 'TRAINER' | 'COACH' | 'PLAYER';

export interface TenantContext {
  /** Authenticated user (or child principal) UUID */
  userId: string;
  /** Active role */
  role: UserRole;
  /** Trainer org scope — set for TRAINER / COACH / scoped PLAYER */
  trainerId?: string;
  /** True when principal is a constrained child sub-login */
  isChild: boolean;
  /** Parent account UUID when isChild = true */
  parentUserId?: string;
  /** Real admin UUID when impersonating */
  impersonatorId?: string;
  /** SA / impersonation system context — bypasses tenant filter (must be audited) */
  systemContext?: boolean;
}
