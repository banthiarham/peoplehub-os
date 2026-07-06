import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { AttendanceService } from './attendance.service';
import {
  AssignShiftDto,
  CheckInDto,
  CheckOutDto,
  CreateShiftSwapDto,
  CreateShiftDto,
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
  checkIn(@CurrentUser() user: AuthUser, @Body() dto: CheckInDto) {
    return this.attendance.checkIn(user, dto);
  }

  @Post('qr/check-in')
  @ApiOperation({ summary: 'Punch in using a location QR code' })
  qrCheckIn(@CurrentUser() user: AuthUser, @Body() dto: QrPunchDto) {
    return this.attendance.qrCheckIn(user, dto);
  }

  @Post('check-out')
  @ApiOperation({ summary: 'Punch out for today' })
  checkOut(@CurrentUser() user: AuthUser, @Body() dto: CheckOutDto) {
    return this.attendance.checkOut(user, dto);
  }

  @Get('device/me')
  @ApiOperation({ summary: 'Own registered punch device, if any' })
  myDevice(@CurrentUser() user: AuthUser) {
    return this.attendance.myDevice(user);
  }

  @Get('device/:employeeId')
  @Roles('Super Admin', 'HR Admin')
  @ApiOperation({ summary: "An employee's registered punch device, if any" })
  deviceOf(@CurrentUser() user: AuthUser, @Param('employeeId') employeeId: string) {
    return this.attendance.deviceOf(user.tenantId, employeeId);
  }

  @Delete('device/:employeeId')
  @Roles('Super Admin', 'HR Admin')
  @ApiOperation({ summary: 'Reset an employee device binding (e.g. phone change)' })
  resetDevice(@CurrentUser() user: AuthUser, @Param('employeeId') employeeId: string) {
    return this.attendance.resetDevice(user.tenantId, employeeId);
  }

  @Get('today')
  @ApiOperation({ summary: 'Org-wide live attendance for today' })
  today(@CurrentUser() user: AuthUser) {
    return this.attendance.today(user.tenantId);
  }

  @Get('me')
  @ApiOperation({ summary: 'Own attendance for a month' })
  me(@CurrentUser() user: AuthUser, @Query() q: MonthQueryDto) {
    return this.attendance.me(user, q.month);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Monthly org attendance stats' })
  stats(@CurrentUser() user: AuthUser, @Query() q: MonthQueryDto) {
    return this.attendance.stats(user.tenantId, q.month);
  }

  @Get('export')
  @Roles('Super Admin', 'HR Admin')
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
  @ApiOperation({ summary: 'Import biometric device punches by employee code' })
  importBiometric(@CurrentUser() user: AuthUser, @Body() dto: ImportBiometricPunchesDto) {
    return this.attendance.importBiometricPunches(user.tenantId, dto);
  }

  @Post('import/manual')
  @Roles('Super Admin', 'HR Admin')
  @ApiOperation({ summary: 'Import manually corrected attendance rows by employee code' })
  importManual(@CurrentUser() user: AuthUser, @Body() dto: ImportAttendanceRowsDto) {
    return this.attendance.importAttendanceRows(user.tenantId, dto, 'MANUAL');
  }

  @Post('import/api-sync')
  @Roles('Super Admin', 'HR Admin', 'Integration Admin')
  @ApiOperation({ summary: 'Sync attendance rows from an external attendance system' })
  importApiSync(@CurrentUser() user: AuthUser, @Body() dto: ImportAttendanceRowsDto) {
    return this.attendance.importAttendanceRows(user.tenantId, dto, 'API');
  }

  @Get('rules')
  @Roles('Super Admin', 'HR Admin')
  rules(@CurrentUser() user: AuthUser) {
    return this.attendance.listRules(user.tenantId);
  }

  @Post('rules')
  @Roles('Super Admin', 'HR Admin')
  createRule(@CurrentUser() user: AuthUser, @Body() dto: UpsertAttendanceRuleDto) {
    return this.attendance.createRule(user.tenantId, dto);
  }

  @Patch('rules/:id')
  @Roles('Super Admin', 'HR Admin')
  updateRule(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpsertAttendanceRuleDto) {
    return this.attendance.updateRule(user.tenantId, id, dto);
  }

  @Get('capture-settings')
  @Roles('Super Admin', 'HR Admin')
  @ApiOperation({ summary: 'List attendance capture mode settings' })
  captureSettings(@CurrentUser() user: AuthUser, @Query() q: ListCaptureSettingsDto) {
    return this.attendance.listCaptureSettings(user.tenantId, q.locationId);
  }

  @Patch('capture-settings')
  @Roles('Super Admin', 'HR Admin')
  @ApiOperation({ summary: 'Enable/disable an attendance capture mode' })
  updateCaptureSetting(@CurrentUser() user: AuthUser, @Body() dto: UpsertCaptureSettingDto) {
    return this.attendance.upsertCaptureSetting(user.tenantId, dto);
  }

  @Get('shifts')
  listShifts(@CurrentUser() user: AuthUser) {
    return this.attendance.listShifts(user.tenantId);
  }

  @Post('shifts')
  @Roles('Super Admin', 'HR Admin')
  createShift(@CurrentUser() user: AuthUser, @Body() dto: CreateShiftDto) {
    return this.attendance.createShift(user.tenantId, dto);
  }

  @Post('shifts/assign')
  @Roles('Super Admin', 'HR Admin')
  assignShift(@CurrentUser() user: AuthUser, @Body() dto: AssignShiftDto) {
    return this.attendance.assignShift(user.tenantId, dto);
  }

  @Post('rosters/import')
  @Roles('Super Admin', 'HR Admin')
  importRoster(@CurrentUser() user: AuthUser, @Body() dto: ImportRosterDto) {
    return this.attendance.importRoster(user.tenantId, user.employeeId ?? undefined, dto);
  }

  @Get('rosters')
  @Roles('Super Admin', 'HR Admin', 'Manager')
  listRosters(@CurrentUser() user: AuthUser) {
    return this.attendance.listRosters(user.tenantId);
  }

  @Get('finalization/preview')
  @Roles('Super Admin', 'HR Admin', 'Payroll Admin')
  finalizationPreview(@CurrentUser() user: AuthUser, @Query() q: FinalizeAttendanceDto) {
    return this.attendance.finalizationPreview(user.tenantId, q);
  }

  @Post('finalization/finalize')
  @Roles('Super Admin', 'HR Admin', 'Payroll Admin')
  finalize(@CurrentUser() user: AuthUser, @Body() dto: FinalizeAttendanceDto) {
    return this.attendance.finalizeMonth(user.tenantId, user.employeeId ?? undefined, dto);
  }

  @Get('comp-offs')
  compOffs(@CurrentUser() user: AuthUser) {
    return this.attendance.listCompOffs(user);
  }

  @Get('shift-swaps')
  shiftSwaps(@CurrentUser() user: AuthUser) {
    return this.attendance.listShiftSwaps(user);
  }

  @Post('shift-swaps')
  createShiftSwap(@CurrentUser() user: AuthUser, @Body() dto: CreateShiftSwapDto) {
    return this.attendance.createShiftSwap(user, dto);
  }

  @Patch('shift-swaps/:id')
  @Roles('Super Admin', 'HR Admin', 'Manager')
  decideShiftSwap(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DecideShiftSwapDto) {
    return this.attendance.decideShiftSwap(user.tenantId, user.employeeId ?? undefined, id, dto);
  }

  @Get('holidays')
  holidays(@CurrentUser() user: AuthUser, @Query('year') year?: string) {
    return this.attendance.holidays(user.tenantId, year ? Number(year) : undefined);
  }

  @Post('holidays')
  @Roles('Super Admin', 'HR Admin')
  createHoliday(@CurrentUser() user: AuthUser, @Body() dto: UpsertHolidayDto, @Query('calendarId') calendarId?: string) {
    return this.attendance.createHoliday(user.tenantId, dto, calendarId);
  }

  @Post('regularize')
  regularize(@CurrentUser() user: AuthUser, @Body() dto: RegularizeDto) {
    return this.attendance.regularize(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Paginated attendance history' })
  list(@CurrentUser() user: AuthUser, @Query() q: ListAttendanceDto) {
    return this.attendance.list(user.tenantId, q);
  }
}
