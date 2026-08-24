import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Avatar profile gửi ảnh base64 trong JSON body (PATCH /auth/profile).
  // Mặc định Express giới hạn body 100kb — ảnh base64 (~5MB gốc -> ~6.7MB
  // sau khi encode) sẽ bị chặn với lỗi 413 trước khi tới controller.
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));

  // Cho phép frontend (Angular) gọi API. TODO: giới hạn origin theo môi trường.
  app.enableCors({ origin: true, credentials: true });

  // Tự động validate DTO (class-validator) + loại field thừa.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  await app.listen(process.env.PORT ?? 3000);
}
// Bắt lỗi tường minh: `bootstrap()` không có .catch thì mọi lỗi khởi động
// (sai key Supabase, cổng bận, thiếu biến môi trường) chỉ hiện thành
// UnhandledPromiseRejection khó đọc, và tiến trình thoát với mã 0 như thể ổn.
bootstrap().catch((err) => {
  console.error('Không khởi động được backend:', err);
  process.exit(1);
});
