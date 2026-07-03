import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { AnalyticsService } from './analytics.service';

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Full dashboard payload in one call' })
  dashboard(@CurrentUser() user: AuthUser) {
    return this.analytics.dashboard(user.tenantId);
  }

  @Get('headcount-trend')
  headcountTrend(@CurrentUser() user: AuthUser, @Query('months') months?: string) {
    return this.analytics.headcountTrend(user.tenantId, months ? Number(months) : 12);
  }

  @Get('demographics')
  demographics(@CurrentUser() user: AuthUser) {
    return this.analytics.demographics(user.tenantId);
  }
}
