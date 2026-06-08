import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { RolesGuard } from '../roles.guard';
import { ROLES_KEY } from '../roles.decorator';

function makeMockContext(principal?: object | null, handlerRoles?: string[]): ExecutionContext {
  const handler = jest.fn();
  if (handlerRoles) {
    // Store roles metadata on the handler
    Reflect.defineMetadata(ROLES_KEY, handlerRoles, handler);
  }
  const request = {
    session: principal ? { principal } : {},
  };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => handler,
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      providers: [RolesGuard, Reflector],
    }).compile();
    guard = mod.get(RolesGuard);
    reflector = mod.get(Reflector);
  });

  it('allows access when no roles metadata set (public handler)', () => {
    const ctx = makeMockContext({ id: 'u1', role: 'TRAINER' });
    const result = guard.canActivate(ctx);
    expect(result).toBe(true);
  });

  it('allows SUPER_ADMIN principal to access @Roles(SUPER_ADMIN) handler', () => {
    const ctx = makeMockContext({ id: 'u1', role: 'SUPER_ADMIN' }, ['SUPER_ADMIN']);
    const result = guard.canActivate(ctx);
    expect(result).toBe(true);
  });

  it('throws ForbiddenException for TRAINER on @Roles(SUPER_ADMIN) handler', () => {
    const ctx = makeMockContext({ id: 'u1', role: 'TRAINER' }, ['SUPER_ADMIN']);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('throws UnauthorizedException for unauthenticated on a roles-protected handler', () => {
    const ctx = makeMockContext(null, ['TRAINER']);
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('allows TRAINER on @Roles(TRAINER, COACH) multi-role handler', () => {
    const ctx = makeMockContext({ id: 'u1', role: 'TRAINER' }, ['TRAINER', 'COACH']);
    const result = guard.canActivate(ctx);
    expect(result).toBe(true);
  });
});
