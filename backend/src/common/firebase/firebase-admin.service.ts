import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getApps, initializeApp } from 'firebase-admin/app';
import { DecodedIdToken, getAuth } from 'firebase-admin/auth';

/**
 * Khởi tạo Firebase Admin SDK (một lần) để verify ID token do frontend gửi lên.
 * Cần service account credentials của Firebase project (đặt trong biến môi trường).
 */
@Injectable()
export class FirebaseAdminService implements OnModuleInit {
  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    if (getApps().length) return;
    // TODO: nạp credentials từ env (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL,
    //       FIREBASE_PRIVATE_KEY) rồi initializeApp({ credential: cert(...) }).
    initializeApp();
  }

  // TODO: verify ID token -> trả về decoded token (chứa uid, email...).
  async verifyIdToken(idToken: string): Promise<DecodedIdToken> {
    return getAuth().verifyIdToken(idToken);
  }
}
