import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthUser } from '../../common/types/auth-user';
import {
  CreateCandidateDto,
  CreateJobDto,
  CreateOfferDto,
  ListCandidatesDto,
  ScheduleInterviewDto,
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

  @Post('offers')
  @Roles(...HIRING_ROLES)
  createOffer(@CurrentUser() user: AuthUser, @Body() dto: CreateOfferDto) {
    return this.recruitment.createOffer(user.tenantId, dto);
  }

  @Patch('offers/:id')
  @Roles(...HIRING_ROLES)
  updateOffer(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateOfferDto) {
    return this.recruitment.updateOffer(user.tenantId, id, dto);
  }

  @Get('stats')
  stats(@CurrentUser() user: AuthUser) {
    return this.recruitment.stats(user.tenantId);
  }
}
