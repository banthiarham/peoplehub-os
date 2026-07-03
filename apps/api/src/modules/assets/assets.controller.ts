import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { AssignAssetDto, CreateAssetDto, ListAssetsDto, ReturnAssetDto } from './dto/assets.dto';
import { AssetsService } from './assets.service';

@ApiTags('Assets')
@ApiBearerAuth()
@Controller('assets')
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: ListAssetsDto) {
    return this.assets.list(user.tenantId, q);
  }

  @Get('stats')
  stats(@CurrentUser() user: AuthUser) {
    return this.assets.stats(user.tenantId);
  }

  @Post()
  @Roles('Super Admin', 'HR Admin')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAssetDto) {
    return this.assets.create(user.tenantId, dto);
  }

  @Post(':id/assign')
  @Roles('Super Admin', 'HR Admin')
  assign(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AssignAssetDto) {
    return this.assets.assign(user.tenantId, id, dto.employeeId);
  }

  @Post(':id/return')
  @Roles('Super Admin', 'HR Admin')
  returnAsset(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReturnAssetDto) {
    return this.assets.returnAsset(user.tenantId, id, dto.condition, dto.notes);
  }
}
