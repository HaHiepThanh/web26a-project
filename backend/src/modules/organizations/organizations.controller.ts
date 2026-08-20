import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { FirebaseAuthGuard } from '../../common/firebase/firebase-auth.guard';
import { RolesGuard } from '../../common/firebase/roles.guard';
import { Roles } from '../../common/firebase/roles.decorator';
import { CurrentUser } from '../../common/firebase/current-user.decorator';
import type { CurrentUserInfo } from '../../common/firebase/current-user.decorator';
import { TenantsService } from './tenants.service';

// TODO: tách DTO cho từng route.
@UseGuards(FirebaseAuthGuard)
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Post()
  create(@CurrentUser() user: CurrentUserInfo, @Body() body: { name: string }) {
    return this.tenants.create(user.uid, body.name);
  }

  @Get('me')
  me(@CurrentUser() user: CurrentUserInfo) {
    return this.tenants.findCurrent(user.uid);
  }

  @Get(':id/members')
  members(@Param('id') id: string) {
    return this.tenants.findMembers(id);
  }

  @UseGuards(RolesGuard)
  @Roles('owner')
  @Patch(':id/members/:memberId/role')
  changeRole(
    @Param('memberId') memberId: string,
    @Body() body: { role: 'owner' | 'member' },
  ) {
    return this.tenants.changeRole(memberId, body.role);
  }

  @UseGuards(RolesGuard)
  @Roles('owner')
  @Delete(':id/members/:memberId')
  removeMember(@Param('memberId') memberId: string) {
    return this.tenants.removeMember(memberId);
  }

  @UseGuards(RolesGuard)
  @Roles('owner')
  @Post(':id/invites')
  createInvite(@Param('id') id: string, @CurrentUser() user: CurrentUserInfo) {
    return this.tenants.createInvite(id, user.uid);
  }

  @Post('join')
  join(@CurrentUser() user: CurrentUserInfo, @Body() body: { token: string }) {
    return this.tenants.joinByToken(user.uid, body.token);
  }
}
