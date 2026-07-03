import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { RecognizeDto, RespondSurveyDto } from './dto/engagement.dto';
import { EngagementService } from './engagement.service';

@ApiTags('Engagement')
@ApiBearerAuth()
@Controller('engagement')
export class EngagementController {
  constructor(private readonly engagement: EngagementService) {}

  @Get('surveys')
  listSurveys(@CurrentUser() user: AuthUser) {
    return this.engagement.listSurveys(user.tenantId);
  }

  @Get('surveys/:id/results')
  surveyResults(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.engagement.surveyResults(user.tenantId, id);
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

  @Get('stats')
  stats(@CurrentUser() user: AuthUser) {
    return this.engagement.stats(user.tenantId);
  }
}
