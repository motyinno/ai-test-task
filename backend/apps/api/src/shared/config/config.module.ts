import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import * as path from 'path';

const envFile =
  process.env.NODE_ENV === 'test'
    ? path.resolve(process.cwd(), '.env.test')
    : '.env';

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      envFilePath: envFile,
    }),
  ],
  exports: [NestConfigModule],
})
export class ConfigModule {}
