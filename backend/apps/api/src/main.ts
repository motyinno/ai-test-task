import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { bootstrapApp } from './shared/bootstrap/bootstrap';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await bootstrapApp(app);
  const port = process.env.PORT || 3000;
  await app.listen(port);
  Logger.log(`Application is running on: http://localhost:${port}/api/v1`);
}

bootstrap();
