import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { CreateLocationDto, UpdateLocationDto } from './dto/locations.dto';
import { LocationsService } from './locations.service';

const LOCATION_ADMIN_ROLES = ['Super Admin', 'HR Admin'];

@ApiTags('Locations')
@ApiBearerAuth()
@Controller('locations')
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Get()
  @ApiOperation({ summary: 'All work locations with geofence config and employee counts' })
  list(@CurrentUser() user: AuthUser) {
    return this.locations.list(user.tenantId);
  }

  @Post()
  @Roles(...LOCATION_ADMIN_ROLES)
  @ApiOperation({ summary: 'Create a work location' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateLocationDto) {
    return this.locations.create(user.tenantId, dto);
  }

  @Patch(':id')
  @Roles(...LOCATION_ADMIN_ROLES)
  @ApiOperation({ summary: 'Update a location, including its geofence center and radius' })
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateLocationDto) {
    return this.locations.update(user.tenantId, id, dto);
  }
}
