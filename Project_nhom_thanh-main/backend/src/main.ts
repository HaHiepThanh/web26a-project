import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Cho phép frontend (Angular) gọi API. TODO: giới hạn origin theo môi trường.
  app.enableCors({ origin: true, credentials: true });

  // Tự động validate DTO (class-validator) + loại field thừa.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
