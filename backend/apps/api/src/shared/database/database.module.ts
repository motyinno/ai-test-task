import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule as NestConfigModule, ConfigService } from '@nestjs/config';
import { ConfigModule } from '../config/config.module';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forRootAsync({
      imports: [NestConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.getOrThrow<string>('DATABASE_URL'),
        autoLoadEntities: true,
        synchronize: process.env.NODE_ENV === 'test',
        migrations: ['dist/apps/api/src/shared/database/migrations/*.js'],
        migrationsTableName: 'typeorm_migrations',
        logging: process.env.NODE_ENV === 'development',
      }),
    }),
  ],
})
export class DatabaseModule {}
