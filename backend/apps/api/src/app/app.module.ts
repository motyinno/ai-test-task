import { Module } from '@nestjs/common';
import { ConfigModule } from '../shared/config/config.module';
import { DatabaseModule } from '../shared/database/database.module';
import { HealthController } from '../shared/health/health.controller';

@Module({
  imports: [ConfigModule, DatabaseModule],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
