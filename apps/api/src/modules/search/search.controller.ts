import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { SearchService } from './search.service';

@ApiTags('Search')
@ApiBearerAuth()
@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get('global')
  @ApiOperation({ summary: 'Universal search across employees, candidates, tickets, jobs, assets' })
  global(@CurrentUser() user: AuthUser, @Query('q') q = '') {
    return this.search.global(user.tenantId, q);
  }
}
