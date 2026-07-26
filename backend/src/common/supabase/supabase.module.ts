import { Global, Module } from '@nestjs/common';
import { SupabaseService } from './supabase.service';

// Global: mọi module inject SupabaseService mà không cần import lại.
@Global()
@Module({
  providers: [SupabaseService],
  exports: [SupabaseService],
})
export class SupabaseModule {}
