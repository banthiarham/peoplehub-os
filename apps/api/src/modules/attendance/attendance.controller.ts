import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { AttendanceService } from './attendance.service';
import {
  AssignShiftDto,
  CheckInDto,
  CheckOutDto,
  CreateShiftDto,
  ListAttendanceDto,
  MonthQueryDto,
  RegularizeDto,
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

  @Get('holidays')
  holidays(@CurrentUser() user: AuthUser, @Query('year') year?: string) {
    return this.attendance.holidays(user.tenantId, year ? Number(year) : undefined);
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
