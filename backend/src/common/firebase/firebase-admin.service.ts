import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { cert, getApps, initializeApp, ServiceAccount } from 'firebase-admin/app';
import { DecodedIdToken, getAuth } from 'firebase-admin/auth';

/**
 * Khởi tạo Firebase Admin SDK (một lần) để verify ID token do frontend gửi lên.
 *
 * Vì sao backend phải verify lại token?
 * Frontend đăng nhập bằng Firebase và nhận về ID token (JWT ký bằng khoá riêng của
 * Google). Bất kỳ ai cũng có thể TỰ BỊA một chuỗi rồi gắn vào header — chỉ khi
 * backend kiểm tra chữ ký mới biết token là thật. Đây chính là bước
 * AUTHENTICATION ("bạn là ai"), tách hẳn với AUTHORIZATION ("bạn được làm gì").
 *
 * Nạp credentials theo 2 cách, ưu tiên từ trên xuống:
 *   1. FIREBASE_SERVICE_ACCOUNT_PATH — đường dẫn tới file service account JSON.
 *   2. FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY.
 */
@Injectable()
export class FirebaseAdminService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseAdminService.name);

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    if (getApps().length) return;

    const account = this.loadServiceAccount();
    initializeApp({ credential: cert(account) });
    this.logger.log(`Firebase Admin đã sẵn sàng (project: ${account.projectId})`);
  }

  private loadServiceAccount(): ServiceAccount {
    // Cách 1: trỏ tới file JSON.
    const path = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_PATH');
    if (path) {
      const full = isAbsolute(path) ? path : resolve(process.cwd(), path);
      let raw: string;
      try {
        raw = readFileSync(full, 'utf8');
      } catch {
        throw new Error(
          `Không đọc được file service account tại "${full}". ` +
            `Kiểm tra lại FIREBASE_SERVICE_ACCOUNT_PATH trong backend/.env.`,
        );
      }
      const json = JSON.parse(raw) as {
        project_id?: string;
        client_email?: string;
        private_key?: string;
      };
      if (!json.project_id || !json.client_email || !json.private_key) {
        throw new Error(
          `File service account "${full}" thiếu project_id / client_email / private_key.`,
        );
      }
      return {
        projectId: json.project_id,
        clientEmail: json.client_email,
        privateKey: json.private_key,
      };
    }

    // Cách 2: 3 biến môi trường rời.
    const projectId = this.config.get<string>('FIREBASE_PROJECT_ID');
    const clientEmail = this.config.get<string>('FIREBASE_CLIENT_EMAIL');
    const privateKey = this.config.get<string>('FIREBASE_PRIVATE_KEY');
    if (!projectId || !clientEmail || !privateKey) {
      throw new Error(
        'Thiếu cấu hình Firebase Admin. Đặt FIREBASE_SERVICE_ACCOUNT_PATH, ' +
          'hoặc đủ bộ FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY.',
      );
    }
    // Khi private key nằm trong .env, ký tự xuống dòng bị lưu thành 2 ký tự "\\n"
    // — phải đổi lại thành xuống dòng thật, nếu không cert() sẽ báo key hỏng.
    return { projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, '\n') };
  }

  /** Verify ID token. Token sai/hết hạn/bị sửa → ném lỗi. */
  async verifyIdToken(idToken: string): Promise<DecodedIdToken> {
    return getAuth().verifyIdToken(idToken);
  }
}
