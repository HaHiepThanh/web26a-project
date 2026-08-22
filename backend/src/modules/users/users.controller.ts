import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from '../../common/firebase/firebase-auth.guard';
import { CurrentUser } from '../../common/firebase/current-user.decorator';
import type { CurrentUserInfo } from '../../common/firebase/current-user.decorator';
import { UsersService } from './users.service';

@UseGuards(FirebaseAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /**
   * GET /users/search?q= — tìm người để mời vào tổ chức / thêm vào workspace.
   *
   * Gõ đúng uuid hoặc đúng email thì tìm toàn hệ thống; gõ tên thì chỉ tìm trong
   * người cùng tổ chức. Query dưới 3 ký tự trả mảng rỗng.
   */
  @Get('search')
  search(@CurrentUser() user: CurrentUserInfo, @Query('q') q: string) {
    return this.users.search(user.uid, q);
  }
}
