import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase client phía server dùng SERVICE_ROLE key -> BỎ QUA RLS.
 * Vì auth đã chuyển sang Firebase, backend là lớp bảo mật chính: guard phải tự
 * lọc dữ liệu theo tenant của user (thay vai trò RLS trước đây).
 * TUYỆT ĐỐI không để service_role key lộ ra frontend.
 */
@Injectable()
export class SupabaseService {
  readonly client: SupabaseClient;

  constructor(config: ConfigService) {
    this.client = createClient(
      config.getOrThrow<string>('SUPABASE_URL'),
      config.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY'),
    );
  }
}
