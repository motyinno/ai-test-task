import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '../shared/config/config.module';
import { DatabaseModule } from '../shared/database/database.module';
import { TenancyModule } from '../shared/tenancy/tenancy.module';
import { TenantInterceptor } from '../shared/tenancy/tenant.interceptor';
import { AuthModule } from '../modules/auth/auth.module';
import { HealthController } from '../shared/health/health.controller';
import { SessionTestController } from '../shared/session/session-test.controller';

const testControllers =
  process.env['NODE_ENV'] === 'test' ? [SessionTestController] : [];

@Module({
  imports: [ConfigModule, DatabaseModule, TenancyModule, AuthModule],
  controllers: [HealthController, ...testControllers],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantInterceptor,
    },
  ],
})
export class AppModule {}
