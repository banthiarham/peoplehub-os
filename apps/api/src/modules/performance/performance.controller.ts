import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';
import {
  CreateCalibrationDto,
  CreateCheckInDto,
  CreateCompetencyFrameworkDto,
  CreateReviewCycleDto,
  CreateGoalDto,
  CreateOneOnOneDto,
  CreatePipDto,
  CreatePromotionRecommendationDto,
  GiveFeedbackDto,
  SubmitReviewDto,
  UpdateGoalDto,
  UpdateOneOnOneDto,
  UpdatePipDto,
  UpdateReviewCycleDto,
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

  @Post('cycles')
  createCycle(@CurrentUser() user: AuthUser, @Body() dto: CreateReviewCycleDto) {
    return this.performance.createCycle(user.tenantId, dto);
  }

  @Patch('cycles/:id')
  updateCycle(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateReviewCycleDto,
  ) {
    return this.performance.updateCycle(user.tenantId, id, dto);
  }

  @Get('cycles/:id/completion')
  cycleCompletion(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.performance.cycleCompletion(user.tenantId, id);
  }

  @Get('cycles/:id/distribution')
  cycleDistribution(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.performance.ratingDistribution(user.tenantId, id);
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

  @Get('check-ins')
  listCheckIns(
    @CurrentUser() user: AuthUser,
    @Query('employeeId') employeeId?: string,
    @Query('goalId') goalId?: string,
  ) {
    return this.performance.listCheckIns(user.tenantId, employeeId, goalId);
  }

  @Post('check-ins')
  createCheckIn(@CurrentUser() user: AuthUser, @Body() dto: CreateCheckInDto) {
    return this.performance.createCheckIn(user.tenantId, dto);
  }

  @Get('one-on-ones')
  listOneOnOnes(
    @CurrentUser() user: AuthUser,
    @Query('employeeId') employeeId?: string,
    @Query('managerId') managerId?: string,
  ) {
    return this.performance.listOneOnOnes(user.tenantId, employeeId, managerId);
  }

  @Post('one-on-ones')
  createOneOnOne(@CurrentUser() user: AuthUser, @Body() dto: CreateOneOnOneDto) {
    return this.performance.createOneOnOne(user.tenantId, dto);
  }

  @Patch('one-on-ones/:id')
  updateOneOnOne(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateOneOnOneDto) {
    return this.performance.updateOneOnOne(user.tenantId, id, dto);
  }

  @Get('frameworks')
  listFrameworks(@CurrentUser() user: AuthUser) {
    return this.performance.listFrameworks(user.tenantId);
  }

  @Post('frameworks')
  createFramework(@CurrentUser() user: AuthUser, @Body() dto: CreateCompetencyFrameworkDto) {
    return this.performance.createFramework(user.tenantId, dto);
  }

  @Get('calibrations')
  listCalibrations(@CurrentUser() user: AuthUser, @Query('reviewCycleId') reviewCycleId?: string) {
    return this.performance.listCalibrations(user.tenantId, reviewCycleId);
  }

  @Post('calibrations')
  calibrate(@CurrentUser() user: AuthUser, @Body() dto: CreateCalibrationDto) {
    return this.performance.calibrate(user, dto);
  }

  @Get('promotions')
  promotions(@CurrentUser() user: AuthUser) {
    return this.performance.listPromotionRecommendations(user.tenantId);
  }

  @Post('promotions')
  createPromotion(@CurrentUser() user: AuthUser, @Body() dto: CreatePromotionRecommendationDto) {
    return this.performance.createPromotionRecommendation(user, dto);
  }

  @Get('pips')
  listPips(@CurrentUser() user: AuthUser, @Query('employeeId') employeeId?: string) {
    return this.performance.listPips(user.tenantId, employeeId);
  }

  @Post('pips')
  createPip(@CurrentUser() user: AuthUser, @Body() dto: CreatePipDto) {
    return this.performance.createPip(user, dto);
  }

  @Patch('pips/:id')
  updatePip(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdatePipDto) {
    return this.performance.updatePip(user.tenantId, id, dto);
  }

  @Get('stats')
  stats(@CurrentUser() user: AuthUser) {
    return this.performance.stats(user.tenantId);
  }
}
