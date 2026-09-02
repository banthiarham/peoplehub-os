import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { SearchService } from './search.service';
import { Roles } from '../../common/decorators/roles.decorator';

// No RBAC module/scope exists for tenant-wide search, and none of it is scoped to "your
// own data" the way OWN_DATA grants are elsewhere, so it is gated on role: every system
// role except Employee, matching the command palette's dashboard-only surface in
// apps/web/src/components/command-palette.tsx (Employee has no command palette / global
// search UI, and no legitimate need for tenant-wide employee/candidate/ticket search).
const SEARCH_ROLES = [
  'Super Admin', 'Tenant Owner', 'HR Admin', 'Payroll Admin', 'Finance Admin',
  'Recruiter', 'Manager', 'Auditor', 'Integration Admin', 'Developer', 'Read-only Leadership User',
];

@ApiTags('Search')
@ApiBearerAuth()
@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get('global')
  @Roles(...SEARCH_ROLES)
  @ApiOperation({ summary: 'Universal search across employees, candidates, tickets, jobs, assets' })
  global(@CurrentUser() user: AuthUser, @Query('q') q = '') {
    return this.search.global(user.tenantId, q);
  }
}
