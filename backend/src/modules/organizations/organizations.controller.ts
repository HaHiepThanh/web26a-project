import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from '../../common/firebase/firebase-auth.guard';
import { RolesGuard } from '../../common/firebase/roles.guard';
import { Roles } from '../../common/firebase/roles.decorator';
import { CurrentUser } from '../../common/firebase/current-user.decorator';
import type { CurrentUserInfo } from '../../common/firebase/current-user.decorator';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { RespondInviteDto } from './dto/respond-invite.dto';
import { ChangeRoleDto } from './dto/change-role.dto';

/**
 * Tổ chức (Organization) — ranh giới cô lập dữ liệu. Bảng: `organizations`,
 * `organization_members`, `organization_invites` (xem database.sql mục 3).
 *
 * TODO(học viên): tách DTO cho từng route thay vì khai kiểu inline ở @Body().
 */
@UseGuards(FirebaseAuthGuard)
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  /** POST /organizations — tạo tổ chức mới, người tạo thành owner. */
  @Post()
  create(@CurrentUser() user: CurrentUserInfo, @Body() body: CreateOrganizationDto) {
    return this.organizations.create(user.uid, body.name, body.slug);
  }

  /** GET /organizations — danh sách tổ chức mà tôi là thành viên. */
  @Get()
  findMine(@CurrentUser() user: CurrentUserInfo) {
    return this.organizations.findMine(user.uid);
  }

  // ⚠️ Route TĨNH phải khai TRƯỚC route ĐỘNG. NestJS khớp theo thứ tự khai báo,
  // nếu ':id/...' đứng trên thì một ngày nào đó thêm route 2 đoạn khác là bị nuốt.
  /** GET /organizations/invites/me — lời mời đang chờ tôi trả lời. */
  @Get('invites/me')
  myInvites(@CurrentUser() user: CurrentUserInfo) {
    return this.organizations.findMyInvites(user.uid);
  }

  /** PATCH /organizations/invites/:inviteId — đồng ý hoặc từ chối lời mời. */
  @Patch('invites/:inviteId')
  respondInvite(
    @CurrentUser() user: CurrentUserInfo,
    @Param('inviteId') inviteId: string,
    @Body() body: RespondInviteDto,
  ) {
    return this.organizations.respondInvite(user.uid, inviteId, body.accept);
  }

  /** GET /organizations/:id/members — danh sách thành viên + vai trò. */
  @Get(':id/members')
  members(@CurrentUser() user: CurrentUserInfo, @Param('id') id: string) {
    return this.organizations.findMembers(user.uid, id);
  }

  /** PATCH /organizations/:id/members/:userId/role — đổi vai trò (chỉ owner). */
  @UseGuards(RolesGuard)
  @Roles('owner')
  @Patch(':id/members/:userId/role')
  changeRole(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() body: ChangeRoleDto,
  ) {
    return this.organizations.changeRole(id, userId, body.role);
  }

  /** DELETE /organizations/:id/members/:userId — xoá thành viên (owner hoặc admin). */
  @UseGuards(RolesGuard)
  @Roles('owner', 'admin')
  @Delete(':id/members/:userId')
  removeMember(@Param('id') id: string, @Param('userId') userId: string) {
    return this.organizations.removeMember(id, userId);
  }

  /** POST /organizations/:id/invites — mời 1 người theo userId (owner hoặc admin). */
  @UseGuards(RolesGuard)
  @Roles('owner', 'admin')
  @Post(':id/invites')
  invite(
    @CurrentUser() user: CurrentUserInfo,
    @Param('id') id: string,
    @Body() body: InviteMemberDto,
  ) {
    return this.organizations.invite(id, user.uid, body.toUserId, body.role ?? 'member');
  }
}
