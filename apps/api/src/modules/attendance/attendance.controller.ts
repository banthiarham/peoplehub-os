import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { AttendanceService } from './attendance.service';
import {
  AssignShiftDto,
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
  checkIn(@CurrentUser() user: AuthUser) {
    return this.attendance.checkIn(user);
  }

  @Post('check-out')
  @ApiOperation({ summary: 'Punch out for today' })
  checkOut(@CurrentUser() user: AuthUser) {
    return this.attendance.checkOut(user);
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
