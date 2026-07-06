import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthUser } from '../../common/types/auth-user';
import {
  CreateExitRequestDto,
  CreateOnboardingTemplateDto,
  StartOnboardingDto,
  UpdateExitRequestDto,
  UpdateExitTaskDto,
  UpdateOnboardingTaskDto,
} from './dto/onboarding.dto';
import { OnboardingService } from './onboarding.service';

@ApiTags('Onboarding & Exits')
@ApiBearerAuth()
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get()
  @ApiOperation({ summary: 'Active onboardings with task progress' })
  listActive(@CurrentUser() user: AuthUser) {
    return this.onboarding.listActive(user.tenantId);
  }

  @Get('templates')
  listTemplates(@CurrentUser() user: AuthUser) {
    return this.onboarding.listTemplates(user.tenantId);
  }

  @Post('templates')
  @Roles('Super Admin', 'HR Admin')
  @ApiOperation({ summary: 'Create an onboarding template with scoped checklists' })
  createTemplate(@CurrentUser() user: AuthUser, @Body() dto: CreateOnboardingTemplateDto) {
    return this.onboarding.createTemplate(user.tenantId, dto);
  }

  @Post('start')
  @Roles('Super Admin', 'HR Admin')
  @ApiOperation({ summary: 'Instantiate template tasks for an employee' })
  start(@CurrentUser() user: AuthUser, @Body() dto: StartOnboardingDto) {
    return this.onboarding.start(user.tenantId, dto);
  }

  @Patch('tasks/:taskId')
  updateTask(
    @CurrentUser() user: AuthUser,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateOnboardingTaskDto,
  ) {
    return this.onboarding.updateTask(user.tenantId, taskId, dto);
  }

  @Get('preboarding/:employeeId')
  @ApiOperation({ summary: 'Preboarding portal data for document, form, policy, and checklist tasks' })
  preboarding(@CurrentUser() user: AuthUser, @Param('employeeId') employeeId: string) {
    return this.onboarding.preboardingPortal(user.tenantId, employeeId);
  }

  @Get('exits')
  listExits(@CurrentUser() user: AuthUser) {
    return this.onboarding.listExits(user.tenantId);
  }

  @Post('exits')
  @Roles('Super Admin', 'HR Admin', 'Manager')
  createExit(@CurrentUser() user: AuthUser, @Body() dto: CreateExitRequestDto) {
    return this.onboarding.createExit(user.tenantId, dto, user.userId);
  }

  @Patch('exits/:id')
  @Roles('Super Admin', 'HR Admin')
  updateExit(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateExitRequestDto,
  ) {
    return this.onboarding.updateExit(user.tenantId, id, dto, user.userId);
  }

  @Patch('exit-tasks/:taskId')
  @Roles('Super Admin', 'HR Admin', 'Manager')
  updateExitTask(
    @CurrentUser() user: AuthUser,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateExitTaskDto,
  ) {
    return this.onboarding.updateExitTask(user.tenantId, taskId, dto);
  }
}
