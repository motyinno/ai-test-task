import { Module, MiddlewareConsumer, NestModule, RequestMethod } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { RolesGuard } from '../shared/authz/roles.guard';
import { AbilityGuard } from '../shared/authz/ability.guard';
import { AuthzModule } from '../shared/authz/authz.module';
import { ConfigModule } from '../shared/config/config.module';
import { DatabaseModule } from '../shared/database/database.module';
import { TenancyModule } from '../shared/tenancy/tenancy.module';
import { TenantMiddleware } from '../shared/tenancy/tenant.middleware';
import { CsrfMiddleware } from '../shared/security/csrf.middleware';
import { AuthModule } from '../modules/auth/auth.module';
import { UsersModule } from '../modules/users/users.module';
import { HealthController } from '../shared/health/health.controller';
import { SessionTestController } from '../shared/session/session-test.controller';

const testControllers =
  process.env['NODE_ENV'] === 'test' ? [SessionTestController] : [];

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    TenancyModule,
    AuthModule,
    UsersModule,
    AuthzModule,
    ThrottlerModule.forRoot([
      {
        // Global default: 100 requests per minute (high limit in test to avoid cross-test contamination)
        ttl: 60_000,
        limit: process.env['NODE_ENV'] === 'test' ? 10000 : 100,
      },
    ]),
  ],
  controllers: [HealthController, ...testControllers],
  providers: [
    /**
     * Guard execution order (NestJS processes APP_GUARDs in registration order):
     *   1. ThrottlerGuard  — rate limiting
     *   2. RolesGuard      — role-based access
     *   3. AbilityGuard    — CASL child-constraint check (C2: registered globally, fail-closed)
     *
     * TenantMiddleware (registered below) runs BEFORE all guards in the middleware
     * pipeline, so AbilityGuard always has a populated CLS context (C1 fix).
     */
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: AbilityGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    /**
     * Middleware pipeline order (applied in registration order):
     *   1. CsrfMiddleware  — CSRF double-submit check on unsafe methods
     *   2. TenantMiddleware — hydrates CLS TenantContext from session principal
     *
     * Both run AFTER express-session + passport (mounted in bootstrapApp),
     * so the session is already populated when TenantMiddleware reads it.
     */
    consumer
      .apply(CsrfMiddleware, TenantMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
