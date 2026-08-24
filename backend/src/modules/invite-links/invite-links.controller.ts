import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { FirebaseAuthGuard } from '../../common/firebase/firebase-auth.guard';
import { CurrentUser } from '../../common/firebase/current-user.decorator';
import type { CurrentUserInfo } from '../../common/firebase/current-user.decorator';
import { InviteLinksService } from './invite-links.service';
import { CreateInviteLinkDto } from './dto/create-invite-link.dto';

/**
 * Link mời vào tổ chức, có thời hạn.
 *
 * Hai nhóm đường dẫn cố ý tách nhau:
 *
 *   /organizations/:id/invite-links   — QUẢN LÝ link. Chỉ owner/admin, vì phần
 *                                        trả về có `token` (chính là bí mật).
 *   /invite-links/:token              — DÙNG link. Ai đăng nhập rồi cũng gọi
 *                                        được, đó mới là mục đích của link.
 *
 * Gộp chung một nhóm thì sớm muộn cũng có endpoint lỡ trả `token` cho người
 * không được phép.
 */
@UseGuards(FirebaseAuthGuard)
@Controller()
export class InviteLinksController {
  constructor(private readonly links: InviteLinksService) {}

  /** POST /organizations/:id/invite-links — tạo link (owner/admin). */
  @Post('organizations/:id/invite-links')
  create(
    @CurrentUser() user: CurrentUserInfo,
    @Param('id') orgId: string,
    @Body() body: CreateInviteLinkDto,
  ) {
    return this.links.create(user.uid, orgId, body);
  }

  /** GET /organizations/:id/invite-links — danh sách link (owner/admin). */
  @Get('organizations/:id/invite-links')
  findAll(@CurrentUser() user: CurrentUserInfo, @Param('id') orgId: string) {
    return this.links.findAll(user.uid, orgId);
  }

  /**
   * DELETE /invite-links/:id — thu hồi link trước hạn (owner/admin).
   *
   * Nhận id của LINK chứ không phải token: màn quản lý đã có sẵn id, và để
   * token trên URL là nó nằm lại trong log máy chủ và lịch sử trình duyệt.
   */
  @Delete('invite-links/:id')
  revoke(@CurrentUser() user: CurrentUserInfo, @Param('id') id: string) {
    return this.links.revoke(user.uid, id);
  }

  /** GET /invite-links/:token/preview — "Bạn được mời vào ..." trước khi bấm. */
  @Get('invite-links/:token/preview')
  preview(@CurrentUser() user: CurrentUserInfo, @Param('token') token: string) {
    return this.links.preview(user.uid, token);
  }

  /**
   * POST /invite-links/:token/accept — dùng link để vào tổ chức.
   *
   * Trả 200 chứ không 201: cái được tạo là TƯ CÁCH THÀNH VIÊN, không phải một
   * tài nguyên nằm ở đường dẫn này.
   */
  @Post('invite-links/:token/accept')
  @HttpCode(HttpStatus.OK)
  accept(@CurrentUser() user: CurrentUserInfo, @Param('token') token: string) {
    return this.links.accept(user.uid, token);
  }
}
