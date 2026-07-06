import { Controller, Get, Query, Res } from '@nestjs/common';
import { FastifyReply } from 'fastify';
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

  @Get('attrition')
  attrition(@CurrentUser() user: AuthUser, @Query('months') months?: string) {
    return this.analytics.attrition(user.tenantId, months ? Number(months) : 12);
  }

  @Get('demographics')
  demographics(@CurrentUser() user: AuthUser) {
    return this.analytics.demographics(user.tenantId);
  }

  @Get('reports/builder')
  reportBuilder(
    @CurrentUser() user: AuthUser,
    @Query('report') report: 'employees' | 'attendance' | 'payroll' | 'expenses' | 'tickets' = 'employees',
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: string,
  ) {
    return this.analytics.reportBuilder(user.tenantId, report, { from, to, status });
  }

  @Get('reports/builder/export')
  async reportBuilderExport(
    @CurrentUser() user: AuthUser,
    @Query('report') report: 'employees' | 'attendance' | 'payroll' | 'expenses' | 'tickets' = 'employees',
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('status') status: string | undefined,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const { csv, filename } = await this.analytics.reportBuilderCsv(user.tenantId, report, { from, to, status });
    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.header('Content-Disposition', `attachment; filename="${filename}"`);
    return csv;
  }
}
