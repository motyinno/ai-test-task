import { Module } from '@nestjs/common';
import { ConfigModule } from '../shared/config/config.module';
import { DatabaseModule } from '../shared/database/database.module';
import { TenancyModule } from '../shared/tenancy/tenancy.module';
import { HealthController } from '../shared/health/health.controller';

@Module({
  imports: [ConfigModule, DatabaseModule, TenancyModule],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
