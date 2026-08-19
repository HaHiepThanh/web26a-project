import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { SupabaseService } from './common/supabase/supabase.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly supabase: SupabaseService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /**
   * GET /health — kiểm tra backend sống và nối được Supabase.
   * KHÔNG yêu cầu token, nên tuyệt đối không trả về dữ liệu người dùng hay
   * cấu hình bí mật — chỉ đúng/sai.
   */
  @Get('health')
  async health(): Promise<{ status: string; supabase: string }> {
    const { error } = await this.supabase.client
      .from('users')
      .select('id', { count: 'exact', head: true });

    return {
      status: 'ok',
      supabase: error ? `loi: ${error.message}` : 'ket noi duoc',
    };
  }
}
