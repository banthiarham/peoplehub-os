import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Scopes } from '../../common/decorators/scopes.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { AttendanceService } from './attendance.service';
import {
  AssignShiftDto,
  CheckInDto,
  CheckOutDto,
  CreateShiftSwapDto,
  CreateShiftDto,
  DateQueryDto,
  DecideShiftSwapDto,
  FinalizeAttendanceDto,
  ImportBiometricPunchesDto,
  ImportAttendanceRowsDto,
  ImportRosterDto,
  ListCaptureSettingsDto,
  ListAttendanceDto,
  MonthQueryDto,
  QrPunchDto,
  RegularizeDto,
  UpdateAttendanceRecordDto,
  UpdateShiftWeeklyOffsDto,
  UpsertCaptureSettingDto,
  UpsertAttendanceRuleDto,
  UpsertHolidayDto,
} from './dto/attendance.dto';

@ApiTags('Attendance')
@ApiBearerAuth()
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Post('check-in')
  @ApiOperation({ summary: 'Punch in for today' })
  @Scopes('attendance:write')
  checkIn(@CurrentUser() user: AuthUser, @Body() dto: CheckInDto) {
    return this.attendance.checkIn(user, dto);
  }

  @Post('qr/check-in')
  @ApiOperation({ summary: 'Punch in using a location QR code' })
  @Scopes('attendance:write')
  qrCheckIn(@CurrentUser() user: AuthUser, @Body() dto: QrPunchDto) {
    return this.attendance.qrCheckIn(user, dto);
  }

  @Post('check-out')
  @ApiOperation({ summary: 'Punch out for today' })
  @Scopes('attendance:write')
  checkOut(@CurrentUser() user: AuthUser, @Body() dto: CheckOutDto) {
    return this.attendance.checkOut(user, dto);
  }

  @Get('device/me')
  @ApiOperation({ summary: 'Own registered punch device, if any' })
  @Scopes('attendance:read')
  myDevice(@CurrentUser() user: AuthUser) {
    return this.attendance.myDevice(user);
  }

  @Get('device/:employeeId')
  @Roles('Super Admin', 'HR Admin')
  @ApiOperation({ summary: "An employee's registered punch device, if any" })
  @Scopes('attendance:read')
  deviceOf(@CurrentUser() user: AuthUser, @Param('employeeId') employeeId: string) {
    return this.attendance.deviceOf(user.tenantId, employeeId);
  }

  @Delete('device/:employeeId')
  @Roles('Super Admin', 'HR Admin')
  @Scopes('attendance:write')
  @ApiOperation({ summary: 'Reset an employee device binding (e.g. phone change)' })
  resetDevice(@CurrentUser() user: AuthUser, @Param('employeeId') employeeId: string) {
    return this.attendance.resetDevice(user.tenantId, employeeId);
  }

  @Get('today')
  @ApiOperation({ summary: 'Org-wide attendance for today or a selected date' })
  @Scopes('attendance:read')
  today(@CurrentUser() user: AuthUser, @Query() q: DateQueryDto) {
    return q.date
      ? this.attendance.forDate(user.tenantId, new Date(q.date))
      : this.attendance.today(user.tenantId);
  }

  @Get('me')
  @ApiOperation({ summary: 'Own attendance for a month' })
  @Scopes('attendance:read')
  me(@CurrentUser() user: AuthUser, @Query() q: MonthQueryDto) {
    return this.attendance.me(user, q.month);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Monthly org attendance stats' })
  @Scopes('attendance:read')
  stats(@CurrentUser() user: AuthUser, @Query() q: MonthQueryDto) {
    return this.attendance.stats(user.tenantId, q.month);
  }

  @Get('export')
  @Roles('Super Admin', 'HR Admin')
  @Scopes('attendance:read')
  @ApiOperation({ summary: 'Download a month of org attendance as CSV' })
  async exportCsv(
    @CurrentUser() user: AuthUser,
    @Query() q: MonthQueryDto,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const { csv, month } = await this.attendance.exportMonthCsv(user.tenantId, q.month);
    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.header('Content-Disposition', `attachment; filename="attendance-${month}.csv"`);
    return csv;
  }

  @Post('import/biometric')
  @Roles('Super Admin', 'HR Admin')
  @Scopes('attendance:import')
  @ApiOperation({ summary: 'Import biometric device punches by employee code' })
  importBiometric(@CurrentUser() user: AuthUser, @Body() dto: ImportBiometricPunchesDto) {
    return this.attendance.importBiometricPunches(user.tenantId, dto);
  }

  @Post('import/manual')
  @Roles('Super Admin', 'HR Admin')
  @Scopes('attendance:import')
  @ApiOperation({ summary: 'Import manually corrected attendance rows by employee code' })
  importManual(@CurrentUser() user: AuthUser, @Body() dto: ImportAttendanceRowsDto) {
    return this.attendance.importAttendanceRows(user.tenantId, dto, 'MANUAL');
  }

  @Post('import/api-sync')
  @Roles('Super Admin', 'HR Admin', 'Integration Admin')
  @Scopes('attendance:import')
  @ApiOperation({ summary: 'Sync attendance rows from an external attendance system' })
  importApiSync(@CurrentUser() user: AuthUser, @Body() dto: ImportAttendanceRowsDto) {
    return this.attendance.importAttendanceRows(user.tenantId, dto, 'API');
  }

  @Get('rules')
  @Roles('Super Admin', 'HR Admin')
  @Scopes('attendance:read')
  rules(@CurrentUser() user: AuthUser) {
    return this.attendance.listRules(user.tenantId);
  }

  @Post('rules')
  @Roles('Super Admin', 'HR Admin')
  @Scopes('attendance:write')
  createRule(@CurrentUser() user: AuthUser, @Body() dto: UpsertAttendanceRuleDto) {
    return this.attendance.createRule(user.tenantId, dto);
  }

  @Patch('rules/:id')
  @Roles('Super Admin', 'HR Admin')
  @Scopes('attendance:write')
  updateRule(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpsertAttendanceRuleDto) {
    return this.attendance.updateRule(user.tenantId, id, dto);
  }

  @Get('capture-settings')
  @Roles('Super Admin', 'HR Admin')
  @ApiOperation({ summary: 'List attendance capture mode settings' })
  @Scopes('attendance:read')
  captureSettings(@CurrentUser() user: AuthUser, @Query() q: ListCaptureSettingsDto) {
    return this.attendance.listCaptureSettings(user.tenantId, q.locationId);
  }

  @Patch('capture-settings')
  @Roles('Super Admin', 'HR Admin')
  @ApiOperation({ summary: 'Enable/disable an attendance capture mode' })
  @Scopes('attendance:write')
  updateCaptureSetting(@CurrentUser() user: AuthUser, @Body() dto: UpsertCaptureSettingDto) {
    return this.attendance.upsertCaptureSetting(user.tenantId, dto);
  }

  @Get('shifts')
  @Scopes('attendance:read')
  listShifts(@CurrentUser() user: AuthUser) {
    return this.attendance.listShifts(user.tenantId);
  }

  @Post('shifts')
  @Roles('Super Admin', 'HR Admin')
  @Scopes('attendance:write')
  createShift(@CurrentUser() user: AuthUser, @Body() dto: CreateShiftDto) {
    return this.attendance.createShift(user.tenantId, dto);
  }

  @Patch('shifts/:id/weekly-offs')
  @Roles('Super Admin', 'HR Admin')
  @Scopes('attendance:write')
  @ApiOperation({ summary: 'Update only the configured weekly off days for a shift' })
  updateShiftWeeklyOffs(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateShiftWeeklyOffsDto,
  ) {
    return this.attendance.updateShiftWeeklyOffs(user.tenantId, id, dto);
  }

  @Post('shifts/assign')
  @Roles('Super Admin', 'HR Admin')
  @Scopes('attendance:write')
  assignShift(@CurrentUser() user: AuthUser, @Body() dto: AssignShiftDto) {
    return this.attendance.assignShift(user.tenantId, dto);
  }

  @Post('rosters/import')
  @Roles('Super Admin', 'HR Admin')
  @Scopes('attendance:import')
  importRoster(@CurrentUser() user: AuthUser, @Body() dto: ImportRosterDto) {
    return this.attendance.importRoster(user.tenantId, user.employeeId ?? undefined, dto);
  }

  @Get('rosters')
  @Roles('Super Admin', 'HR Admin', 'Manager')
  @Scopes('attendance:read')
  listRosters(@CurrentUser() user: AuthUser) {
    return this.attendance.listRosters(user.tenantId);
  }

  @Get('finalization/preview')
  @Roles('Super Admin', 'HR Admin', 'Payroll Admin')
  @Scopes('attendance:read')
  finalizationPreview(@CurrentUser() user: AuthUser, @Query() q: FinalizeAttendanceDto) {
    return this.attendance.finalizationPreview(user.tenantId, q);
  }

  @Post('finalization/finalize')
  @Roles('Super Admin', 'HR Admin', 'Payroll Admin')
  @Scopes('attendance:write')
  finalize(@CurrentUser() user: AuthUser, @Body() dto: FinalizeAttendanceDto) {
    return this.attendance.finalizeMonth(user.tenantId, user.employeeId ?? undefined, dto);
  }

  @Get('comp-offs')
  @Scopes('attendance:read')
  compOffs(@CurrentUser() user: AuthUser) {
    return this.attendance.listCompOffs(user);
  }

  @Get('shift-swaps')
  @Scopes('attendance:read')
  shiftSwaps(@CurrentUser() user: AuthUser) {
    return this.attendance.listShiftSwaps(user);
  }

  @Post('shift-swaps')
  @Scopes('attendance:write')
  createShiftSwap(@CurrentUser() user: AuthUser, @Body() dto: CreateShiftSwapDto) {
    return this.attendance.createShiftSwap(user, dto);
  }

  @Patch('shift-swaps/:id')
  @Roles('Super Admin', 'HR Admin', 'Manager')
  @Scopes('attendance:approve')
  decideShiftSwap(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DecideShiftSwapDto) {
    return this.attendance.decideShiftSwap(user.tenantId, user.employeeId ?? undefined, id, dto);
  }

  @Get('holidays')
  @Scopes('attendance:read')
  holidays(@CurrentUser() user: AuthUser, @Query('year') year?: string) {
    return this.attendance.holidays(user.tenantId, year ? Number(year) : undefined);
  }

  @Post('holidays')
  @Roles('Super Admin', 'HR Admin')
  @Scopes('attendance:write')
  createHoliday(@CurrentUser() user: AuthUser, @Body() dto: UpsertHolidayDto, @Query('calendarId') calendarId?: string) {
    return this.attendance.createHoliday(user.tenantId, dto, calendarId);
  }

  @Post('regularize')
  @Scopes('attendance:write')
  regularize(@CurrentUser() user: AuthUser, @Body() dto: RegularizeDto) {
    return this.attendance.regularize(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Paginated attendance history' })
  @Scopes('attendance:read')
  list(@CurrentUser() user: AuthUser, @Query() q: ListAttendanceDto) {
    return this.attendance.list(user.tenantId, q);
  }

  @Patch('records/:id')
  @Roles('Super Admin', 'HR Admin')
  @Scopes('attendance:write')
  @ApiOperation({ summary: 'Edit an unfinalized manual attendance record' })
  updateRecord(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateAttendanceRecordDto) {
    return this.attendance.updateRecord(user.tenantId, id, dto);
  }

  @Delete('records/:id')
  @Roles('Super Admin', 'HR Admin')
  @Scopes('attendance:write')
  @ApiOperation({ summary: 'Delete an unfinalized manual attendance record' })
  deleteRecord(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.attendance.deleteRecord(user.tenantId, id);
  }
}
