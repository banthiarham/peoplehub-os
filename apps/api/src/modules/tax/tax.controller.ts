import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TaxService } from './tax.service';
import { TdsEngineService } from './tds-engine.service';
import { TaxRegime, AgeCategory } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { Scopes } from '../../common/decorators/scopes.decorator';

// Mirrors CAPABILITY.tax in apps/web/src/lib/authz.ts — the roles the tax module
// catalog grants VIEW/EDIT to at ENTIRE_TENANT scope.
//
// Read routes below gate on `@Roles` only, NOT `@Scopes('tax:read')`: the catalog also
// grants Employee `tax:read`, just at OWN_DATA scope, which the scope string does not
// carry. `RolesGuard` matches roles OR scopes, so adding that scope back would let
// Employee bypass the role list. Write routes are safe to pair with `@Scopes('tax:write')`
// because Employee's catalog grant is VIEW-only — it never holds `tax:write`.
const TAX_VIEW_ROLES = ['Super Admin', 'Tenant Owner', 'HR Admin', 'Payroll Admin', 'Finance Admin', 'Auditor', 'Read-only Leadership User'];
const TAX_WRITE_ROLES = ['Super Admin', 'Tenant Owner', 'Payroll Admin'];

@ApiTags('Tax')
@ApiBearerAuth()
@Controller('tax')
export class TaxController {
  constructor(
    private readonly taxService: TaxService,
    private readonly tdsEngine: TdsEngineService,
  ) {}

  // ── Tax Year ──────────────────────────────────────────────────────────────

  @Get('years')
  @Roles(...TAX_VIEW_ROLES)
  @ApiOperation({ summary: 'List tax years' })
  getTaxYears(@Query('tenantId') tenantId: string) {
    return this.taxService.getTaxYears(tenantId);
  }

  @Post('years/:id/clone')
  @Roles(...TAX_WRITE_ROLES)
  @Scopes('tax:write')
  @ApiOperation({ summary: 'Clone tax rules into a new financial year' })
  cloneTaxYear(
    @Param('id') sourceTaxYearId: string,
    @Query('tenantId') tenantId: string,
    @Body() body: { financialYear: string; assessmentYear: string },
  ) {
    return this.taxService.cloneTaxYear(tenantId, sourceTaxYearId, body.financialYear, body.assessmentYear);
  }

  // ── Tax Regime ────────────────────────────────────────────────────────────

  @Get('regimes')
  @Roles(...TAX_VIEW_ROLES)
  @ApiOperation({ summary: 'List tax regime configurations' })
  getRegimes(@Query('tenantId') tenantId: string, @Query('taxYearId') taxYearId?: string) {
    return this.taxService.getRegimes(tenantId, taxYearId);
  }

  // ── Tax Slabs ─────────────────────────────────────────────────────────────

  @Get('slabs')
  @Roles(...TAX_VIEW_ROLES)
  @ApiOperation({ summary: 'List tax slabs for a financial year' })
  getSlabs(
    @Query('tenantId') tenantId: string,
    @Query('taxYearId') taxYearId: string,
    @Query('regime') regime?: TaxRegime,
    @Query('ageCategory') ageCategory?: AgeCategory,
  ) {
    return this.taxService.getSlabs(tenantId, taxYearId, regime, ageCategory);
  }

  @Post('slabs/import')
  @Roles(...TAX_WRITE_ROLES)
  @Scopes('tax:write')
  @ApiOperation({ summary: 'Import/replace tax slabs for a financial year' })
  importSlabs(
    @Query('tenantId') tenantId: string,
    @Query('taxYearId') taxYearId: string,
    @Body() body: { slabs: Parameters<TaxService['importSlabs']>[2] },
  ) {
    return this.taxService.importSlabs(tenantId, taxYearId, body.slabs);
  }

  // ── Employee Tax ──────────────────────────────────────────────────────────

  @Get('employees/:employeeId/tax-profile')
  @Roles(...TAX_VIEW_ROLES)
  @ApiOperation({ summary: 'Get employee tax profile with declarations' })
  getEmployeeTaxProfile(@Param('employeeId') employeeId: string, @Query('tenantId') tenantId: string) {
    return this.taxService.getEmployeeTaxProfile(tenantId, employeeId);
  }

  @Patch('employees/:employeeId/tax-profile')
  @Roles(...TAX_WRITE_ROLES)
  @Scopes('tax:write')
  @ApiOperation({ summary: 'Update employee tax profile (regime, age category, etc.)' })
  upsertTaxProfile(
    @Param('employeeId') employeeId: string,
    @Query('tenantId') tenantId: string,
    @Body() body: Parameters<TaxService['upsertEmployeeTaxProfile']>[2],
  ) {
    return this.taxService.upsertEmployeeTaxProfile(tenantId, employeeId, body);
  }

  @Get('employees/:employeeId/tax-computation')
  @Roles(...TAX_VIEW_ROLES)
  @ApiOperation({ summary: 'Get projected tax computation for an employee' })
  async getEmployeeTaxComputation(
    @Param('employeeId') employeeId: string,
    @Query('tenantId') tenantId: string,
    @Query('taxYearId') taxYearId: string,
    @Query('regime') regime: TaxRegime = 'NEW',
  ) {
    const profile = await this.taxService.getEmployeeTaxProfile(tenantId, employeeId);
    if (!profile) return null;
    return null; // Detailed calculation requires live salary data — wired in payroll run flow
  }

  @Post('employees/:employeeId/declarations')
  @Roles(...TAX_WRITE_ROLES)
  @Scopes('tax:write')
  @ApiOperation({ summary: 'Submit tax declaration (80C, HRA, etc.)' })
  submitDeclaration(
    @Param('employeeId') employeeId: string,
    @Query('tenantId') tenantId: string,
    @Body() body: Parameters<TaxService['submitDeclaration']>[2],
  ) {
    return this.taxService.submitDeclaration(tenantId, employeeId, body);
  }

  // ── Payroll TDS ───────────────────────────────────────────────────────────

  @Post('payroll/calculate')
  @Roles(...TAX_WRITE_ROLES)
  @Scopes('tax:write')
  @ApiOperation({ summary: 'Calculate TDS for an employee on-demand' })
  calculateTds(@Body() body: Parameters<TdsEngineService['calculate']>[0]) {
    return this.tdsEngine.calculate(body);
  }

  @Post('payroll/compare-regimes')
  @Roles(...TAX_WRITE_ROLES)
  @Scopes('tax:write')
  @ApiOperation({ summary: 'Compare old vs new regime and get recommendation' })
  compareRegimes(@Body() body: Parameters<TdsEngineService['compareRegimes']>[0]) {
    return this.tdsEngine.compareRegimes(body);
  }

  @Get('payroll/runs/:payrollRunId/tds-summary')
  @Roles(...TAX_VIEW_ROLES)
  @ApiOperation({ summary: 'Get TDS summary for a completed payroll run' })
  getTdsSummary(@Param('payrollRunId') payrollRunId: string, @Query('tenantId') tenantId: string) {
    return this.taxService.getTdsSummaryForPayrollRun(tenantId, payrollRunId);
  }
}
