import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Scopes } from '../../common/decorators/scopes.decorator';
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

/**
 * May run the hiring pipeline: requisitions, candidates, interviews, communications and offers.
 * Recruiter is included here - this is the role's core job.
 */
const RECRUITMENT_MANAGE_ROLES = ['Super Admin', 'Tenant Owner', 'HR Admin', 'Recruiter', 'Manager'];

/**
 * May decide a requisition or offer approval.
 * Recruiter is deliberately EXCLUDED: a recruiter raises requisitions and offers but
 * does not sign them off. The matching catalog entry grants Recruiter no APPROVE on
 * `recruitment`, so neither the role list nor the scope list lets them through.
 */
const RECRUITMENT_APPROVAL_ROLES = ['Super Admin', 'Tenant Owner', 'HR Admin', 'Manager'];

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
  @Scopes('recruitment:read')
  listJobs(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    return this.recruitment.listJobs(user.tenantId, status);
  }

  @Post('jobs')
  @Roles(...RECRUITMENT_MANAGE_ROLES)
  @Scopes('recruitment:write')
  createJob(@CurrentUser() user: AuthUser, @Body() dto: CreateJobDto) {
    return this.recruitment.createJob(user.tenantId, dto, user.userId);
  }

  @Patch('jobs/:id')
  @Roles(...RECRUITMENT_MANAGE_ROLES)
  @Scopes('recruitment:write')
  updateJob(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateJobDto) {
    return this.recruitment.updateJob(user.tenantId, id, dto);
  }

  @Patch('jobs/:id/approval')
  @Roles(...RECRUITMENT_APPROVAL_ROLES)
  @Scopes('recruitment:approve')
  decideJobApproval(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: DecideJobApprovalDto,
  ) {
    return this.recruitment.decideJobApproval(user.tenantId, id, dto, user.userId);
  }

  @Get('pipeline')
  @Scopes('recruitment:read')
  pipeline(@CurrentUser() user: AuthUser, @Query('jobId') jobId?: string) {
    return this.recruitment.pipeline(user.tenantId, jobId);
  }

  @Get('candidates')
  @Scopes('recruitment:read')
  listCandidates(@CurrentUser() user: AuthUser, @Query() q: ListCandidatesDto) {
    return this.recruitment.listCandidates(user.tenantId, q);
  }

  @Get('candidates/:id')
  @Scopes('recruitment:read')
  getCandidate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.recruitment.getCandidate(user.tenantId, id);
  }

  @Post('candidates')
  @Roles(...RECRUITMENT_MANAGE_ROLES)
  @Scopes('recruitment:write')
  createCandidate(@CurrentUser() user: AuthUser, @Body() dto: CreateCandidateDto) {
    return this.recruitment.createCandidate(user.tenantId, dto);
  }

  @Patch('candidates/:id')
  @Roles(...RECRUITMENT_MANAGE_ROLES)
  @Scopes('recruitment:write')
  updateCandidate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCandidateDto,
  ) {
    return this.recruitment.updateCandidate(user.tenantId, id, dto);
  }

  @Post('candidates/:id/communications')
  @Roles(...RECRUITMENT_MANAGE_ROLES)
  @Scopes('recruitment:write')
  addCommunication(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CandidateCommunicationDto,
  ) {
    return this.recruitment.addCommunication(user.tenantId, id, dto, user.userId);
  }

  @Post('candidates/:id/convert')
  @Roles(...RECRUITMENT_MANAGE_ROLES)
  @Scopes('recruitment:write')
  convertCandidate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ConvertCandidateDto,
  ) {
    return this.recruitment.convertCandidate(user.tenantId, id, dto, user.userId);
  }

  @Get('interviews')
  @Scopes('recruitment:read')
  listInterviews(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.recruitment.listInterviews(user.tenantId, from, to);
  }

  @Post('interviews')
  @Roles(...RECRUITMENT_MANAGE_ROLES)
  @Scopes('recruitment:write')
  scheduleInterview(@CurrentUser() user: AuthUser, @Body() dto: ScheduleInterviewDto) {
    return this.recruitment.scheduleInterview(user.tenantId, dto);
  }

  @Patch('interviews/:id')
  @Roles(...RECRUITMENT_MANAGE_ROLES)
  @Scopes('recruitment:write')
  updateInterview(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateInterviewDto,
  ) {
    return this.recruitment.updateInterview(user.tenantId, id, dto);
  }

  @Post('interviews/:id/scorecard')
  @Roles(...RECRUITMENT_MANAGE_ROLES)
  @Scopes('recruitment:write')
  submitInterviewScorecard(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SubmitInterviewScorecardDto,
  ) {
    return this.recruitment.submitInterviewScorecard(user.tenantId, id, dto);
  }

  @Post('offers')
  @Roles(...RECRUITMENT_MANAGE_ROLES)
  @Scopes('recruitment:write')
  createOffer(@CurrentUser() user: AuthUser, @Body() dto: CreateOfferDto) {
    return this.recruitment.createOffer(user.tenantId, dto);
  }

  @Get('offers')
  @Scopes('recruitment:read')
  listOffers(@CurrentUser() user: AuthUser) {
    return this.recruitment.listOffers(user.tenantId);
  }

  @Patch('offers/:id')
  @Roles(...RECRUITMENT_MANAGE_ROLES)
  @Scopes('recruitment:write')
  updateOffer(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateOfferDto) {
    return this.recruitment.updateOffer(user.tenantId, id, dto);
  }

  @Patch('offers/:id/approval')
  @Roles(...RECRUITMENT_APPROVAL_ROLES)
  @Scopes('recruitment:approve')
  decideOfferApproval(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: DecideOfferApprovalDto,
  ) {
    return this.recruitment.decideOfferApproval(user.tenantId, id, dto, user.userId);
  }

  @Post('offers/:id/generate-letter')
  @Roles(...RECRUITMENT_MANAGE_ROLES)
  @Scopes('recruitment:write')
  generateOfferLetter(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.recruitment.generateOfferLetter(user.tenantId, id);
  }

  @Get('stats')
  @Scopes('recruitment:read')
  stats(@CurrentUser() user: AuthUser) {
    return this.recruitment.stats(user.tenantId);
  }
}
