import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthUser } from '../../common/types/auth-user';
import {
  CandidateCommunicationDto,
  ConvertCandidateDto,
  CreateCandidateDto,
  CreateJobDto,
  CreateOfferDto,
  DecideJobApprovalDto,
  DecideOfferApprovalDto,
  ListCandidatesDto,
  PublicApplicationDto,
  ScheduleInterviewDto,
  SubmitInterviewScorecardDto,
  UpdateCandidateDto,
  UpdateInterviewDto,
  UpdateJobDto,
  UpdateOfferDto,
} from './dto/recruitment.dto';
import { RecruitmentService } from './recruitment.service';

const HIRING_ROLES = ['Super Admin', 'HR Admin', 'Manager'];

@ApiTags('Recruitment')
@ApiBearerAuth()
@Controller('recruitment')
export class RecruitmentController {
  constructor(private readonly recruitment: RecruitmentService) {}

  @Public()
  @Get('public/:tenantSlug/jobs')
  publicJobs(@Param('tenantSlug') tenantSlug: string) {
    return this.recruitment.publicJobs(tenantSlug);
  }

  @Public()
  @Post('public/:tenantSlug/jobs/:jobId/apply')
  publicApply(
    @Param('tenantSlug') tenantSlug: string,
    @Param('jobId') jobId: string,
    @Body() dto: PublicApplicationDto,
  ) {
    return this.recruitment.publicApply(tenantSlug, jobId, dto);
  }

  @Get('jobs')
  listJobs(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    return this.recruitment.listJobs(user.tenantId, status);
  }

  @Post('jobs')
  @Roles(...HIRING_ROLES)
  createJob(@CurrentUser() user: AuthUser, @Body() dto: CreateJobDto) {
    return this.recruitment.createJob(user.tenantId, dto, user.userId);
  }

  @Patch('jobs/:id')
  @Roles(...HIRING_ROLES)
  updateJob(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateJobDto) {
    return this.recruitment.updateJob(user.tenantId, id, dto);
  }

  @Patch('jobs/:id/approval')
  @Roles(...HIRING_ROLES)
  decideJobApproval(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: DecideJobApprovalDto,
  ) {
    return this.recruitment.decideJobApproval(user.tenantId, id, dto, user.userId);
  }

  @Get('pipeline')
  pipeline(@CurrentUser() user: AuthUser, @Query('jobId') jobId?: string) {
    return this.recruitment.pipeline(user.tenantId, jobId);
  }

  @Get('candidates')
  listCandidates(@CurrentUser() user: AuthUser, @Query() q: ListCandidatesDto) {
    return this.recruitment.listCandidates(user.tenantId, q);
  }

  @Get('candidates/:id')
  getCandidate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.recruitment.getCandidate(user.tenantId, id);
  }

  @Post('candidates')
  @Roles(...HIRING_ROLES)
  createCandidate(@CurrentUser() user: AuthUser, @Body() dto: CreateCandidateDto) {
    return this.recruitment.createCandidate(user.tenantId, dto);
  }

  @Patch('candidates/:id')
  @Roles(...HIRING_ROLES)
  updateCandidate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCandidateDto,
  ) {
    return this.recruitment.updateCandidate(user.tenantId, id, dto);
  }

  @Post('candidates/:id/communications')
  @Roles(...HIRING_ROLES)
  addCommunication(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CandidateCommunicationDto,
  ) {
    return this.recruitment.addCommunication(user.tenantId, id, dto, user.userId);
  }

  @Post('candidates/:id/convert')
  @Roles(...HIRING_ROLES)
  convertCandidate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ConvertCandidateDto,
  ) {
    return this.recruitment.convertCandidate(user.tenantId, id, dto, user.userId);
  }

  @Get('interviews')
  listInterviews(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.recruitment.listInterviews(user.tenantId, from, to);
  }

  @Post('interviews')
  @Roles(...HIRING_ROLES)
  scheduleInterview(@CurrentUser() user: AuthUser, @Body() dto: ScheduleInterviewDto) {
    return this.recruitment.scheduleInterview(user.tenantId, dto);
  }

  @Patch('interviews/:id')
  @Roles(...HIRING_ROLES)
  updateInterview(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateInterviewDto,
  ) {
    return this.recruitment.updateInterview(user.tenantId, id, dto);
  }

  @Post('interviews/:id/scorecard')
  @Roles(...HIRING_ROLES)
  submitInterviewScorecard(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SubmitInterviewScorecardDto,
  ) {
    return this.recruitment.submitInterviewScorecard(user.tenantId, id, dto);
  }

  @Post('offers')
  @Roles(...HIRING_ROLES)
  createOffer(@CurrentUser() user: AuthUser, @Body() dto: CreateOfferDto) {
    return this.recruitment.createOffer(user.tenantId, dto);
  }

  @Get('offers')
  listOffers(@CurrentUser() user: AuthUser) {
    return this.recruitment.listOffers(user.tenantId);
  }

  @Patch('offers/:id')
  @Roles(...HIRING_ROLES)
  updateOffer(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateOfferDto) {
    return this.recruitment.updateOffer(user.tenantId, id, dto);
  }

  @Patch('offers/:id/approval')
  @Roles(...HIRING_ROLES)
  decideOfferApproval(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: DecideOfferApprovalDto,
  ) {
    return this.recruitment.decideOfferApproval(user.tenantId, id, dto, user.userId);
  }

  @Post('offers/:id/generate-letter')
  @Roles(...HIRING_ROLES)
  generateOfferLetter(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.recruitment.generateOfferLetter(user.tenantId, id);
  }

  @Get('stats')
  stats(@CurrentUser() user: AuthUser) {
    return this.recruitment.stats(user.tenantId);
  }
}
