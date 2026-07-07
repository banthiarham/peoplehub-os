import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthUser } from '../../common/types/auth-user';
import {
  AnonymousFeedbackDto,
  CreateAnnouncementDto,
  CreatePollDto,
  CreateSurveyDto,
  RecognizeDto,
  RespondSurveyDto,
  UpdateSurveyDto,
} from './dto/engagement.dto';
import { EngagementService } from './engagement.service';

@ApiTags('Engagement')
@ApiBearerAuth()
@Controller('engagement')
export class EngagementController {
  constructor(private readonly engagement: EngagementService) {}

  @Get('surveys')
  listSurveys(@CurrentUser() user: AuthUser, @Query('type') type?: string) {
    return this.engagement.listSurveys(user.tenantId, type);
  }

  @Get('surveys/analytics')
  surveyAnalytics(@CurrentUser() user: AuthUser) {
    return this.engagement.surveyAnalytics(user.tenantId);
  }

  @Post('surveys')
  @Roles('Super Admin', 'HR Admin')
  createSurvey(@CurrentUser() user: AuthUser, @Body() dto: CreateSurveyDto) {
    return this.engagement.createSurvey(user.tenantId, dto);
  }

  @Patch('surveys/:id')
  @Roles('Super Admin', 'HR Admin')
  updateSurvey(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateSurveyDto) {
    return this.engagement.updateSurvey(user.tenantId, id, dto);
  }

  @Get('surveys/:id/results')
  surveyResults(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.engagement.surveyResults(user.tenantId, id);
  }

  @Get('surveys/:id/segments')
  surveySegments(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query('by') by?: string) {
    return this.engagement.surveySegments(user.tenantId, id, by);
  }

  @Post('surveys/:id/respond')
  respond(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RespondSurveyDto) {
    return this.engagement.respond(user, id, dto.responses);
  }

  @Get('recognitions')
  listRecognitions(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.engagement.listRecognitions(
      user.tenantId,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 20,
    );
  }

  @Post('recognitions')
  recognize(@CurrentUser() user: AuthUser, @Body() dto: RecognizeDto) {
    return this.engagement.recognize(user, dto);
  }

  @Get('feed')
  feed(@CurrentUser() user: AuthUser) {
    return this.engagement.feed(user.tenantId);
  }

  @Get('announcements')
  announcements(@CurrentUser() user: AuthUser) {
    return this.engagement.listAnnouncements(user.tenantId);
  }

  @Post('announcements')
  @Roles('Super Admin', 'HR Admin')
  createAnnouncement(@CurrentUser() user: AuthUser, @Body() dto: CreateAnnouncementDto) {
    return this.engagement.createAnnouncement(user.tenantId, dto);
  }

  @Post('polls')
  @Roles('Super Admin', 'HR Admin')
  createPoll(@CurrentUser() user: AuthUser, @Body() dto: CreatePollDto) {
    return this.engagement.createPoll(user.tenantId, dto);
  }

  @Post('anonymous-feedback')
  anonymousFeedback(@CurrentUser() user: AuthUser, @Body() dto: AnonymousFeedbackDto) {
    return this.engagement.submitAnonymousFeedback(user.tenantId, dto);
  }

  @Get('anonymous-feedback')
  @Roles('Super Admin', 'HR Admin')
  listAnonymousFeedback(@CurrentUser() user: AuthUser) {
    return this.engagement.listAnonymousFeedback(user.tenantId);
  }

  @Get('rewards/leaderboard')
  rewardsLeaderboard(@CurrentUser() user: AuthUser) {
    return this.engagement.rewardsLeaderboard(user.tenantId);
  }

  @Get('milestones')
  milestones(@CurrentUser() user: AuthUser) {
    return this.engagement.milestones(user.tenantId);
  }

  @Get('stats')
  stats(@CurrentUser() user: AuthUser) {
    return this.engagement.stats(user.tenantId);
  }
}
