import { Global, Module } from '@nestjs/common';
import { FirebaseAdminService } from './firebase-admin.service';
import { FirebaseAuthGuard } from './firebase-auth.guard';
import { RolesGuard } from './roles.guard';

// Global: dùng FirebaseAuthGuard / RolesGuard / FirebaseAdminService ở mọi nơi.
@Global()
@Module({
  providers: [FirebaseAdminService, FirebaseAuthGuard, RolesGuard],
  exports: [FirebaseAdminService, FirebaseAuthGuard, RolesGuard],
})
export class FirebaseModule {}
