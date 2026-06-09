import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app/app.module';
import { bootstrapApp } from './shared/bootstrap/bootstrap';
import {
  STORAGE_ROOT,
  STORAGE_URL_PREFIX,
} from './shared/integrations/storage/storage.service';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  await bootstrapApp(app);

  // Serve files persisted by the local StorageService adapter. The global
  // prefix (api/v1) does not apply to static assets, so the `/local-storage`
  // URLs returned by StorageService.put() resolve directly.
  app.useStaticAssets(STORAGE_ROOT, { prefix: STORAGE_URL_PREFIX });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  Logger.log(`Application is running on: http://localhost:${port}/api/v1`);
}

bootstrap();
