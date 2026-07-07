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
  dashboard(
    @CurrentUser() user: AuthUser,
    @Query('departmentId') departmentId?: string,
    @Query('locationId') locationId?: string,
    @Query('legalEntityId') legalEntityId?: string,
    @Query('managerId') managerId?: string,
    @Query('employmentType') employmentType?: string,
  ) {
    return this.analytics.dashboard(user.tenantId, { departmentId, locationId, legalEntityId, managerId, employmentType });
  }

  @Get('headcount-trend')
  headcountTrend(
    @CurrentUser() user: AuthUser,
    @Query('months') months?: string,
    @Query('departmentId') departmentId?: string,
    @Query('locationId') locationId?: string,
    @Query('legalEntityId') legalEntityId?: string,
    @Query('managerId') managerId?: string,
    @Query('employmentType') employmentType?: string,
  ) {
    return this.analytics.headcountTrend(
      user.tenantId,
      months ? Number(months) : 12,
      { departmentId, locationId, legalEntityId, managerId, employmentType },
    );
  }

  @Get('attrition')
  attrition(
    @CurrentUser() user: AuthUser,
    @Query('months') months?: string,
    @Query('departmentId') departmentId?: string,
    @Query('locationId') locationId?: string,
    @Query('legalEntityId') legalEntityId?: string,
    @Query('managerId') managerId?: string,
    @Query('employmentType') employmentType?: string,
  ) {
    return this.analytics.attrition(
      user.tenantId,
      months ? Number(months) : 12,
      { departmentId, locationId, legalEntityId, managerId, employmentType },
    );
  }

  @Get('demographics')
  demographics(
    @CurrentUser() user: AuthUser,
    @Query('departmentId') departmentId?: string,
    @Query('locationId') locationId?: string,
    @Query('legalEntityId') legalEntityId?: string,
    @Query('managerId') managerId?: string,
    @Query('employmentType') employmentType?: string,
  ) {
    return this.analytics.demographics(user.tenantId, { departmentId, locationId, legalEntityId, managerId, employmentType });
  }

  @Get('reports/builder')
  reportBuilder(
    @CurrentUser() user: AuthUser,
    @Query('report') report: 'employees' | 'attendance' | 'payroll' | 'expenses' | 'tickets' = 'employees',
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: string,
    @Query('departmentId') departmentId?: string,
    @Query('locationId') locationId?: string,
    @Query('legalEntityId') legalEntityId?: string,
    @Query('managerId') managerId?: string,
    @Query('employmentType') employmentType?: string,
  ) {
    return this.analytics.reportBuilder(user.tenantId, report, {
      from,
      to,
      status,
      departmentId,
      locationId,
      legalEntityId,
      managerId,
      employmentType,
    });
  }

  @Get('reports/builder/export')
  async reportBuilderExport(
    @CurrentUser() user: AuthUser,
    @Query()
    q: {
      report?: 'employees' | 'attendance' | 'payroll' | 'expenses' | 'tickets';
      from?: string;
      to?: string;
      status?: string;
      departmentId?: string;
      locationId?: string;
      legalEntityId?: string;
      managerId?: string;
      employmentType?: string;
    },
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const { csv, filename } = await this.analytics.reportBuilderCsv(user.tenantId, q.report ?? 'employees', {
      from: q.from,
      to: q.to,
      status: q.status,
      departmentId: q.departmentId,
      locationId: q.locationId,
      legalEntityId: q.legalEntityId,
      managerId: q.managerId,
      employmentType: q.employmentType,
    });
    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.header('Content-Disposition', `attachment; filename="${filename}"`);
    return csv;
  }
}
