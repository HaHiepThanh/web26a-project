import { Global, Module } from '@nestjs/common';
import { AccessService } from './access.service';

/** @Global: mọi feature module đều cần kiểm tra quyền, khỏi phải import từng chỗ. */
@Global()
@Module({
  providers: [AccessService],
  exports: [AccessService],
})
export class AccessModule {}
