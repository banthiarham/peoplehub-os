import { Controller, Get, Query, Res } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';
import {
  AnalyticsService,
  PREVIEW_ROW_LIMIT,
  type ReportFormat,
  type ReportKind,
} from './analytics.service';
import { XLSX_CONTENT_TYPE } from '../../common/utils/xlsx';
import { redactDashboard } from './dashboard-visibility';
import { Roles } from '../../common/decorators/roles.decorator';

// Mirrors CAPABILITY.reports in apps/web/src/lib/authz.ts. These routes return raw,
// unredacted tenant-wide figures (unlike `dashboard`, which already blanks widget
// groups the caller may not see via `redactDashboard`). Gated on role only, not
// `@Scopes('reports:read')`: Manager also holds that scope (at DIRECT_REPORTS), and
// `RolesGuard` matches roles OR scopes, so adding the scope would let Manager bypass
// this role list even though CAPABILITY.reports deliberately excludes them.
const REPORTS_ROLES = ['Super Admin', 'Tenant Owner', 'HR Admin', 'Payroll Admin', 'Finance Admin', 'Auditor', 'Read-only Leadership User', 'Recruiter'];

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Full dashboard payload in one call, filtered to the caller role group' })
  async dashboard(
    @CurrentUser() user: AuthUser,
    @Query('departmentId') departmentId?: string,
    @Query('locationId') locationId?: string,
    @Query('legalEntityId') legalEntityId?: string,
    @Query('managerId') managerId?: string,
    @Query('employmentType') employmentType?: string,
  ) {
    const payload = await this.analytics.dashboard(user.tenantId, {
      departmentId,
      locationId,
      legalEntityId,
      managerId,
      employmentType,
    });
    // Widget groups the caller may not see are blanked here, on the server, so the
    // figures never reach the browser.
    return redactDashboard(payload, user);
  }

  @Get('headcount-trend')
  @Roles(...REPORTS_ROLES)
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
  @Roles(...REPORTS_ROLES)
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
  @Roles(...REPORTS_ROLES)
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
  @Roles(...REPORTS_ROLES)
  @ApiOperation({
    summary: 'Report rows with labelled columns, for the on-screen preview',
    description:
      'The attendance reports are built from the attendance ledger, so absent, on-leave, ' +
      'weekly-off and holiday days are present rather than only the days with a record.',
  })
  reportBuilder(
    @CurrentUser() user: AuthUser,
    @Query('report') report: ReportKind = 'employees',
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: string,
    @Query('departmentId') departmentId?: string,
    @Query('locationId') locationId?: string,
    @Query('legalEntityId') legalEntityId?: string,
    @Query('managerId') managerId?: string,
    @Query('employmentType') employmentType?: string,
    @Query('includeNonWorkingDays') includeNonWorkingDays?: string,
  ) {
    return this.analytics.reportTable(
      user.tenantId,
      report,
      {
        from,
        to,
        status,
        departmentId,
        locationId,
        legalEntityId,
        managerId,
        employmentType,
        includeNonWorkingDays: parseBooleanFlag(includeNonWorkingDays),
      },
      // The preview renders a handful of rows; `rowCount` reports the true total.
      PREVIEW_ROW_LIMIT,
    );
  }

  @Get('reports/builder/export')
  @Roles(...REPORTS_ROLES)
  @ApiOperation({
    summary: 'Download a report as a styled workbook (default) or as CSV',
    description:
      'Pass `format=csv` for plain CSV. XLSX adds a frozen header, filters, per-employee ' +
      'banding, one sheet per month for a multi-month register, and a Report Info sheet.',
  })
  async reportBuilderExport(
    @CurrentUser() user: AuthUser,
    @Query()
    q: {
      report?: ReportKind;
      format?: ReportFormat;
      from?: string;
      to?: string;
      status?: string;
      departmentId?: string;
      locationId?: string;
      legalEntityId?: string;
      managerId?: string;
      employmentType?: string;
      includeNonWorkingDays?: string;
    },
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const report = q.report ?? 'employees';
    const options = {
      from: q.from,
      to: q.to,
      status: q.status,
      departmentId: q.departmentId,
      locationId: q.locationId,
      legalEntityId: q.legalEntityId,
      managerId: q.managerId,
      employmentType: q.employmentType,
      includeNonWorkingDays: parseBooleanFlag(q.includeNonWorkingDays),
    };

    if (q.format === 'csv') {
      const { csv, filename } = await this.analytics.reportBuilderCsv(user.tenantId, report, options);
      res.header('Content-Type', 'text/csv; charset=utf-8');
      res.header('Content-Disposition', `attachment; filename="${filename}"`);
      return csv;
    }

    const { buffer, filename } = await this.analytics.reportBuilderWorkbook(
      user.tenantId,
      report,
      options,
    );
    res.header('Content-Type', XLSX_CONTENT_TYPE);
    res.header('Content-Disposition', `attachment; filename="${filename}"`);
    res.header('Content-Length', String(buffer.length));
    // Returned rather than sent through the reply, matching the CSV routes:
    // with `passthrough` the adapter sends this, and Fastify writes a Buffer
    // payload verbatim under the content type set above.
    return buffer;
  }
}

/** Query flags arrive as strings; anything but an explicit false reads as unset. */
function parseBooleanFlag(value: string | undefined): boolean | undefined {
  if (value === undefined || value === '') return undefined;
  return !['false', '0', 'no'].includes(value.toLowerCase());
}
