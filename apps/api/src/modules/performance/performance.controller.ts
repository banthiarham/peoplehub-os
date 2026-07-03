import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';
import {
  CreateGoalDto,
  GiveFeedbackDto,
  SubmitReviewDto,
  UpdateGoalDto,
} from './dto/performance.dto';
import { PerformanceService } from './performance.service';

@ApiTags('Performance')
@ApiBearerAuth()
@Controller('performance')
export class PerformanceController {
  constructor(private readonly performance: PerformanceService) {}

  @Get('goals')
  listGoals(
    @CurrentUser() user: AuthUser,
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: string,
  ) {
    return this.performance.listGoals(user.tenantId, employeeId, status);
  }

  @Get('goals/me')
  myGoals(@CurrentUser() user: AuthUser) {
    return this.performance.listGoals(user.tenantId, user.employeeId ?? undefined);
  }

  @Post('goals')
  createGoal(@CurrentUser() user: AuthUser, @Body() dto: CreateGoalDto) {
    return this.performance.createGoal(user.tenantId, dto);
  }

  @Patch('goals/:id')
  updateGoal(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateGoalDto) {
    return this.performance.updateGoal(user.tenantId, id, dto);
  }

  @Get('cycles')
  listCycles(@CurrentUser() user: AuthUser) {
    return this.performance.listCycles(user.tenantId);
  }

  @Post('reviews')
  submitReview(@CurrentUser() user: AuthUser, @Body() dto: SubmitReviewDto) {
    return this.performance.submitReview(user, dto);
  }

  @Post('feedback')
  giveFeedback(@CurrentUser() user: AuthUser, @Body() dto: GiveFeedbackDto) {
    return this.performance.giveFeedback(user, dto);
  }

  @Get('feedback')
  listFeedback(@CurrentUser() user: AuthUser, @Query('employeeId') employeeId?: string) {
    return this.performance.listFeedback(user.tenantId, employeeId);
  }

  @Get('stats')
  stats(@CurrentUser() user: AuthUser) {
    return this.performance.stats(user.tenantId);
  }
}
