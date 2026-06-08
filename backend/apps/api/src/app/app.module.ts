import { Module } from '@nestjs/common';
import { ConfigModule } from '../shared/config/config.module';
import { DatabaseModule } from '../shared/database/database.module';
import { TenancyModule } from '../shared/tenancy/tenancy.module';
import { HealthController } from '../shared/health/health.controller';
import { SessionTestController } from '../shared/session/session-test.controller';

const testControllers =
  process.env['NODE_ENV'] === 'test' ? [SessionTestController] : [];

@Module({
  imports: [ConfigModule, DatabaseModule, TenancyModule],
  controllers: [HealthController, ...testControllers],
  providers: [],
})
export class AppModule {}
