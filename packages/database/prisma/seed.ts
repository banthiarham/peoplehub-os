import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding PeopleHub OS demo data...');

  // Demo tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo-corp' },
    update: {},
    create: {
      name: 'Demo Corp India',
      legalName: 'Demo Corp India Pvt Ltd',
      slug: 'demo-corp',
      country: 'IN',
      industry: 'Technology',
      companySize: '51-200',
      billingPlan: 'enterprise',
      status: 'ACTIVE',
      timezone: 'Asia/Kolkata',
      currency: 'INR',
      brandColor: '#3b82f6',
    },
  });

  // Legal entities
  const entity1 = await prisma.legalEntity.create({
    data: {
      tenantId: tenant.id,
      name: 'Demo Corp India Pvt Ltd',
      legalName: 'Demo Corp India Pvt Ltd',
      pan: 'AAACB1234C',
      tan: 'DELA12345C',
      gstin: '07AAACB1234C1ZK',
      state: 'Delhi',
      country: 'IN',
    },
  });

  const entity2 = await prisma.legalEntity.create({
    data: {
      tenantId: tenant.id,
      name: 'Demo Corp Bangalore',
      legalName: 'Demo Corp Bangalore Operations Pvt Ltd',
      pan: 'AAACB5678D',
      state: 'Karnataka',
      country: 'IN',
    },
  });

  // Locations
  const locations = await Promise.all([
    prisma.location.create({
      data: { tenantId: tenant.id, name: 'Delhi HQ', city: 'New Delhi', state: 'Delhi', country: 'IN', timezone: 'Asia/Kolkata', geoLat: 28.6139, geoLng: 77.209, attendanceRadius: 200 },
    }),
    prisma.location.create({
      data: { tenantId: tenant.id, name: 'Bangalore Office', city: 'Bangalore', state: 'Karnataka', country: 'IN', timezone: 'Asia/Kolkata', geoLat: 12.9716, geoLng: 77.5946, attendanceRadius: 200 },
    }),
    prisma.location.create({
      data: { tenantId: tenant.id, name: 'Mumbai Office', city: 'Mumbai', state: 'Maharashtra', country: 'IN', timezone: 'Asia/Kolkata', geoLat: 19.076, geoLng: 72.8777, attendanceRadius: 200 },
    }),
    prisma.location.create({
      data: { tenantId: tenant.id, name: 'Remote', city: 'Remote', country: 'IN', timezone: 'Asia/Kolkata' },
    }),
  ]);

  await prisma.attendanceCaptureSetting.createMany({
    data: [
      { tenantId: tenant.id, mode: 'WEB', enabled: true, requiresGps: false, requiresGeofence: false, notes: 'Browser punch enabled for all employees.' },
      { tenantId: tenant.id, mode: 'MOBILE', enabled: true, requiresGps: false, requiresGeofence: false, notes: 'Mobile browser punch enabled.' },
      { tenantId: tenant.id, mode: 'GPS', enabled: true, requiresGps: true, requiresGeofence: true, notes: 'GPS punch requires a fresh fix and geofence where location has coordinates.' },
      { tenantId: tenant.id, mode: 'QR', enabled: true, requiresGps: false, requiresGeofence: false, notes: 'QR punch must match assigned location.' },
      { tenantId: tenant.id, mode: 'BIOMETRIC', enabled: true, requiresGps: false, requiresGeofence: false, notes: 'Biometric device import enabled for HR.' },
      { tenantId: tenant.id, mode: 'MANUAL', enabled: true, requiresGps: false, requiresGeofence: false, notes: 'Manual HR corrections enabled.' },
      { tenantId: tenant.id, mode: 'API_IMPORT', enabled: true, requiresGps: false, requiresGeofence: false, notes: 'External attendance API sync enabled.' },
      { tenantId: tenant.id, locationId: locations[3]!.id, mode: 'GPS', enabled: true, requiresGps: true, requiresGeofence: false, notes: 'Remote location accepts GPS without office radius.' },
      { tenantId: tenant.id, locationId: locations[3]!.id, mode: 'QR', enabled: false, requiresGps: false, requiresGeofence: false, notes: 'Remote employees do not use office QR.' },
    ],
    skipDuplicates: true,
  });

  // Departments
  const departments = await Promise.all([
    prisma.department.create({ data: { tenantId: tenant.id, name: 'Engineering', code: 'ENG' } }),
    prisma.department.create({ data: { tenantId: tenant.id, name: 'Product', code: 'PROD' } }),
    prisma.department.create({ data: { tenantId: tenant.id, name: 'Sales', code: 'SALES' } }),
    prisma.department.create({ data: { tenantId: tenant.id, name: 'Marketing', code: 'MKT' } }),
    prisma.department.create({ data: { tenantId: tenant.id, name: 'HR', code: 'HR' } }),
    prisma.department.create({ data: { tenantId: tenant.id, name: 'Finance', code: 'FIN' } }),
    prisma.department.create({ data: { tenantId: tenant.id, name: 'Operations', code: 'OPS' } }),
    prisma.department.create({ data: { tenantId: tenant.id, name: 'Design', code: 'DESIGN' } }),
  ]);

  // Designations
  const designations = await Promise.all([
    prisma.designation.create({ data: { tenantId: tenant.id, name: 'Software Engineer', grade: 'L3' } }),
    prisma.designation.create({ data: { tenantId: tenant.id, name: 'Senior Software Engineer', grade: 'L4' } }),
    prisma.designation.create({ data: { tenantId: tenant.id, name: 'Engineering Manager', grade: 'L5' } }),
    prisma.designation.create({ data: { tenantId: tenant.id, name: 'Product Manager', grade: 'L4' } }),
    prisma.designation.create({ data: { tenantId: tenant.id, name: 'HR Manager', grade: 'L4' } }),
    prisma.designation.create({ data: { tenantId: tenant.id, name: 'Payroll Admin', grade: 'L3' } }),
    prisma.designation.create({ data: { tenantId: tenant.id, name: 'Analyst', grade: 'L2' } }),
    prisma.designation.create({ data: { tenantId: tenant.id, name: 'Director', grade: 'L6' } }),
  ]);

  const costCenters = await Promise.all([
    prisma.costCenter.create({ data: { tenantId: tenant.id, name: 'Engineering Delivery', code: 'CC-ENG' } }),
    prisma.costCenter.create({ data: { tenantId: tenant.id, name: 'Go To Market', code: 'CC-GTM' } }),
    prisma.costCenter.create({ data: { tenantId: tenant.id, name: 'People Operations', code: 'CC-POPS' } }),
    prisma.costCenter.create({ data: { tenantId: tenant.id, name: 'Corporate Finance', code: 'CC-FIN' } }),
  ]);

  const businessUnits = await Promise.all([
    prisma.businessUnit.create({ data: { tenantId: tenant.id, name: 'PeopleHub Platform', code: 'BU-PHUB' } }),
    prisma.businessUnit.create({ data: { tenantId: tenant.id, name: 'Implementation Services', code: 'BU-IMPL' } }),
    prisma.businessUnit.create({ data: { tenantId: tenant.id, name: 'Internal Operations', code: 'BU-OPS' } }),
  ]);

  // Roles
  const defaultRoles = [
    'Super Admin',
    'Tenant Owner',
    'HR Admin',
    'Payroll Admin',
    'Finance Admin',
    'Recruiter',
    'Manager',
    'Employee',
    'Auditor',
    'Integration Admin',
    'Developer',
    'Read-only Leadership User',
  ];
  await Promise.all(
    defaultRoles.map((name) =>
      prisma.role.create({ data: { tenantId: tenant.id, name, isSystem: true } }),
    ),
  );

  // Salary structure
  const salaryStructure = await prisma.salaryStructure.create({
    data: {
      tenantId: tenant.id,
      name: 'Standard India Salary Structure',
      components: {
        create: [
          { name: 'Basic', code: 'BASIC', type: 'EARNING', calculationType: 'PERCENTAGE_OF_GROSS', value: 40, isTaxable: true, sequence: 1 },
          { name: 'HRA', code: 'HRA', type: 'EARNING', calculationType: 'PERCENTAGE_OF_BASIC', value: 50, isTaxable: false, sequence: 2 },
          { name: 'Special Allowance', code: 'SA', type: 'EARNING', calculationType: 'FIXED', value: 0, isTaxable: true, sequence: 3 },
          { name: 'Provident Fund (Employee)', code: 'PF_EMP', type: 'DEDUCTION', calculationType: 'PERCENTAGE_OF_BASIC', value: 12, isTaxable: false, isStatutory: true, statutoryType: 'PF', sequence: 10 },
          { name: 'Provident Fund (Employer)', code: 'PF_EMP_R', type: 'EMPLOYER_CONTRIBUTION', calculationType: 'PERCENTAGE_OF_BASIC', value: 12, isTaxable: false, isStatutory: true, statutoryType: 'PF', sequence: 11 },
          { name: 'ESI (Employee)', code: 'ESI_EMP', type: 'DEDUCTION', calculationType: 'PERCENTAGE_OF_GROSS', value: 0.75, isTaxable: false, isStatutory: true, statutoryType: 'ESI', sequence: 12 },
          { name: 'Professional Tax', code: 'PT', type: 'DEDUCTION', calculationType: 'FIXED', value: 200, isTaxable: false, isStatutory: true, statutoryType: 'PT', sequence: 13 },
          { name: 'TDS', code: 'TDS', type: 'DEDUCTION', calculationType: 'FIXED', value: 0, isTaxable: false, isStatutory: true, statutoryType: 'TDS', sequence: 14 },
        ],
      },
    },
  });

  // Leave types
  const leaveTypes = await Promise.all([
    prisma.leaveType.create({ data: { tenantId: tenant.id, name: 'Casual Leave', code: 'CL', isPaid: true, isCarryForward: false, maxDuration: 3 } }),
    prisma.leaveType.create({ data: { tenantId: tenant.id, name: 'Sick Leave', code: 'SL', isPaid: true, isCarryForward: false, requiresAttachment: true, maxDuration: 10 } }),
    prisma.leaveType.create({ data: { tenantId: tenant.id, name: 'Earned Leave', code: 'EL', isPaid: true, isCarryForward: true, maxCarryForwardDays: 30, isEncashable: true } }),
    prisma.leaveType.create({ data: { tenantId: tenant.id, name: 'Privilege Leave', code: 'PL', isPaid: true, isCarryForward: true, maxCarryForwardDays: 45, isEncashable: true } }),
    prisma.leaveType.create({ data: { tenantId: tenant.id, name: 'Maternity Leave', code: 'ML', isPaid: true, isCarryForward: false, genderRestriction: 'FEMALE', requiresAttachment: true } }),
    prisma.leaveType.create({ data: { tenantId: tenant.id, name: 'Paternity Leave', code: 'PAT', isPaid: true, isCarryForward: false, genderRestriction: 'MALE', maxDuration: 15 } }),
    prisma.leaveType.create({ data: { tenantId: tenant.id, name: 'Bereavement Leave', code: 'BL', isPaid: true, isCarryForward: false, maxDuration: 5 } }),
    prisma.leaveType.create({ data: { tenantId: tenant.id, name: 'Comp Off', code: 'CO', isPaid: true, isCarryForward: false, allowNegativeBalance: false } }),
    prisma.leaveType.create({ data: { tenantId: tenant.id, name: 'Optional Holiday', code: 'OH', isPaid: true, isCarryForward: false, maxDuration: 2 } }),
    prisma.leaveType.create({ data: { tenantId: tenant.id, name: 'Leave Without Pay', code: 'LWP', isPaid: false, isCarryForward: false, allowNegativeBalance: true } }),
    prisma.leaveType.create({ data: { tenantId: tenant.id, name: 'Study Leave', code: 'STUDY', isPaid: false, isCarryForward: false, requiresAttachment: true } }),
  ]);

  await Promise.all(leaveTypes.map((lt) => prisma.leavePolicy.create({
    data: {
      tenantId: tenant.id,
      leaveTypeId: lt.id,
      name: `${lt.name} Default Policy`,
      accrualType: lt.code === 'EL' || lt.code === 'PL' ? 'MONTHLY' : 'UPFRONT',
      accrualDays: lt.code === 'EL' ? 1.25 : lt.code === 'PL' ? 1.5 : 0,
      maxAnnualDays: ({ CL: 12, SL: 12, EL: 15, PL: 18, ML: 182, PAT: 15, BL: 5, CO: 12, OH: 2, LWP: 365, STUDY: 30 } as Record<string, number>)[lt.code] ?? 12,
      maxCarryForwardDays: lt.maxCarryForwardDays,
      encashmentAllowed: lt.isEncashable,
      encashmentMaxDays: lt.isEncashable ? 15 : null,
      expiryDays: lt.code === 'CO' ? 90 : null,
      minDuration: lt.minDuration,
      maxDuration: lt.maxDuration,
      requiresAttachment: lt.requiresAttachment,
      allowNegativeBalance: lt.allowNegativeBalance,
      genderRestriction: lt.genderRestriction,
      employmentTypes: lt.code === 'ML' || lt.code === 'PAT' ? ['FULL_TIME'] : [],
      probationAllowed: ['SL', 'LWP', 'BL'].includes(lt.code),
      noticePeriodAllowed: ['SL', 'LWP', 'BL'].includes(lt.code),
      sandwichRule: lt.code === 'EL' || lt.code === 'PL',
    },
  })));

  // Holiday calendar
  const seedYear = new Date().getFullYear();
  const holidayCalendar = await prisma.holidayCalendar.create({
    data: {
      tenantId: tenant.id,
      name: `India ${seedYear} Holidays`,
      year: seedYear,
      isDefault: true,
      holidays: {
        create: [
          { name: 'Republic Day', date: new Date(`${seedYear}-01-26`) },
          { name: 'Holi', date: new Date(`${seedYear}-03-14`) },
          { name: 'Good Friday', date: new Date(`${seedYear}-04-03`) },
          { name: 'Independence Day', date: new Date(`${seedYear}-08-15`) },
          { name: 'Gandhi Jayanti', date: new Date(`${seedYear}-10-02`) },
          { name: 'Diwali', date: new Date(`${seedYear}-11-08`) },
          { name: 'Christmas', date: new Date(`${seedYear}-12-25`) },
          { name: 'Founders Day', date: new Date(`${seedYear}-07-20`), isOptional: true },
        ],
      },
    },
  });

  // Shifts and attendance rules
  const shifts = await Promise.all([
    prisma.shift.create({ data: { tenantId: tenant.id, name: 'Standard Shift', type: 'FIXED', startTime: '09:00', endTime: '18:00', gracePeriodMins: 15, weeklyOffDays: [0, 6], minWorkingMinutes: 480, overtimeAfterMinutes: 540 } }),
    prisma.shift.create({ data: { tenantId: tenant.id, name: 'Flexible Shift', type: 'FLEXIBLE', startTime: '10:00', endTime: '19:00', gracePeriodMins: 30, weeklyOffDays: [0, 6], remoteAllowed: true, minWorkingMinutes: 450, overtimeAfterMinutes: 540 } }),
    prisma.shift.create({ data: { tenantId: tenant.id, name: 'Night Operations', type: 'NIGHT', startTime: '21:00', endTime: '06:00', gracePeriodMins: 20, weeklyOffDays: [0, 6], shiftAllowanceAmount: 750, minWorkingMinutes: 420, overtimeAfterMinutes: 510 } }),
    prisma.shift.create({ data: { tenantId: tenant.id, name: 'Split Support', type: 'SPLIT', startTime: '08:00', endTime: '20:00', breakDurationMins: 180, weeklyOffDays: [0, 6], shiftAllowanceAmount: 300 } }),
    prisma.shift.create({ data: { tenantId: tenant.id, name: 'Rotational Weekend', type: 'ROTATIONAL', startTime: '09:00', endTime: '18:00', weeklyOffDays: [1, 2], weekendWorkAllowed: true, holidayWorkAllowed: true, compOffEligible: true, shiftAllowanceAmount: 500 } }),
  ]);
  await prisma.attendanceRule.createMany({
    data: [
      { tenantId: tenant.id, name: 'Default India Attendance Rule', isDefault: true, gracePeriodMins: 15, lateMarkAfterMins: 15, earlyLeavingGraceMins: 15, minWorkingMinutes: 480, halfDayAfterMinutes: 240, overtimeAfterMinutes: 540, weekendWorkAllowed: false, holidayWorkAllowed: false },
      { tenantId: tenant.id, name: 'Remote/Flexible Rule', shiftId: shifts[1]!.id, gracePeriodMins: 30, lateMarkAfterMins: 30, minWorkingMinutes: 450, halfDayAfterMinutes: 225, overtimeAfterMinutes: 540, remoteAttendanceAllowed: true },
      { tenantId: tenant.id, name: 'Operations Weekend Rule', shiftId: shifts[4]!.id, gracePeriodMins: 10, lateMarkAfterMins: 10, minWorkingMinutes: 480, halfDayAfterMinutes: 240, overtimeAfterMinutes: 480, weekendWorkAllowed: true, holidayWorkAllowed: true, compOffEligible: true },
    ],
  });

  // Seed users (super admin + HR admins)
  const adminUser = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: 'admin@democorp.com',
      name: 'Super Admin',
      isSuperAdmin: true,
      isActive: true,
    },
  });

  const hrUser = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: 'hr@democorp.com',
      name: 'Priya Sharma',
      isActive: true,
    },
  });

  const payrollUser = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: 'payroll@democorp.com',
      name: 'Ravi Kumar',
      isActive: true,
    },
  });

  const employeeUser = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: 'employee@democorp.com',
      name: 'Kavya Menon',
      isActive: true,
    },
  });

  // Job requisitions
  await Promise.all([
    prisma.jobRequisition.create({
      data: {
        tenantId: tenant.id,
        title: 'Senior Full Stack Engineer',
        departmentId: departments[0]!.id,
        locationId: locations[1]!.id,
        openings: 2,
        type: 'FULL_TIME',
        status: 'OPEN',
        approvalStatus: 'APPROVED',
        approvedById: adminUser.id,
        approvedAt: new Date(),
        publishedAt: new Date(),
        targetStartDate: new Date(Date.now() + 45 * 24 * 3600 * 1000),
        priority: 'HIGH',
        jobDescription: 'Build and scale our HRMS platform.',
        requirements: 'React, Node.js, PostgreSQL, clean architecture, and product ownership.',
        salaryRange: { min: 1500000, max: 2500000, currency: 'INR' },
      },
    }),
    prisma.jobRequisition.create({
      data: {
        tenantId: tenant.id,
        title: 'Product Manager',
        departmentId: departments[1]!.id,
        locationId: locations[0]!.id,
        openings: 1,
        type: 'FULL_TIME',
        status: 'OPEN',
        approvalStatus: 'APPROVED',
        approvedById: adminUser.id,
        approvedAt: new Date(),
        publishedAt: new Date(),
        targetStartDate: new Date(Date.now() + 60 * 24 * 3600 * 1000),
        priority: 'MEDIUM',
        jobDescription: 'Own the product roadmap for HR modules.',
        requirements: 'B2B SaaS product management, HR/payroll domain depth, and strong analytics.',
      },
    }),
    prisma.jobRequisition.create({
      data: {
        tenantId: tenant.id,
        title: 'UI/UX Designer',
        departmentId: departments[7]!.id,
        locationId: locations[3]!.id,
        openings: 1,
        type: 'FULL_TIME',
        status: 'OPEN',
        approvalStatus: 'APPROVED',
        approvedById: adminUser.id,
        approvedAt: new Date(),
        publishedAt: new Date(),
        targetStartDate: new Date(Date.now() + 50 * 24 * 3600 * 1000),
        priority: 'MEDIUM',
        jobDescription: 'Design beautiful employee experiences.',
        requirements: 'Product design portfolio, workflow thinking, and responsive web design.',
      },
    }),
  ]);

  // API keys
  await Promise.all([
    prisma.apiKey.create({
      data: {
        tenantId: tenant.id,
        name: 'Demo Integration Key',
        keyHash: crypto.createHash('sha256').update('phub_demo_key_1').digest('hex'),
        keyPrefix: 'phub_demo',
        scopes: ['employees:read', 'attendance:read', 'payroll:read'],
        isActive: true,
      },
    }),
    prisma.apiKey.create({
      data: {
        tenantId: tenant.id,
        name: 'Internal Automation Key',
        keyHash: crypto.createHash('sha256').update('phub_internal_key_2').digest('hex'),
        keyPrefix: 'phub_int',
        scopes: ['employees:read', 'employees:write', 'leave:read', 'leave:write'],
        isActive: true,
      },
    }),
  ]);

  // Webhook subscriptions
  await Promise.all([
    prisma.webhookSubscription.create({
      data: {
        tenantId: tenant.id,
        url: 'https://httpbin.org/post',
        events: ['employee.created', 'employee.exited', 'payroll.payslips_published'],
        isActive: true,
      },
    }),
    prisma.webhookSubscription.create({
      data: {
        tenantId: tenant.id,
        url: 'https://httpbin.org/post',
        events: ['leave.approved', 'leave.rejected', 'attendance.finalized'],
        isActive: true,
      },
    }),
    prisma.webhookSubscription.create({
      data: {
        tenantId: tenant.id,
        url: 'https://httpbin.org/post',
        events: ['candidate.created', 'offer.accepted', 'candidate.converted_to_employee'],
        isActive: true,
      },
    }),
  ]);

  // Payroll run (current month)
  const now = new Date();
  const payrollRun = await prisma.payrollRun.create({
    data: {
      tenantId: tenant.id,
      month: now.getMonth() + 1,
      year: now.getFullYear(),
      status: 'DRAFT',
    },
  });

  // Review cycle
  await prisma.reviewCycle.create({
    data: {
      tenantId: tenant.id,
      name: 'H1 2025 Performance Review',
      type: 'HALF_YEARLY',
      status: 'ACTIVE',
      startDate: new Date('2025-07-01'),
      endDate: new Date('2025-07-31'),
      selfReview: true,
      managerReview: true,
      peerReview: true,
      questions: [
        { id: 'impact', label: 'What measurable impact did this employee create?', type: 'TEXT', required: true },
        { id: 'execution', label: 'Execution quality', type: 'RATING', competency: 'Delivery', weight: 1, required: true },
        { id: 'collaboration', label: 'Collaboration and communication', type: 'RATING', competency: 'Collaboration', weight: 1, required: true },
        { id: 'growth', label: 'What should this employee focus on next cycle?', type: 'TEXT', required: false },
      ],
    },
  });

  // Survey
  await prisma.survey.create({
    data: {
      tenantId: tenant.id,
      title: 'Q3 2025 Pulse Survey',
      type: 'PULSE',
      status: 'ACTIVE',
      isAnonymous: true,
      questions: [
        { id: '1', text: 'How satisfied are you with your work-life balance?', type: 'SCALE' },
        { id: '2', text: 'Do you feel valued by your manager?', type: 'SCALE' },
        { id: '3', text: 'How likely are you to recommend working here to a friend?', type: 'SCALE' },
        { id: '4', text: 'Any feedback or suggestions?', type: 'TEXT' },
      ],
      startDate: new Date('2025-07-01'),
      endDate: new Date('2025-07-31'),
    },
  });

  await prisma.survey.create({
    data: {
      tenantId: tenant.id,
      title: 'Friday Townhall Preference',
      type: 'POLL',
      status: 'ACTIVE',
      isAnonymous: false,
      questions: [
        {
          id: 'format',
          text: 'Which townhall format should we use this month?',
          type: 'CHOICE',
          options: ['Product demos', 'Ask-me-anything', 'Customer stories'],
        },
      ],
      startDate: new Date('2025-07-01'),
      endDate: new Date('2025-07-31'),
    },
  });


  // ── AY 2026-27 Tax Engine Seed ─────────────────────────────────────────────
  console.log('🧮 Seeding AY 2026-27 tax rules...');

  const taxYear = await prisma.taxYear.upsert({
    where: { tenantId_financialYear_country: { tenantId: tenant.id, financialYear: '2025-26', country: 'IN' } },
    update: {},
    create: {
      tenantId: tenant.id,
      financialYear: '2025-26',
      assessmentYear: '2026-27',
      country: 'IN',
      effectiveFrom: new Date('2025-04-01'),
      effectiveTo: new Date('2026-03-31'),
      isActive: true,
      isDefault: true,
    },
  });

  await prisma.taxRegimeConfig.upsert({
    where: { tenantId_taxYearId_regime: { tenantId: tenant.id, taxYearId: taxYear.id, regime: 'NEW' } },
    update: {},
    create: { tenantId: tenant.id, taxYearId: taxYear.id, regime: 'NEW', name: 'New Tax Regime (115BAC)', isDefault: true, employeeCanSelect: true },
  });
  await prisma.taxRegimeConfig.upsert({
    where: { tenantId_taxYearId_regime: { tenantId: tenant.id, taxYearId: taxYear.id, regime: 'OLD' } },
    update: {},
    create: { tenantId: tenant.id, taxYearId: taxYear.id, regime: 'OLD', name: 'Old Tax Regime', isDefault: false, employeeCanSelect: true },
  });

  const oldSlabsBelow60 = [
    { minIncome: 0, maxIncome: 250000, taxRate: 0, fixedTax: 0, sortOrder: 1 },
    { minIncome: 250000, maxIncome: 500000, taxRate: 0.05, fixedTax: 0, sortOrder: 2 },
    { minIncome: 500000, maxIncome: 1000000, taxRate: 0.2, fixedTax: 12500, sortOrder: 3 },
    { minIncome: 1000000, maxIncome: null, taxRate: 0.3, fixedTax: 112500, sortOrder: 4 },
  ];
  const oldSlabsSenior = [
    { minIncome: 0, maxIncome: 300000, taxRate: 0, fixedTax: 0, sortOrder: 1 },
    { minIncome: 300000, maxIncome: 500000, taxRate: 0.05, fixedTax: 0, sortOrder: 2 },
    { minIncome: 500000, maxIncome: 1000000, taxRate: 0.2, fixedTax: 10000, sortOrder: 3 },
    { minIncome: 1000000, maxIncome: null, taxRate: 0.3, fixedTax: 110000, sortOrder: 4 },
  ];
  const oldSlabsSuperSenior = [
    { minIncome: 0, maxIncome: 500000, taxRate: 0, fixedTax: 0, sortOrder: 1 },
    { minIncome: 500000, maxIncome: 1000000, taxRate: 0.2, fixedTax: 0, sortOrder: 2 },
    { minIncome: 1000000, maxIncome: null, taxRate: 0.3, fixedTax: 100000, sortOrder: 3 },
  ];
  const newSlabs = [
    { minIncome: 0, maxIncome: 400000, taxRate: 0, fixedTax: 0, sortOrder: 1 },
    { minIncome: 400000, maxIncome: 800000, taxRate: 0.05, fixedTax: 0, sortOrder: 2 },
    { minIncome: 800000, maxIncome: 1200000, taxRate: 0.1, fixedTax: 20000, sortOrder: 3 },
    { minIncome: 1200000, maxIncome: 1600000, taxRate: 0.15, fixedTax: 60000, sortOrder: 4 },
    { minIncome: 1600000, maxIncome: 2000000, taxRate: 0.2, fixedTax: 120000, sortOrder: 5 },
    { minIncome: 2000000, maxIncome: 2400000, taxRate: 0.25, fixedTax: 200000, sortOrder: 6 },
    { minIncome: 2400000, maxIncome: null, taxRate: 0.3, fixedTax: 300000, sortOrder: 7 },
  ];

  const slabsToCreate = [
    ...oldSlabsBelow60.map((s) => ({ ...s, regime: 'OLD' as const, ageCategory: 'BELOW_60' as const })),
    ...oldSlabsSenior.map((s) => ({ ...s, regime: 'OLD' as const, ageCategory: 'SENIOR_60_80' as const })),
    ...oldSlabsSuperSenior.map((s) => ({ ...s, regime: 'OLD' as const, ageCategory: 'SUPER_SENIOR_80_PLUS' as const })),
    ...newSlabs.map((s) => ({ ...s, regime: 'NEW' as const, ageCategory: 'BELOW_60' as const })),
    ...newSlabs.map((s) => ({ ...s, regime: 'NEW' as const, ageCategory: 'SENIOR_60_80' as const })),
    ...newSlabs.map((s) => ({ ...s, regime: 'NEW' as const, ageCategory: 'SUPER_SENIOR_80_PLUS' as const })),
  ];

  await prisma.taxSlab.deleteMany({ where: { tenantId: tenant.id, taxYearId: taxYear.id } });
  await prisma.taxSlab.createMany({
    data: slabsToCreate.map((s) => ({ tenantId: tenant.id, taxYearId: taxYear.id, status: 'PUBLISHED', version: 1, ...s })),
  });

  await prisma.taxRebateRule.upsert({
    where: { tenantId_taxYearId_regime_section: { tenantId: tenant.id, taxYearId: taxYear.id, regime: 'NEW', section: '87A' } },
    update: {},
    create: { tenantId: tenant.id, taxYearId: taxYear.id, regime: 'NEW', section: '87A', maxRebate: 60000, incomeLimit: 1200000, status: 'PUBLISHED' },
  });
  await prisma.taxRebateRule.upsert({
    where: { tenantId_taxYearId_regime_section: { tenantId: tenant.id, taxYearId: taxYear.id, regime: 'OLD', section: '87A' } },
    update: {},
    create: { tenantId: tenant.id, taxYearId: taxYear.id, regime: 'OLD', section: '87A', maxRebate: 12500, incomeLimit: 500000, status: 'PUBLISHED' },
  });

  await prisma.taxCessRule.deleteMany({ where: { tenantId: tenant.id, taxYearId: taxYear.id } });
  await prisma.taxCessRule.create({
    data: { tenantId: tenant.id, taxYearId: taxYear.id, country: 'IN', cessName: 'Health and Education Cess', cessRate: 0.04, applicableOnTax: true, applicableOnSurcharge: true, status: 'PUBLISHED' },
  });

  await prisma.taxSurchargeRule.deleteMany({ where: { tenantId: tenant.id, taxYearId: taxYear.id } });
  await prisma.taxSurchargeRule.createMany({
    data: [
      { tenantId: tenant.id, taxYearId: taxYear.id, regime: 'NEW', minIncome: 0, maxIncome: 5000000, surchargeRate: 0, marginalReliefEnabled: true, status: 'PUBLISHED' },
      { tenantId: tenant.id, taxYearId: taxYear.id, regime: 'NEW', minIncome: 5000000, maxIncome: 10000000, surchargeRate: 0.1, marginalReliefEnabled: true, status: 'PUBLISHED' },
      { tenantId: tenant.id, taxYearId: taxYear.id, regime: 'NEW', minIncome: 10000000, maxIncome: 20000000, surchargeRate: 0.15, marginalReliefEnabled: true, status: 'PUBLISHED' },
      { tenantId: tenant.id, taxYearId: taxYear.id, regime: 'NEW', minIncome: 20000000, maxIncome: 50000000, surchargeRate: 0.25, marginalReliefEnabled: true, status: 'PUBLISHED' },
      { tenantId: tenant.id, taxYearId: taxYear.id, regime: 'NEW', minIncome: 50000000, maxIncome: null, surchargeRate: 0.25, marginalReliefEnabled: true, status: 'PUBLISHED' },
      { tenantId: tenant.id, taxYearId: taxYear.id, regime: 'OLD', minIncome: 0, maxIncome: 5000000, surchargeRate: 0, marginalReliefEnabled: true, status: 'PUBLISHED' },
      { tenantId: tenant.id, taxYearId: taxYear.id, regime: 'OLD', minIncome: 5000000, maxIncome: 10000000, surchargeRate: 0.1, marginalReliefEnabled: true, status: 'PUBLISHED' },
      { tenantId: tenant.id, taxYearId: taxYear.id, regime: 'OLD', minIncome: 10000000, maxIncome: 20000000, surchargeRate: 0.15, marginalReliefEnabled: true, status: 'PUBLISHED' },
      { tenantId: tenant.id, taxYearId: taxYear.id, regime: 'OLD', minIncome: 20000000, maxIncome: 50000000, surchargeRate: 0.25, marginalReliefEnabled: true, status: 'PUBLISHED' },
      { tenantId: tenant.id, taxYearId: taxYear.id, regime: 'OLD', minIncome: 50000000, maxIncome: null, surchargeRate: 0.37, marginalReliefEnabled: true, status: 'PUBLISHED' },
    ],
  });

  await prisma.taxDeductionRule.deleteMany({ where: { tenantId: tenant.id, taxYearId: taxYear.id } });
  await prisma.taxDeductionRule.createMany({
    data: [
      { tenantId: tenant.id, taxYearId: taxYear.id, regime: 'OLD', section: 'STANDARD_DEDUCTION', name: 'Standard Deduction', maxLimit: 50000, requiresProof: false, isEnabled: true, sortOrder: 1, status: 'PUBLISHED' },
      { tenantId: tenant.id, taxYearId: taxYear.id, regime: 'OLD', section: '80C', name: 'Section 80C (PF, PPF, ELSS, LIC)', maxLimit: 150000, requiresProof: true, isEnabled: true, sortOrder: 2, status: 'PUBLISHED' },
      { tenantId: tenant.id, taxYearId: taxYear.id, regime: 'OLD', section: '80D', name: 'Section 80D (Health Insurance)', maxLimit: 25000, requiresProof: true, isEnabled: true, sortOrder: 3, status: 'PUBLISHED' },
      { tenantId: tenant.id, taxYearId: taxYear.id, regime: 'OLD', section: '80CCD_1B', name: 'Section 80CCD(1B) NPS Employee', maxLimit: 50000, requiresProof: true, isEnabled: true, sortOrder: 4, status: 'PUBLISHED' },
      { tenantId: tenant.id, taxYearId: taxYear.id, regime: 'OLD', section: '80CCD_2', name: 'Section 80CCD(2) NPS Employer', maxLimit: null, requiresProof: false, isEnabled: true, sortOrder: 5, status: 'PUBLISHED' },
      { tenantId: tenant.id, taxYearId: taxYear.id, regime: 'OLD', section: 'HOME_LOAN_INTEREST', name: 'Home Loan Interest (Section 24b)', maxLimit: 200000, requiresProof: true, isEnabled: true, sortOrder: 6, status: 'PUBLISHED' },
      { tenantId: tenant.id, taxYearId: taxYear.id, regime: 'OLD', section: 'PROFESSIONAL_TAX', name: 'Professional Tax', maxLimit: 2500, requiresProof: false, isEnabled: true, sortOrder: 7, status: 'PUBLISHED' },
      { tenantId: tenant.id, taxYearId: taxYear.id, regime: 'NEW', section: 'STANDARD_DEDUCTION', name: 'Standard Deduction', maxLimit: 75000, requiresProof: false, isEnabled: true, sortOrder: 1, status: 'PUBLISHED' },
      { tenantId: tenant.id, taxYearId: taxYear.id, regime: 'NEW', section: '80CCD_2', name: 'Section 80CCD(2) NPS Employer', maxLimit: null, requiresProof: false, isEnabled: true, sortOrder: 2, status: 'PUBLISHED' },
    ],
  });

  await prisma.taxExemptionRule.deleteMany({ where: { tenantId: tenant.id, taxYearId: taxYear.id } });
  await prisma.taxExemptionRule.createMany({
    data: [
      { tenantId: tenant.id, taxYearId: taxYear.id, regime: 'OLD', name: 'HRA', description: 'House Rent Allowance', maxLimit: null, requiresProof: true, isEnabled: true, status: 'PUBLISHED' },
      { tenantId: tenant.id, taxYearId: taxYear.id, regime: 'OLD', name: 'LTA', description: 'Leave Travel Allowance', maxLimit: null, requiresProof: true, isEnabled: true, status: 'PUBLISHED' },
    ],
  });


  // ── Default Email Templates (Module 22) ─────────────────────────────────────
  console.log('📧 Seeding default email templates...');

  const emailTemplates = [
    { templateKey: 'account_invitation', name: 'Account Invitation', module: 'auth', isMandatory: true, subject: 'Welcome to {{company_name}} — Set up your account', bodyHtml: '<p>Hi {{employee_name}},</p><p>You have been invited to join {{company_name}} on PeopleHub OS.</p><p><a href="{{login_link}}">Set up your account</a></p><p>This link expires in 48 hours.</p>' },
    { templateKey: 'password_reset', name: 'Password Reset', module: 'auth', isMandatory: true, subject: 'Reset your password — {{company_name}}', bodyHtml: '<p>Hi {{employee_name}},</p><p>We received a request to reset your password.</p><p><a href="{{login_link}}">Reset Password</a></p><p>This link expires in 1 hour. If you did not request this, ignore this email.</p>' },
    { templateKey: 'welcome', name: 'Welcome Email', module: 'auth', isMandatory: true, subject: 'Welcome to {{company_name}}!', bodyHtml: '<p>Hi {{employee_name}},</p><p>Welcome aboard! Your account is now active. <a href="{{login_link}}">Login here</a>.</p>' },
    { templateKey: 'offer_letter', name: 'Offer Letter', module: 'recruitment', isMandatory: true, subject: 'Your Offer Letter from {{company_name}}', bodyHtml: '<p>Dear {{candidate_name}},</p><p>We are pleased to offer you the position at {{company_name}}.</p><p><a href="{{offer_link}}">View and Accept Offer</a></p>' },
    { templateKey: 'interview_invite', name: 'Interview Invite', module: 'recruitment', isMandatory: true, subject: 'Interview Scheduled — {{company_name}}', bodyHtml: '<p>Dear {{candidate_name}},</p><p>Your interview has been scheduled for {{interview_date}}.</p><p>Please confirm your attendance.</p>' },
    { templateKey: 'leave_request', name: 'Leave Request Notification', module: 'leave', isMandatory: false, subject: '{{employee_name}} has applied for {{leave_type}}', bodyHtml: '<p>{{employee_name}} has submitted a leave request for {{leave_type}} from {{leave_start_date}} to {{leave_end_date}}.</p><p><a href="{{approval_link}}">Review Request</a></p>' },
    { templateKey: 'leave_approved', name: 'Leave Approved', module: 'leave', isMandatory: false, subject: 'Your {{leave_type}} leave has been approved', bodyHtml: '<p>Hi {{employee_name}},</p><p>Your {{leave_type}} leave from {{leave_start_date}} to {{leave_end_date}} has been approved.</p>' },
    { templateKey: 'leave_rejected', name: 'Leave Rejected', module: 'leave', isMandatory: false, subject: 'Your {{leave_type}} leave request was not approved', bodyHtml: '<p>Hi {{employee_name}},</p><p>Your {{leave_type}} leave from {{leave_start_date}} to {{leave_end_date}} could not be approved. Please contact your manager for details.</p>' },
    { templateKey: 'attendance_regularization', name: 'Attendance Regularization', module: 'attendance', isMandatory: false, subject: 'Attendance regularization request from {{employee_name}}', bodyHtml: '<p>{{employee_name}} has submitted an attendance regularization request.</p><p><a href="{{approval_link}}">Review Request</a></p>' },
    { templateKey: 'expense_approval', name: 'Expense Claim Status', module: 'expenses', isMandatory: false, subject: 'Your expense claim has been {{status}}', bodyHtml: '<p>Hi {{employee_name}},</p><p>Your expense claim has been {{status}} by {{manager_name}}.</p>' },
    { templateKey: 'payroll_published', name: 'Payroll Published', module: 'payroll', isMandatory: true, subject: '{{company_name}} payroll for {{payroll_month}} has been processed', bodyHtml: '<p>Hi {{employee_name}},</p><p>Your payslip for {{payroll_month}} is now available.</p><p><a href="{{payslip_link}}">View Payslip</a></p>' },
    { templateKey: 'payslip_available', name: 'Payslip Available', module: 'payroll', isMandatory: true, subject: 'Your payslip for {{payroll_month}} is ready', bodyHtml: '<p>Hi {{employee_name}},</p><p>Your payslip for {{payroll_month}} is available. <a href="{{payslip_link}}">Download Payslip</a></p>' },
    { templateKey: 'tax_declaration_reminder', name: 'Tax Declaration Reminder', module: 'tax', isMandatory: true, subject: 'Action Required: Submit your tax declarations — {{company_name}}', bodyHtml: '<p>Hi {{employee_name}},</p><p>The tax declaration window is now open. Please submit your investment declarations and upload proofs before the deadline.</p><p><a href="{{login_link}}">Submit Declarations</a></p>' },
    { templateKey: 'hr_ticket_update', name: 'HR Ticket Update', module: 'helpdesk', isMandatory: false, subject: 'Update on your HR ticket #{{ticket_id}}', bodyHtml: '<p>Hi {{employee_name}},</p><p>There is an update on your HR ticket #{{ticket_id}}. <a href="{{login_link}}">View ticket</a></p>' },
    { templateKey: 'review_reminder', name: 'Performance Review Reminder', module: 'performance', isMandatory: false, subject: 'Action Required: Complete your performance review — {{review_cycle_name}}', bodyHtml: '<p>Hi {{employee_name}},</p><p>Please complete your performance review for {{review_cycle_name}} before the deadline.</p><p><a href="{{login_link}}">Start Review</a></p>' },
    { templateKey: 'survey_invite', name: 'Survey Invite', module: 'engagement', isMandatory: false, subject: '{{company_name}} — You are invited to participate in a survey', bodyHtml: '<p>Hi {{employee_name}},</p><p>{{company_name}} has launched a new survey. Your feedback is valuable.</p><p><a href="{{login_link}}">Take Survey</a></p>' },
    { templateKey: 'policy_acknowledgement', name: 'Policy Acknowledgement', module: 'compliance', isMandatory: true, subject: 'Action Required: Acknowledge {{policy_name}}', bodyHtml: '<p>Hi {{employee_name}},</p><p>Please review and acknowledge the policy: {{policy_name}}.</p><p><a href="{{login_link}}">Acknowledge Policy</a></p>' },
    { templateKey: 'exit_process', name: 'Exit Process Update', module: 'offboarding', isMandatory: true, subject: 'Exit process update — {{company_name}}', bodyHtml: '<p>Hi {{employee_name}},</p><p>Your exit process has been initiated. Please complete the required tasks through the self-service portal.</p><p><a href="{{login_link}}">View Exit Tasks</a></p>' },
    { templateKey: 'workflow_approval', name: 'Workflow Approval Request', module: 'workflows', isMandatory: false, subject: 'Approval required: {{workflow_name}}', bodyHtml: '<p>Hi {{manager_name}},</p><p>An approval request is pending your action.</p><p><a href="{{approval_link}}">Review and Approve</a></p>' },
    { templateKey: 'integration_failure', name: 'Integration Failure Alert', module: 'developer', isMandatory: true, subject: 'Alert: Integration failure detected — {{company_name}}', bodyHtml: '<p>An integration failure has been detected for your {{company_name}} account. Please check the integration settings and take necessary action.</p><p><a href="{{login_link}}">View Details</a></p>' },
  ];

  for (const tpl of emailTemplates) {
    const existingTpl = await prisma.emailTemplate.findFirst({
      where: { tenantId: null, templateKey: tpl.templateKey, language: 'en' },
    });
    if (existingTpl) continue;
    await prisma.emailTemplate.create({
      data: {
        tenantId: null,
        templateKey: tpl.templateKey,
        name: tpl.name,
        subject: tpl.subject,
        bodyHtml: tpl.bodyHtml,
        bodyText: null,
        variables: [],
        language: 'en',
        module: tpl.module,
        isMandatory: tpl.isMandatory,
        status: 'ACTIVE',
        version: 1,
      } as any,
    });
  }

  console.log('📄 Seeding document and notification templates...');

  const documentTemplates = [
    {
      templateKey: 'offer_letter',
      name: 'Offer Letter',
      module: 'recruitment',
      documentType: 'OFFER_LETTER',
      title: 'Offer Letter - {{employee.firstName}} {{employee.lastName}}',
      subject: 'Your Offer Letter from {{company_name}}',
      bodyHtml:
        '<p>Dear {{employee.firstName}} {{employee.lastName}},</p><p>We are pleased to offer you the role of {{employee.designation.name}} at {{company_name}}.</p><p>Joining date: {{employee.joiningDate}}</p><p>Location: {{employee.location.name}}</p>',
      bodyText: 'Offer Letter for {{employee.firstName}} {{employee.lastName}}',
      isMandatory: true,
      eSignatureRequired: true,
      status: 'ACTIVE',
    },
    {
      templateKey: 'appointment_letter',
      name: 'Appointment Letter',
      module: 'hr',
      documentType: 'APPOINTMENT_LETTER',
      title: 'Appointment Letter - {{employee.firstName}} {{employee.lastName}}',
      subject: 'Appointment Letter for {{employee.firstName}} {{employee.lastName}}',
      bodyHtml:
        '<p>Dear {{employee.firstName}} {{employee.lastName}},</p><p>This letter confirms your appointment at {{company_name}}.</p><p>Department: {{employee.department.name}}</p>',
      bodyText: 'Appointment Letter',
      isMandatory: true,
      eSignatureRequired: true,
      status: 'ACTIVE',
    },
    {
      templateKey: 'salary_revision_letter',
      name: 'Salary Revision Letter',
      module: 'payroll',
      documentType: 'SALARY_REVISION_LETTER',
      title: 'Salary Revision - {{employee.firstName}} {{employee.lastName}}',
      subject: 'Salary revision for {{employee.firstName}} {{employee.lastName}}',
      bodyHtml: '<p>Your salary has been revised effective {{vars.effectiveDate}}.</p><p>New CTC: {{vars.newCtc}}</p>',
      bodyText: 'Salary revision letter',
      isMandatory: false,
      eSignatureRequired: true,
      status: 'ACTIVE',
    },
    {
      templateKey: 'experience_letter',
      name: 'Experience Letter',
      module: 'hr',
      documentType: 'EXPERIENCE_LETTER',
      title: 'Experience Letter - {{employee.firstName}} {{employee.lastName}}',
      subject: 'Experience letter for {{employee.firstName}} {{employee.lastName}}',
      bodyHtml: '<p>We confirm that {{employee.firstName}} {{employee.lastName}} was employed with {{company_name}}.</p>',
      bodyText: 'Experience letter',
      isMandatory: false,
      eSignatureRequired: false,
      status: 'ACTIVE',
    },
    {
      templateKey: 'relieving_letter',
      name: 'Relieving Letter',
      module: 'hr',
      documentType: 'RELIEVING_LETTER',
      title: 'Relieving Letter - {{employee.firstName}} {{employee.lastName}}',
      subject: 'Relieving letter for {{employee.firstName}} {{employee.lastName}}',
      bodyHtml: '<p>This letter confirms that {{employee.firstName}} {{employee.lastName}} has been relieved from duties.</p>',
      bodyText: 'Relieving letter',
      isMandatory: false,
      eSignatureRequired: true,
      status: 'ACTIVE',
    },
    {
      templateKey: 'warning_letter',
      name: 'Warning Letter',
      module: 'hr',
      documentType: 'WARNING_LETTER',
      title: 'Warning Letter - {{employee.firstName}} {{employee.lastName}}',
      subject: 'Warning letter for {{employee.firstName}} {{employee.lastName}}',
      bodyHtml: '<p>This is a formal warning regarding {{vars.reason}}.</p>',
      bodyText: 'Warning letter',
      isMandatory: false,
      eSignatureRequired: true,
      status: 'ACTIVE',
    },
    {
      templateKey: 'policy_acknowledgement',
      name: 'Policy Acknowledgement',
      module: 'compliance',
      documentType: 'POLICY_ACKNOWLEDGEMENT',
      title: 'Policy Acknowledgement - {{vars.policyName}}',
      subject: 'Please acknowledge {{vars.policyName}}',
      bodyHtml: '<p>Please review and acknowledge {{vars.policyName}}.</p>',
      bodyText: 'Policy acknowledgement',
      isMandatory: true,
      eSignatureRequired: false,
      status: 'ACTIVE',
    },
  ];

  for (const tpl of documentTemplates) {
    const existingTpl = await prisma.documentTemplate.findFirst({
      where: { tenantId: tenant.id, templateKey: tpl.templateKey, language: 'en' },
    });
    if (existingTpl) continue;
    const created = await prisma.documentTemplate.create({
      data: {
        tenantId: tenant.id,
        templateKey: tpl.templateKey,
        name: tpl.name,
        module: tpl.module,
        documentType: tpl.documentType,
        title: tpl.title,
        subject: tpl.subject,
        bodyHtml: tpl.bodyHtml,
        bodyText: tpl.bodyText,
        variables: [],
        language: 'en',
        isMandatory: tpl.isMandatory,
        eSignatureRequired: tpl.eSignatureRequired,
        status: tpl.status as any,
        version: 1,
        createdById: adminUser.id,
      } as any,
    });
    await prisma.documentTemplateVersion.create({
      data: {
        templateId: created.id,
        version: 1,
        title: created.title,
        subject: created.subject,
        bodyHtml: created.bodyHtml,
        bodyText: created.bodyText,
        variables: [],
        createdById: adminUser.id,
      } as any,
    });
  }

  const notificationTemplates = [
    { templateKey: 'leave_approval', name: 'Leave Approval', channel: 'IN_APP', title: 'Leave request approved', body: '<p>Your leave request has been approved.</p>', isMandatory: false },
    { templateKey: 'attendance_exception', name: 'Attendance Exception', channel: 'IN_APP', title: 'Attendance exception recorded', body: '<p>An attendance exception was created for {{vars.date}}.</p>', isMandatory: false },
    { templateKey: 'payroll_published', name: 'Payroll Published', channel: 'IN_APP', title: 'Payroll is published', body: '<p>Your payslip is now available.</p>', isMandatory: true },
    { templateKey: 'payslip_available', name: 'Payslip Available', channel: 'IN_APP', title: 'Payslip ready', body: '<p>Your payslip for {{vars.month}} is ready.</p>', isMandatory: true },
    { templateKey: 'policy_acknowledgement', name: 'Policy Acknowledgement', channel: 'IN_APP', title: 'Please acknowledge {{vars.policyName}}', body: '<p>Please acknowledge {{vars.policyName}}.</p>', isMandatory: true },
    { templateKey: 'ticket_update', name: 'Ticket Update', channel: 'IN_APP', title: 'Ticket update', body: '<p>Your HR ticket has an update.</p>', isMandatory: false },
    { templateKey: 'review_reminder', name: 'Review Reminder', channel: 'IN_APP', title: 'Review reminder', body: '<p>Your review cycle is waiting for completion.</p>', isMandatory: false },
    { templateKey: 'onboarding_task', name: 'Onboarding Task', channel: 'IN_APP', title: 'Onboarding task pending', body: '<p>You have a pending onboarding task.</p>', isMandatory: false },
    { templateKey: 'exit_task', name: 'Exit Task', channel: 'IN_APP', title: 'Exit task pending', body: '<p>You have a pending exit checklist task.</p>', isMandatory: false },
    { templateKey: 'webhook_failure', name: 'Webhook Failure', channel: 'IN_APP', title: 'Webhook delivery failed', body: '<p>A webhook delivery failed and will retry.</p>', isMandatory: true },
  ];

  for (const tpl of notificationTemplates) {
    const existingTpl = await prisma.notificationTemplate.findFirst({
      where: { tenantId: tenant.id, templateKey: tpl.templateKey, channel: tpl.channel },
    });
    if (existingTpl) continue;
    const created = await prisma.notificationTemplate.create({
      data: {
        tenantId: tenant.id,
        templateKey: tpl.templateKey,
        name: tpl.name,
        channel: tpl.channel,
        title: tpl.title,
        body: tpl.body,
        variables: [],
        isMandatory: tpl.isMandatory,
        status: 'ACTIVE',
        version: 1,
        createdById: adminUser.id,
      } as any,
    });
    await prisma.notificationTemplateVersion.create({
      data: {
        templateId: created.id,
        version: 1,
        title: created.title,
        body: created.body,
        variables: [],
        createdById: adminUser.id,
      } as any,
    });
  }

  // Seed mock SMTP config for demo tenant
  const mockProvider = await prisma.emailProviderConfig.upsert({
    where: { id: 'demo-email-provider' },
    update: {},
    create: {
      id: 'demo-email-provider',
      tenantId: tenant.id,
      providerType: 'MOCK',
      name: 'Demo Mock Provider',
      isActive: true,
      isDefault: true,
      dailySendingLimit: 1000,
      createdById: 'system',
    },
  });

  // ── Demo data enrichment ───────────────────────────────────────────────────
  console.log('👥 Seeding demo employees & transactional data...');

  const DEMO_HASH = '$2a$10$Pgk3TwRa5jYs2ZYavDVdauPN6HDNCt.xCvhwjGfV25paQ10UKMCMe'; // Demo@123
  await prisma.user.updateMany({
    where: { tenantId: tenant.id, email: { in: ['admin@democorp.com', 'hr@democorp.com', 'payroll@democorp.com', 'employee@democorp.com'] } },
    data: { passwordHash: DEMO_HASH },
  });

  const allRoles = await prisma.role.findMany({ where: { tenantId: tenant.id } });
  const roleId = (name: string) => allRoles.find((r) => r.name === name)!.id;
  await prisma.userRole.createMany({
    data: [
      { userId: adminUser.id, roleId: roleId('Super Admin') },
      { userId: adminUser.id, roleId: roleId('Tenant Owner') },
      { userId: hrUser.id, roleId: roleId('HR Admin') },
      { userId: hrUser.id, roleId: roleId('Manager') },
      { userId: payrollUser.id, roleId: roleId('Payroll Admin') },
      { userId: payrollUser.id, roleId: roleId('Finance Admin') },
      { userId: employeeUser.id, roleId: roleId('Employee') },
    ],
    skipDuplicates: true,
  });

  const permissionMatrix: Record<string, Array<{ module: string; permissionType: any; scopeType: any }>> = {
    'Super Admin': ['organization', 'employees', 'roles', 'settings', 'payroll', 'developer'].flatMap((module) =>
      ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'APPROVE', 'EXPORT', 'IMPORT', 'CONFIGURE'].map((permissionType) => ({
        module,
        permissionType,
        scopeType: 'ENTIRE_TENANT',
      })),
    ),
    'Tenant Owner': ['organization', 'employees', 'roles', 'settings', 'developer'].flatMap((module) =>
      ['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'EXPORT', 'CONFIGURE'].map((permissionType) => ({
        module,
        permissionType,
        scopeType: 'ENTIRE_TENANT',
      })),
    ),
    'HR Admin': ['employees', 'organization', 'leave', 'attendance', 'onboarding'].flatMap((module) =>
      ['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'EXPORT', 'IMPORT'].map((permissionType) => ({
        module,
        permissionType,
        scopeType: 'ENTIRE_TENANT',
      })),
    ),
    'Payroll Admin': ['payroll', 'employees', 'tax'].flatMap((module) =>
      ['VIEW', 'EDIT', 'APPROVE', 'EXPORT', 'RUN_PAYROLL', 'LOCK_PAYROLL', 'UNLOCK_PAYROLL'].map((permissionType) => ({
        module,
        permissionType,
        scopeType: 'ENTIRE_TENANT',
      })),
    ),
    Manager: ['employees', 'attendance', 'leave', 'performance'].map((module) => ({
      module,
      permissionType: 'VIEW',
      scopeType: 'DIRECT_REPORTS',
    })),
    Employee: ['employees', 'attendance', 'leave', 'payslips'].map((module) => ({
      module,
      permissionType: 'VIEW',
      scopeType: 'OWN_DATA',
    })),
    Auditor: ['employees', 'payroll', 'audit'].map((module) => ({
      module,
      permissionType: 'VIEW',
      scopeType: 'ENTIRE_TENANT',
    })),
  };
  await prisma.permission.createMany({
    data: Object.entries(permissionMatrix).flatMap(([roleName, permissions]) =>
      permissions.map((permission) => ({ roleId: roleId(roleName), ...permission })),
    ),
    skipDuplicates: true,
  });
  await prisma.permission.createMany({
    data: ['salary', 'bankDetails', 'taxIds', 'documents', 'personal'].flatMap((field) =>
      ['Super Admin', 'Tenant Owner', 'HR Admin', 'Payroll Admin', 'Finance Admin', 'Auditor'].map((roleName) => ({
        roleId: roleId(roleName),
        module: `employee.field.${field}`,
        permissionType: 'VIEW_SENSITIVE' as any,
        scopeType: 'ENTIRE_TENANT' as any,
      })),
    ),
    skipDuplicates: true,
  });

  await prisma.jobRequisition.updateMany({
    where: { tenantId: tenant.id, status: 'ACTIVE' },
    data: {
      status: 'OPEN',
      approvalStatus: 'APPROVED',
      approvedById: adminUser.id,
      approvedAt: new Date(),
      publishedAt: new Date(),
    },
  });

  // Deterministic pseudo-random
  let rndState = 42;
  const rnd = () => {
    rndState = (rndState * 1103515245 + 12345) % 2147483648;
    return rndState / 2147483648;
  };

  const FIRST = ['Aarav','Priya','Rohan','Ananya','Vikram','Sneha','Arjun','Kavya','Rahul','Meera','Karan','Divya','Aditya','Pooja','Nikhil','Riya','Siddharth','Neha','Manish','Isha','Varun','Tanvi','Rajat','Shreya','Amit','Nandini','Harsh','Aisha','Deepak','Lakshmi','Sameer','Ritika','Gaurav','Anjali','Yash'];
  const LAST = ['Sharma','Patel','Reddy','Iyer','Singh','Nair','Gupta','Menon','Verma','Krishnan','Malhotra','Desai','Joshi','Kulkarni','Chopra','Banerjee','Rao','Mehta','Agarwal','Pillai','Kapoor','Saxena','Bhat','Chauhan','Mishra','Hegde','Trivedi','Khan','Yadav','Subramanian','Sinha','Dutta','Bose','Naidu','Shetty'];

  const today0 = new Date();
  const dayMs = 24 * 3600 * 1000;
  const employees: Array<Awaited<ReturnType<typeof prisma.employee.create>>> = [];

  for (let i = 0; i < 50; i++) {
    const deptIdx = i % 8;
    const isHead = i < 8;
    const joinDaysAgo = i < 3 ? 20 + i * 15 : Math.floor(rnd() * 1400) + 90;
    const joiningDate = new Date(today0.getTime() - joinDaysAgo * dayMs);
    const first = FIRST[i % FIRST.length]!;
    const last = LAST[(i * 7) % LAST.length]!;
    const emp = await prisma.employee.create({
      data: {
        tenantId: tenant.id,
        employeeCode: `EMP-${String(i + 1).padStart(4, '0')}`,
        firstName: first,
        lastName: last,
        workEmail: `${first.toLowerCase()}.${last.toLowerCase()}${i >= FIRST.length ? i + 1 : ''}@democorp.com`,
        phone: `+91 98${String(10000000 + i * 13579).slice(0, 8)}`,
        gender: i % 2 === 0 ? 'MALE' : 'FEMALE',
        dateOfBirth: new Date(1980 + (i % 20), i % 12, (i % 27) + 1),
        joiningDate,
        status: joinDaysAgo < 180 ? 'ON_PROBATION' : 'CONFIRMED',
        employmentType: i >= 33 ? 'INTERN' : i >= 31 ? 'CONTRACTOR' : 'FULL_TIME',
        workMode: i % 5 === 0 ? 'REMOTE' : i % 3 === 0 ? 'HYBRID' : 'OFFICE',
        departmentId: departments[deptIdx]!.id,
        designationId: designations[isHead ? 7 : i % 7]!.id,
        locationId: locations[i % 4]!.id,
        legalEntityId: entity1.id,
        costCenterId: costCenters[i % costCenters.length]!.id,
        businessUnitId: businessUnits[i % businessUnits.length]!.id,
        managerId: isHead ? (i === 0 ? null : employees[0]!.id) : employees[deptIdx]!.id,
        pan: `ABCDE${String(1000 + i)}F`,
        uan: `1000${String(10000000 + i * 7)}`,
        taxRegime: i % 4 === 0 ? 'OLD' : 'NEW',
      },
    });
    employees.push(emp);
  }

  // Link login users to employees
  await prisma.employee.update({ where: { id: employees[0]!.id }, data: { userId: adminUser.id } });
  await prisma.employee.update({ where: { id: employees[4]!.id }, data: { userId: hrUser.id } });
  await prisma.employee.update({ where: { id: employees[5]!.id }, data: { userId: payrollUser.id } });
  await prisma.employee.update({ where: { id: employees[7]!.id }, data: { userId: employeeUser.id } });

  const offerTemplate = await prisma.documentTemplate.findFirst({
    where: { tenantId: tenant.id, templateKey: 'offer_letter', language: 'en' },
  });
  const policyTemplate = await prisma.documentTemplate.findFirst({
    where: { tenantId: tenant.id, templateKey: 'policy_acknowledgement', language: 'en' },
  });
  if (offerTemplate) {
    await prisma.generatedDocument.create({
      data: {
        tenantId: tenant.id,
        employeeId: employees[7]!.id,
        templateId: offerTemplate.id,
        documentType: offerTemplate.documentType,
        title: `Offer Letter - ${employees[7]!.firstName} ${employees[7]!.lastName}`,
        fileKey: `demo/documents/${employees[7]!.employeeCode.toLowerCase()}-offer.html`,
        fileName: `${employees[7]!.employeeCode.toLowerCase()}-offer.html`,
        mimeType: 'text/html',
        version: 1,
        metadata: { seed: true, templateKey: offerTemplate.templateKey },
        generatedById: adminUser.id,
      } as any,
    });
    await prisma.employeeDocument.create({
      data: {
        tenantId: tenant.id,
        employeeId: employees[7]!.id,
        type: offerTemplate.documentType,
        name: `Offer Letter - ${employees[7]!.firstName} ${employees[7]!.lastName}`,
        fileKey: `demo/documents/${employees[7]!.employeeCode.toLowerCase()}-offer.html`,
        mimeType: 'text/html',
        sizeBytes: 2048,
        uploadedById: adminUser.id,
      } as any,
    });
  }
  if (policyTemplate) {
    await prisma.policyAcknowledgement.create({
      data: {
        tenantId: tenant.id,
        employeeId: employees[7]!.id,
        templateId: policyTemplate.id,
        policyKey: policyTemplate.templateKey,
        policyName: policyTemplate.name,
        fileKey: `demo/documents/${employees[7]!.employeeCode.toLowerCase()}-policy.html`,
        comments: 'Acknowledged during onboarding',
        acknowledgedById: employeeUser.id,
      } as any,
    });
  }

  // Onboarding and offboarding templates/tasks
  const onboardingTemplate = await prisma.onboardingTemplate.create({
    data: {
      tenantId: tenant.id,
      name: 'Full-time India New Joiner',
      description: 'Scoped onboarding plan with document collection, joining forms, buddy support, policy acknowledgement, and probation confirmation.',
      departmentId: departments[0]!.id,
      locationId: locations[1]!.id,
      employmentType: 'FULL_TIME',
      roleScope: ['Employee', 'Manager', 'HR Admin'],
      tasks: [
        { title: 'Manager first-week checklist', assignedTo: 'MANAGER', category: 'MANAGER', dueInDays: 1, isMandatory: true },
        { title: 'IT equipment and app access', assignedTo: 'IT', category: 'IT', dueInDays: -1, isMandatory: true },
        { title: 'Admin seating and ID card', assignedTo: 'ADMIN', category: 'ADMIN', dueInDays: 0, isMandatory: true },
        { title: 'Finance bank and payroll verification', assignedTo: 'FINANCE', category: 'FINANCE', dueInDays: 2, isMandatory: true },
        { title: '30-day probation confirmation check-in', assignedTo: 'HR', category: 'PROBATION', dueInDays: 30, isMandatory: true },
      ],
      documentChecklist: [
        { title: 'PAN card upload', assignedTo: 'EMPLOYEE', dueInDays: -3, isMandatory: true },
        { title: 'Aadhaar upload', assignedTo: 'EMPLOYEE', dueInDays: -3, isMandatory: true },
        { title: 'Education certificates', assignedTo: 'EMPLOYEE', dueInDays: -2, isMandatory: false },
      ],
      joiningForms: [
        { title: 'Personal details joining form', assignedTo: 'EMPLOYEE', dueInDays: -3, isMandatory: true },
        { title: 'Bank account declaration', assignedTo: 'EMPLOYEE', dueInDays: -2, isMandatory: true },
      ],
      welcomeEmail: {
        subject: 'Welcome to Demo Corp India',
        body: 'We are excited to have you join PeopleHub Platform.',
      },
      policyChecklist: [
        { title: 'Code of conduct acknowledgement', assignedTo: 'EMPLOYEE', dueInDays: 0, isMandatory: true },
        { title: 'Information security policy acknowledgement', assignedTo: 'EMPLOYEE', dueInDays: 0, isMandatory: true },
      ],
    },
  });

  const onboardingDefs = [
    { title: 'Manager first-week checklist', assignedTo: 'MANAGER', category: 'MANAGER', dueInDays: 1, done: true },
    { title: 'IT equipment and app access', assignedTo: 'IT', category: 'IT', dueInDays: -1, done: true },
    { title: 'PAN card upload', assignedTo: 'EMPLOYEE', category: 'DOCUMENT', requiresUpload: true, documentKey: 'demo/pan-card.pdf', dueInDays: -3, done: true },
    { title: 'Aadhaar upload', assignedTo: 'EMPLOYEE', category: 'DOCUMENT', requiresUpload: true, dueInDays: -3, done: false },
    { title: 'Personal details joining form', assignedTo: 'EMPLOYEE', category: 'FORM', dueInDays: -3, done: true, formResponse: { emergencyContact: 'Demo Contact', bloodGroup: 'O+' } },
    { title: 'Code of conduct acknowledgement', assignedTo: 'EMPLOYEE', category: 'POLICY', dueInDays: 0, done: false },
    { title: 'Meet assigned buddy', assignedTo: 'MANAGER', category: 'BUDDY', dueInDays: 1, done: false },
    { title: '30-day probation confirmation check-in', assignedTo: 'HR', category: 'PROBATION', dueInDays: 30, done: false },
  ];
  for (let i = 0; i < 3; i++) {
    const base = employees[i]!.joiningDate ?? today0;
    await prisma.onboardingTask.createMany({
      data: onboardingDefs.map((task, idx) => ({
        tenantId: tenant.id,
        employeeId: employees[i]!.id,
        onboardingTemplateId: onboardingTemplate.id,
        title: task.title,
        assignedTo: task.assignedTo,
        category: task.category,
        isMandatory: idx !== 2,
        requiresUpload: task.requiresUpload ?? false,
        documentKey: task.documentKey,
        formResponse: task.formResponse ?? {},
        acknowledgedAt: task.category === 'POLICY' && task.done ? new Date(base.getTime() + dayMs) : null,
        buddyEmployeeId: task.category === 'BUDDY' ? employees[(i + 8) % employees.length]!.id : null,
        dueDate: new Date(base.getTime() + task.dueInDays * dayMs),
        completedAt: task.done ? new Date(base.getTime() + Math.max(task.dueInDays, 0) * dayMs) : null,
      })),
    });
  }

  const exitEmployee = employees[18]!;
  await prisma.employee.update({
    where: { id: exitEmployee.id },
    data: {
      status: 'ON_NOTICE',
      exitDate: new Date(today0.getTime() + 28 * dayMs),
      noticePeriodDays: 30,
    },
  });
  const exitRequest = await prisma.exitRequest.create({
    data: {
      tenantId: tenant.id,
      employeeId: exitEmployee.id,
      resignationDate: new Date(today0.getTime() - 2 * dayMs),
      lastWorkingDate: new Date(today0.getTime() + 28 * dayMs),
      noticePeriodDays: 30,
      reason: 'Relocation',
      status: 'PENDING',
      managerApprovalStatus: 'APPROVED',
      hrApprovalStatus: 'PENDING',
      assetRecoveryStatus: 'PENDING',
      knowledgeTransferStatus: 'PENDING',
      exitInterviewStatus: 'PENDING',
      finalSettlementStatus: 'PENDING',
    },
  });
  await prisma.exitTask.createMany({
    data: [
      { tenantId: tenant.id, employeeId: exitEmployee.id, exitRequestId: exitRequest.id, title: 'Manager approval', assignedTo: 'MANAGER', category: 'HR', isMandatory: true, completedAt: new Date() },
      { tenantId: tenant.id, employeeId: exitEmployee.id, exitRequestId: exitRequest.id, title: 'Recover laptop and access card', assignedTo: 'ADMIN', category: 'ASSET', isMandatory: true, dueDate: exitRequest.lastWorkingDate },
      { tenantId: tenant.id, employeeId: exitEmployee.id, exitRequestId: exitRequest.id, title: 'Complete knowledge transfer notes', assignedTo: 'MANAGER', category: 'KT', isMandatory: true, dueDate: exitRequest.lastWorkingDate },
      { tenantId: tenant.id, employeeId: exitEmployee.id, exitRequestId: exitRequest.id, title: 'Conduct exit interview', assignedTo: 'HR', category: 'EXIT_INTERVIEW', isMandatory: true, dueDate: exitRequest.lastWorkingDate },
      { tenantId: tenant.id, employeeId: exitEmployee.id, exitRequestId: exitRequest.id, title: 'Process final settlement', assignedTo: 'FINANCE', category: 'FINANCE', isMandatory: true, dueDate: exitRequest.lastWorkingDate },
      { tenantId: tenant.id, employeeId: exitEmployee.id, exitRequestId: exitRequest.id, title: 'Generate experience and relieving letters', assignedTo: 'HR', category: 'DOCUMENT', isMandatory: true, dueDate: exitRequest.lastWorkingDate },
    ],
  });

  await prisma.shiftAssignment.createMany({
    data: employees.map((emp, i) => ({
      employeeId: emp.id,
      shiftId: shifts[i % shifts.length]!.id,
      effectiveFrom: new Date(today0.getFullYear(), today0.getMonth() - 2, 1),
      source: 'MANUAL',
    })),
  });
  const rosterUpload = await prisma.rosterUpload.create({
    data: {
      tenantId: tenant.id,
      name: 'July operations roster import',
      periodStart: new Date(Date.UTC(today0.getFullYear(), today0.getMonth(), 1)),
      periodEnd: new Date(Date.UTC(today0.getFullYear(), today0.getMonth() + 1, 0)),
      uploadedById: employees[4]!.id,
      status: 'IMPORTED',
      importedCount: 10,
      failedCount: 0,
    },
  });
  for (let i = 0; i < 10; i++) {
    await prisma.rosterUploadRow.create({
      data: {
        rosterUploadId: rosterUpload.id,
        employeeId: employees[i]!.id,
        employeeCode: employees[i]!.employeeCode,
        shiftId: shifts[(i + 1) % shifts.length]!.id,
        shiftName: shifts[(i + 1) % shifts.length]!.name,
        date: new Date(Date.UTC(today0.getFullYear(), today0.getMonth(), 8 + i)),
      },
    });
  }

  // Salaries
  const ctcFor = (i: number) => (i < 8 ? 3200000 + i * 150000 : 450000 + Math.floor(rnd() * 1800000));
  const buildComponents = (ctc: number) => {
    const monthlyCtc = ctc / 12;
    let gross = monthlyCtc;
    for (let k = 0; k < 3; k++) {
      gross = monthlyCtc - 0.12 * Math.min(gross * 0.4, 15000);
    }
    const basic = Math.round(gross * 0.4);
    const hra = Math.round(basic * 0.5);
    const sa = Math.round(gross - basic - hra);
    return {
      gross: Math.round(gross),
      list: [
        { code: 'BASIC', name: 'Basic', type: 'EARNING', monthly: basic, annual: basic * 12 },
        { code: 'HRA', name: 'HRA', type: 'EARNING', monthly: hra, annual: hra * 12 },
        { code: 'SA', name: 'Special Allowance', type: 'EARNING', monthly: sa, annual: sa * 12 },
      ],
      basic,
    };
  };
  for (let i = 0; i < employees.length; i++) {
    const ctc = ctcFor(i);
    const breakup = buildComponents(ctc);
    await prisma.employeeSalary.create({
      data: {
        employeeId: employees[i]!.id,
        salaryStructureId: salaryStructure.id,
        ctc,
        effectiveFrom: employees[i]!.joiningDate ?? new Date(),
        components: breakup.list,
      },
    });
  }

  // Attendance: last 45 days, skipping weekends
  const holidays = await prisma.holiday.findMany({ where: { holidayCalendar: { tenantId: tenant.id } } });
  const holidaySet = new Set(holidays.map((h) => h.date.toISOString().slice(0, 10)));
  const attendanceRows: Array<Record<string, unknown>> = [];
  for (let d = 45; d >= 0; d--) {
    const day = new Date(Date.UTC(today0.getFullYear(), today0.getMonth(), today0.getDate() - d));
    const dow = day.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    if (holidaySet.has(day.toISOString().slice(0, 10))) continue;
    for (let i = 0; i < employees.length; i++) {
      const emp = employees[i]!;
      if (emp.joiningDate && emp.joiningDate > day) continue;
      const assignedShift = shifts[i % shifts.length]!;
      const roll = rnd();
      let status = 'PRESENT';
      if (roll > 0.96) status = 'ABSENT';
      else if (roll > 0.9) status = 'ON_LEAVE';
      else if (roll > 0.82) status = 'LATE';
      const inMin = status === 'LATE' ? 40 + Math.floor(rnd() * 60) : Math.floor(rnd() * 30) - 15;
      const [startH, startM] = assignedShift.startTime.split(':').map(Number);
      const punchIn = new Date(day.getTime() + (startH * 60 + startM + inMin) * 60000);
      const workMins = 7 * 60 + Math.floor(rnd() * 180);
      const overtimeMinutes = status === 'ABSENT' || status === 'ON_LEAVE' ? null : Math.max(0, workMins - assignedShift.overtimeAfterMinutes);
      attendanceRows.push({
        tenantId: tenant.id,
        employeeId: emp.id,
        shiftId: assignedShift.id,
        date: day,
        status,
        punchIn: status === 'ABSENT' || status === 'ON_LEAVE' ? null : punchIn,
        punchOut:
          status === 'ABSENT' || status === 'ON_LEAVE'
            ? null
            : new Date(punchIn.getTime() + workMins * 60000),
        workingMinutes: status === 'ABSENT' || status === 'ON_LEAVE' ? null : workMins,
        overtimeMinutes,
        punchSource: 'WEB',
        isFinalized: true,
      });
    }
  }
  await prisma.attendanceRecord.createMany({ data: attendanceRows as never, skipDuplicates: true });
  const attendanceFinalization = await prisma.attendanceFinalization.create({
    data: {
      tenantId: tenant.id,
      month: today0.getMonth() + 1,
      year: today0.getFullYear(),
      finalizedById: employees[4]!.id,
      notes: 'Seeded finalized attendance for payroll preview',
      summary: {
        importedRecords: attendanceRows.length,
        source: 'seed',
      },
    },
  });
  await prisma.attendanceRecord.updateMany({
    where: {
      tenantId: tenant.id,
      date: {
        gte: new Date(Date.UTC(today0.getFullYear(), today0.getMonth(), 1)),
        lt: new Date(Date.UTC(today0.getFullYear(), today0.getMonth() + 1, 1)),
      },
    },
    data: { finalizationId: attendanceFinalization.id, isFinalized: true },
  });

  // Leave balances + requests
  const year = today0.getFullYear();
  const allocation: Record<string, number> = {
    CL: 12,
    SL: 12,
    EL: 15,
    PL: 18,
    ML: 182,
    PAT: 15,
    BL: 5,
    CO: 2,
    OH: 2,
    LWP: 0,
    STUDY: 0,
  };
  for (const emp of employees) {
    for (const lt of leaveTypes) {
      if (lt.code === 'ML' && emp.gender !== 'FEMALE') continue;
      const alloc = allocation[lt.code] ?? 0;
      const used = alloc > 0 ? Math.floor(rnd() * Math.min(alloc, 6)) : 0;
      await prisma.leaveBalance.create({
        data: {
          employeeId: emp.id,
          leaveTypeId: lt.id,
          year,
          openingBalance: alloc,
          accrued: alloc,
          used,
          balance: alloc - used,
        },
      });
    }
  }
  const leaveStatuses = ['APPROVED','APPROVED','APPROVED','APPROVED','APPROVED','APPROVED','APPROVED','APPROVED','APPROVED','APPROVED','APPROVED','APPROVED','APPROVED','APPROVED','APPROVED','APPROVED','APPROVED','PENDING','PENDING','PENDING','PENDING','PENDING','PENDING','REJECTED','REJECTED'] as const;
  for (let i = 0; i < leaveStatuses.length; i++) {
    const emp = employees[(i * 3) % employees.length]!;
    const lt = leaveTypes[i % 3]!; // CL, SL, EL only
    const status = leaveStatuses[i]!;
    const offset = status === 'PENDING' ? 3 + i : -(5 + i * 2);
    const from = new Date(Date.UTC(today0.getFullYear(), today0.getMonth(), today0.getDate() + offset));
    const days = 1 + (i % 3);
    const to = new Date(from.getTime() + (days - 1) * dayMs);
    await prisma.leaveRequest.create({
      data: {
        tenantId: tenant.id,
        employeeId: emp.id,
        leaveTypeId: lt.id,
        fromDate: from,
        toDate: to,
        days,
        reason: ['Family function','Not feeling well','Personal errand','Travel plans','Medical appointment'][i % 5],
        status,
      },
    });
  }
  const lwpType = leaveTypes.find((lt) => lt.code === 'LWP')!;
  await prisma.leaveRequest.create({
    data: {
      tenantId: tenant.id,
      employeeId: employees[8]!.id,
      leaveTypeId: lwpType.id,
      fromDate: new Date(Date.UTC(today0.getFullYear(), today0.getMonth(), 3)),
      toDate: new Date(Date.UTC(today0.getFullYear(), today0.getMonth(), 4)),
      days: 2,
      reason: 'Approved unpaid personal leave',
      status: 'APPROVED',
    },
  });
  await prisma.compOffGrant.create({
    data: {
      tenantId: tenant.id,
      employeeId: employees[9]!.id,
      earnedDate: new Date(Date.UTC(today0.getFullYear(), today0.getMonth(), 5)),
      days: 1,
      expiresAt: new Date(today0.getTime() + 75 * dayMs),
      notes: 'Weekend release support',
    },
  });
  await prisma.shiftSwapRequest.create({
    data: {
      tenantId: tenant.id,
      requesterEmployeeId: employees[10]!.id,
      counterpartEmployeeId: employees[11]!.id,
      requestedShiftId: shifts[0]!.id,
      targetShiftId: shifts[2]!.id,
      requestedDate: new Date(Date.UTC(today0.getFullYear(), today0.getMonth(), 12)),
      targetDate: new Date(Date.UTC(today0.getFullYear(), today0.getMonth(), 13)),
      reason: 'Covering night release support',
      status: 'REQUESTED',
    },
  });

  // Payroll: previous 5 months published runs + current run entries
  const calcMonth = (ctc: number, emi = 0) => {
    const b = buildComponents(ctc);
    const gross = b.gross;
    const pf = Math.round(0.12 * Math.min(b.basic, 15000));
    const esi = gross <= 21000 ? Math.round(gross * 0.0075) : 0;
    const pt = gross >= 15000 ? 200 : gross >= 10000 ? 150 : 0;
    const annualTaxable = Math.max(0, gross * 12 - 75000);
    let tds = 0;
    if (annualTaxable > 1200000) {
      const slabs: Array<[number, number, number]> = [[0,400000,0],[400000,800000,0.05],[800000,1200000,0.1],[1200000,1600000,0.15],[1600000,2000000,0.2],[2000000,2400000,0.25],[2400000,Infinity,0.3]];
      let tax = 0;
      for (const [lo, hi, rate] of slabs) if (annualTaxable > lo) tax += (Math.min(annualTaxable, hi) - lo) * rate;
      tds = Math.round((tax * 1.04) / 12);
    }
    const deductions = pf + esi + pt + tds + emi;
    const comps = [
      ...b.list,
      { code: 'PF_EMP', name: 'Provident Fund (Employee)', type: 'DEDUCTION', monthly: pf, annual: pf * 12 },
      ...(esi ? [{ code: 'ESI_EMP', name: 'ESI (Employee)', type: 'DEDUCTION', monthly: esi, annual: esi * 12 }] : []),
      ...(pt ? [{ code: 'PT', name: 'Professional Tax', type: 'DEDUCTION', monthly: pt, annual: pt * 12 }] : []),
      ...(tds ? [{ code: 'TDS', name: 'TDS', type: 'DEDUCTION', monthly: tds, annual: tds * 12 }] : []),
    ];
    return { gross, deductions, net: gross - deductions, comps };
  };

  for (let m = 5; m >= 1; m--) {
    const runDate = new Date(today0.getFullYear(), today0.getMonth() - m, 1);
    const run = await prisma.payrollRun.create({
      data: {
        tenantId: tenant.id,
        month: runDate.getMonth() + 1,
        year: runDate.getFullYear(),
        status: 'PUBLISHED',
        publishedAt: new Date(runDate.getFullYear(), runDate.getMonth() + 1, 1),
      },
    });
    for (let i = 0; i < employees.length; i++) {
      const emp = employees[i]!;
      if (emp.joiningDate && emp.joiningDate > runDate) continue;
      const r = calcMonth(ctcFor(i));
      await prisma.payrollRunEmployee.create({
        data: {
          payrollRunId: run.id,
          employeeId: emp.id,
          grossPay: r.gross,
          totalDeductions: r.deductions,
          netPay: r.net,
          payableDays: 30,
          components: r.comps,
        },
      });
      await prisma.payslip.create({
        data: {
          tenantId: tenant.id,
          employeeId: emp.id,
          payrollRunId: run.id,
          month: run.month,
          year: run.year,
          grossPay: r.gross,
          totalDeductions: r.deductions,
          netPay: r.net,
          components: r.comps,
          publishedAt: run.publishedAt,
        },
      });
    }
  }
  // Current-month run entries (kept in DRAFT for the demo flow)
  for (let i = 0; i < employees.length; i++) {
    const r = calcMonth(ctcFor(i));
    await prisma.payrollRunEmployee.create({
      data: {
        payrollRunId: payrollRun.id,
        employeeId: employees[i]!.id,
        grossPay: r.gross,
        totalDeductions: r.deductions,
        netPay: r.net,
        payableDays: 30,
        components: r.comps,
      },
    });
  }

  // Recruitment: candidates, interviews, offers
  const jobs = await prisma.jobRequisition.findMany({ where: { tenantId: tenant.id } });
  const CAND_STAGES = ['APPLIED','APPLIED','SCREENING','SCREENING','RECRUITER_CALL','TECHNICAL_ROUND','TECHNICAL_ROUND','MANAGER_ROUND','HR_ROUND','OFFER_SENT','OFFER_ACCEPTED','REJECTED','APPLIED','SCREENING'] as const;
  const CAND_SOURCES = ['LinkedIn','Naukri','Referral','Website','LinkedIn','Referral','Naukri'];
  const CAND_FIRST = ['Ishaan','Zara','Kabir','Myra','Vivaan','Anika','Reyansh','Sara','Ayaan','Diya','Advait','Kiara','Dhruv','Navya'];
  const CAND_LAST = ['Bajaj','Fernandes','Oberoi','Mathur','Chandra','Rana','Tandon','Bhalla','Sethi','Grover','Anand','Kohli','Vohra','Sood'];
  const candidates: Array<Awaited<ReturnType<typeof prisma.candidate.create>>> = [];
  for (let i = 0; i < 15; i++) {
    const first = CAND_FIRST[i % CAND_FIRST.length]!;
    const last = CAND_LAST[(i * 5) % CAND_LAST.length]!;
    const cand = await prisma.candidate.create({
      data: {
        tenantId: tenant.id,
        jobRequisitionId: jobs[i % jobs.length]!.id,
        firstName: first,
        lastName: last,
        email: `${first.toLowerCase()}.${last.toLowerCase()}${i >= CAND_FIRST.length ? i + 1 : ''}@example.com`,
        phone: `+91 97${String(10000000 + i * 24681).slice(0, 8)}`,
        currentStage: CAND_STAGES[i]!,
        source: CAND_SOURCES[i % CAND_SOURCES.length],
        currentCTC: 800000 + i * 120000,
        expectedCTC: 1100000 + i * 150000,
        noticePeriodDays: [30, 60, 90][i % 3],
      },
    });
    candidates.push(cand);
  }
  for (let i = 0; i < 6; i++) {
    const upcoming = i < 2;
    await prisma.interview.create({
      data: {
        tenantId: tenant.id,
        candidateId: candidates[i + 4]!.id,
        jobRequisitionId: candidates[i + 4]!.jobRequisitionId,
        stage: ['TECHNICAL_ROUND', 'MANAGER_ROUND', 'HR_ROUND'][i % 3]!,
        scheduledAt: new Date(today0.getTime() + (upcoming ? (i + 1) * dayMs : -(i * 2 + 1) * dayMs)),
        interviewers: [`${FIRST[i]} ${LAST[i]}`],
        mode: i % 2 === 0 ? 'VIDEO' : 'IN_PERSON',
        ...(upcoming ? {} : {
          rating: 3 + (i % 3),
          result: i % 3 === 2 ? 'ON_HOLD' : 'PASS',
          feedback: 'Strong fundamentals, good communication.',
          scorecard: {
            competencies: [
              { name: 'Technical depth', rating: 3 + (i % 3), weight: 2, notes: 'Clear problem decomposition.' },
              { name: 'Communication', rating: 4, weight: 1, notes: 'Structured and concise.' },
              { name: 'Role fit', rating: i % 3 === 2 ? 3 : 4, weight: 1, notes: 'Good alignment with team needs.' },
            ],
            strengths: 'Strong fundamentals and ownership signals.',
            concerns: i % 3 === 2 ? 'Needs another discussion on system design scope.' : '',
            recommendation: i % 3 === 2 ? 'HOLD' : 'HIRE',
            weightedRating: i % 3 === 2 ? 3.5 : 4,
            submittedAt: new Date(today0.getTime() - i * dayMs).toISOString(),
          },
        }),
      },
    });
  }
  await prisma.offer.create({
    data: { tenantId: tenant.id, candidateId: candidates[9]!.id, ctc: 2400000, joiningDate: new Date(today0.getTime() + 30 * dayMs), designation: 'Senior Full Stack Engineer', status: 'SENT' },
  });
  await prisma.offer.create({
    data: { tenantId: tenant.id, candidateId: candidates[10]!.id, ctc: 2100000, joiningDate: new Date(today0.getTime() + 45 * dayMs), designation: 'Product Manager', status: 'ACCEPTED' },
  });

  // Performance: goals, review responses, feedback
  const GOAL_TITLES = ['Ship payroll v2 engine','Reduce time-to-hire to 21 days','Improve eNPS by 10 points','Close Q3 enterprise deals','Launch referral program','Migrate CI to Node 24','Automate compliance reports','Redesign onboarding flow','Cut infra cost by 15%','Mentor two junior engineers','Achieve 99.9% uptime','Publish API v1 docs','Run 4 pulse surveys','Roll out OKR process','Complete SOC2 readiness'];
  for (let i = 0; i < GOAL_TITLES.length; i++) {
    const progress = [10, 25, 40, 55, 70, 85, 100][i % 7]!;
    await prisma.goal.create({
      data: {
        tenantId: tenant.id,
        employeeId: employees[(i * 2) % employees.length]!.id,
        title: GOAL_TITLES[i]!,
        type: i % 5 === 0 ? 'COMPANY' : i % 3 === 0 ? 'TEAM' : 'INDIVIDUAL',
        keyResults: [
          { title: 'Milestone progress', current: progress, target: 100, unit: '%', weight: 2, status: progress >= 100 ? 'DONE' : progress < 40 ? 'AT_RISK' : 'ON_TRACK' },
          { title: 'Stakeholder confidence', current: Math.min(5, 2 + (i % 4)), target: 5, unit: 'score', weight: 1, status: progress >= 70 ? 'ON_TRACK' : 'NOT_STARTED' },
        ],
        progress,
        status: progress === 100 ? 'COMPLETED' : progress < 30 && i % 4 === 0 ? 'AT_RISK' : 'ACTIVE',
        targetDate: new Date(today0.getFullYear(), 11, 31),
      },
    });
  }
  const cycle = await prisma.reviewCycle.findFirst({ where: { tenantId: tenant.id } });
  if (cycle) {
    for (let i = 0; i < 8; i++) {
      await prisma.reviewResponse.create({
        data: {
          reviewCycleId: cycle.id,
          revieweeId: employees[i + 8]!.id,
          reviewerId: employees[i % 8]!.id,
          reviewerType: 'MANAGER',
          overallRating: 3 + (i % 3),
          comments: 'Consistent performer; strong ownership this cycle.',
          responses: { strengths: 'Delivery, collaboration', growth: 'Delegation' },
          submittedAt: new Date(today0.getTime() - i * dayMs),
        },
      });
    }
  }
  const FEEDBACK_MSGS = ['Great job on the client demo!','Thanks for unblocking the release.','Excellent documentation on the new module.','Your onboarding buddy support was fantastic.','Impressive debugging under pressure.','Loved the sprint retro facilitation.','Thanks for covering on-call.','Solid RCA writeup.','Great mentoring this month.','Clean, well-tested PRs — keep it up.'];
  for (let i = 0; i < FEEDBACK_MSGS.length; i++) {
    await prisma.feedback.create({
      data: {
        tenantId: tenant.id,
        giverId: employees[i % 8]!.id,
        recipientId: employees[(i + 10) % employees.length]!.id,
        type: i % 2 === 0 ? 'PRAISE' : 'FEEDBACK',
        message: FEEDBACK_MSGS[i]!,
        isPublic: i % 2 === 0,
      },
    });
  }

  await prisma.competencyFramework.create({
    data: {
      tenantId: tenant.id,
      name: 'PeopleHub Leadership & Delivery Framework',
      description: 'Default performance competencies used for review cycles and calibration.',
      competencies: [
        { id: 'delivery', name: 'Delivery', description: 'Ships reliable outcomes against commitments' },
        { id: 'collaboration', name: 'Collaboration', description: 'Works well across teams and communicates clearly' },
        { id: 'leadership', name: 'Leadership', description: 'Raises standards and mentors others' },
        { id: 'customer', name: 'Customer impact', description: 'Connects work to customer and business outcomes' },
      ],
      ratingScale: [
        { rating: 1, label: 'Needs improvement' },
        { rating: 2, label: 'Developing' },
        { rating: 3, label: 'Meets expectations' },
        { rating: 4, label: 'Exceeds expectations' },
        { rating: 5, label: 'Exceptional' },
      ],
    },
  });

  const firstGoals = await prisma.goal.findMany({ where: { tenantId: tenant.id }, take: 8, orderBy: { createdAt: 'asc' } });
  for (let i = 0; i < firstGoals.length; i++) {
    await prisma.performanceCheckIn.create({
      data: {
        tenantId: tenant.id,
        employeeId: firstGoals[i]!.employeeId,
        managerId: employees[i % 6]!.id,
        goalId: firstGoals[i]!.id,
        checkInDate: new Date(today0.getTime() - i * dayMs),
        status: i % 4 === 0 ? 'AT_RISK' : 'ON_TRACK',
        progress: firstGoals[i]!.progress,
        notes: 'Weekly OKR check-in captured with current progress and next actions.',
        blockers: i % 4 === 0 ? 'Waiting on cross-functional dependency.' : '',
        nextSteps: 'Review key result movement before the next manager 1:1.',
      },
    });
  }
  for (let i = 0; i < 6; i++) {
    await prisma.oneOnOne.create({
      data: {
        tenantId: tenant.id,
        employeeId: employees[i + 12]!.id,
        managerId: employees[i]!.id,
        scheduledAt: new Date(today0.getTime() + (i + 1) * dayMs),
        status: i < 2 ? 'COMPLETED' : 'SCHEDULED',
        agenda: ['Goal progress', 'Feedback', 'Career growth'],
        notes: i < 2 ? 'Discussed delivery risks and growth goals.' : null,
        actionItems: i < 2 ? ['Share design review notes', 'Update goal confidence'] : [],
        completedAt: i < 2 ? new Date(today0.getTime() - dayMs) : null,
      },
    });
  }
  if (cycle) {
    await prisma.performanceCalibration.create({
      data: {
        tenantId: tenant.id,
        reviewCycleId: cycle.id,
        revieweeId: employees[10]!.id,
        calibratedById: employees[0]!.id,
        previousRating: 4,
        calibratedRating: 4.5,
        performanceBand: 'HIGH_PERFORMER',
        potential: 'HIGH',
        promotionRecommendation: 'Ready for Senior role review',
        reason: 'Cross-functional impact exceeded original manager review evidence.',
      },
    });
    await prisma.performanceImprovementPlan.create({
      data: {
        tenantId: tenant.id,
        employeeId: employees[14]!.id,
        reviewCycleId: cycle.id,
        title: 'Delivery predictability improvement plan',
        reason: 'Repeated missed estimates on critical payroll milestones.',
        successCriteria: [
          { item: 'Weekly written status updates for four consecutive weeks' },
          { item: 'No uncommunicated milestone slips in the plan period' },
        ],
        startDate: today0,
        endDate: new Date(today0.getTime() + 60 * dayMs),
        createdById: employees[0]!.id,
      },
    });
    await prisma.promotionRecommendation.create({
      data: {
        tenantId: tenant.id,
        employeeId: employees[10]!.id,
        reviewCycleId: cycle.id,
        currentRole: 'Software Engineer',
        recommendedRole: 'Senior Software Engineer',
        reason: 'Sustained ownership across payroll and attendance releases.',
        recommendedById: employees[0]!.id,
      },
    });
  }

  // Engagement: survey responses + recognitions
  const survey = await prisma.survey.findFirst({ where: { tenantId: tenant.id } });
  if (survey) {
    for (let i = 0; i < 12; i++) {
      const employeeId = employees[i]!.id;
      await prisma.surveyResponse.create({
        data: {
          surveyId: survey.id,
          respondentHash: crypto.createHash('sha256').update(`${survey.id}:${employeeId}`).digest('hex'),
          segment: {
            department: ['Engineering', 'HR', 'Sales', 'Operations'][i % 4],
            location: ['Bengaluru', 'Delhi', 'Mumbai'][i % 3],
            manager: `Manager ${(i % 4) + 1}`,
            tenure: ['0-6 months', '6-12 months', '1-3 years', '3-5 years'][i % 4],
          },
          responses: { '1': 3 + (i % 3), '2': 3 + ((i + 1) % 3), '3': 6 + (i % 5), '4': i % 4 === 0 ? 'More team offsites please!' : '' },
        },
      });
    }
  }
  const BADGES = ['TEAM_PLAYER','INNOVATOR','CUSTOMER_FIRST','OWNERSHIP','MENTOR'];
  const RECOG_MSGS = ['Went above and beyond for the payroll release','Brilliant fix for the attendance sync bug','Always there to help new joiners','Owned the client escalation end to end','Made our sprint demos delightful'];
  for (let i = 0; i < 15; i++) {
    await prisma.recognition.create({
      data: {
        tenantId: tenant.id,
        giverId: employees[i % 10]!.id,
        recipientId: employees[(i + 7) % employees.length]!.id,
        badge: BADGES[i % BADGES.length],
        message: RECOG_MSGS[i % RECOG_MSGS.length]!,
        points: [10, 15, 20, 25, 30][i % 5]!,
      },
    });
  }

  await prisma.announcement.createMany({
    data: [
      {
        tenantId: tenant.id,
        title: 'Q3 OKR planning starts next week',
        body: 'Managers should complete team OKR drafts before Friday. HR will publish the final calendar after leadership review.',
        audience: 'ALL',
        status: 'PUBLISHED',
        publishAt: new Date(today0.getTime() - 2 * dayMs),
      },
      {
        tenantId: tenant.id,
        title: 'Payroll proof window closes soon',
        body: 'Employees should upload pending investment proofs by the end of this week to avoid higher projected TDS.',
        audience: 'EMPLOYEES',
        status: 'PUBLISHED',
        publishAt: new Date(today0.getTime() - dayMs),
      },
    ],
  });

  await prisma.anonymousFeedback.createMany({
    data: [
      {
        tenantId: tenant.id,
        category: 'CULTURE',
        message: 'More structured manager 1:1s would help remote employees stay aligned.',
        sentiment: 'CONSTRUCTIVE',
      },
      {
        tenantId: tenant.id,
        category: 'WORKPLACE',
        message: 'The new recognition wall is increasing visibility for cross-team support.',
        sentiment: 'POSITIVE',
      },
    ],
  });

  // Helpdesk tickets
  const TICKETS = [
    { category: 'PAYROLL', subject: 'Payslip for May not visible', priority: 'HIGH', status: 'OPEN' },
    { category: 'IT', subject: 'Laptop running very slow', priority: 'MEDIUM', status: 'IN_PROGRESS' },
    { category: 'HR', subject: 'Need employment verification letter', priority: 'MEDIUM', status: 'RESOLVED' },
    { category: 'LEAVE', subject: 'Leave balance looks incorrect', priority: 'HIGH', status: 'OPEN' },
    { category: 'IT', subject: 'VPN access for remote work', priority: 'URGENT', status: 'IN_PROGRESS' },
    { category: 'FACILITIES', subject: 'AC not working on 3rd floor', priority: 'LOW', status: 'RESOLVED' },
    { category: 'PAYROLL', subject: 'PF contribution query', priority: 'MEDIUM', status: 'WAITING' },
    { category: 'HR', subject: 'Update emergency contact', priority: 'LOW', status: 'CLOSED' },
    { category: 'IT', subject: 'Request second monitor', priority: 'LOW', status: 'OPEN' },
    { category: 'HR', subject: 'Insurance card not received', priority: 'HIGH', status: 'IN_PROGRESS' },
  ] as const;
  for (let i = 0; i < TICKETS.length; i++) {
    const t = TICKETS[i]!;
    const ticket = await prisma.ticket.create({
      data: {
        tenantId: tenant.id,
        employeeId: employees[(i * 4) % employees.length]!.id,
        category: t.category,
        subject: t.subject,
        description: `${t.subject} — raised via employee portal.`,
        priority: t.priority,
        status: t.status,
        ...(t.status === 'RESOLVED' || t.status === 'CLOSED'
          ? { resolvedAt: new Date(today0.getTime() - i * dayMs) }
          : {}),
      },
    });
    if (i % 3 === 0) {
      await prisma.ticketComment.create({
        data: { ticketId: ticket.id, authorId: hrUser.id, message: 'We are looking into this — expect an update within 24 hours.' },
      });
    }
  }

  await prisma.helpdeskSlaRule.createMany({
    data: [
      { tenantId: tenant.id, category: 'PAYROLL', priority: 'HIGH', responseHours: 2, resolutionHours: 8, assigneeQueue: 'Payroll Admin', isActive: true },
      { tenantId: tenant.id, category: 'IT', priority: 'MEDIUM', responseHours: 4, resolutionHours: 24, assigneeQueue: 'IT/Admin', isActive: true },
      { tenantId: tenant.id, category: 'LEAVE', priority: null, responseHours: 4, resolutionHours: 24, assigneeQueue: 'HR Operations', isActive: true },
    ],
  });

  await prisma.knowledgeBaseArticle.createMany({
    data: [
      {
        tenantId: tenant.id,
        title: 'How to raise a payroll query',
        summary: 'Steps employees should follow when payslip or TDS information looks incorrect.',
        body: 'Review the payslip, check the tax declaration, and attach supporting documents before raising a payroll ticket.',
        category: 'PAYROLL',
        tags: ['payroll', 'tds', 'payslip'],
        status: 'PUBLISHED',
        sourceType: 'FAQ',
      },
      {
        tenantId: tenant.id,
        title: 'Leave policy acknowledgement',
        summary: 'Policy for leave approvals, attachment requirements, and notice-period restrictions.',
        body: 'Employees must acknowledge the leave policy before applying for restricted leave categories.',
        category: 'LEAVE',
        tags: ['leave', 'policy', 'acknowledgement'],
        status: 'APPROVED',
        sourceType: 'POLICY',
      },
      {
        tenantId: tenant.id,
        title: 'IT asset return checklist',
        summary: 'Steps for returning laptops, monitors, and mobile devices during exit.',
        body: 'Raise an exit checklist, update asset condition, and hand back assigned equipment before final settlement.',
        category: 'ASSETS',
        tags: ['assets', 'exit', 'laptop'],
        status: 'PUBLISHED',
        sourceType: 'ARTICLE',
      },
    ],
  });

  // Assets
  const ASSET_DEFS = [
    ...Array.from({ length: 8 }, (_, i) => ({ name: `MacBook Pro 14 #${i + 1}`, category: 'LAPTOP' })),
    ...Array.from({ length: 4 }, (_, i) => ({ name: `Dell U2723QE Monitor #${i + 1}`, category: 'MONITOR' })),
    ...Array.from({ length: 3 }, (_, i) => ({ name: `iPhone 15 #${i + 1}`, category: 'PHONE' })),
  ];
  for (let i = 0; i < ASSET_DEFS.length; i++) {
    const assigned = i < 10;
    const asset = await prisma.asset.create({
      data: {
        tenantId: tenant.id,
        name: ASSET_DEFS[i]!.name,
        category: ASSET_DEFS[i]!.category,
        serialNumber: `SN-${2024000 + i * 17}`,
        purchaseCost: ASSET_DEFS[i]!.category === 'LAPTOP' ? 210000 : ASSET_DEFS[i]!.category === 'MONITOR' ? 45000 : 80000,
        condition: 'GOOD',
        status: assigned ? 'ASSIGNED' : 'AVAILABLE',
      },
    });
    if (assigned) {
      await prisma.assetAssignment.create({
        data: { assetId: asset.id, employeeId: employees[i]!.id, assignedAt: new Date(today0.getTime() - (i + 10) * dayMs) },
      });
      if (i < 3) {
        await prisma.assetDocument.createMany({
          data: [
            {
              tenantId: tenant.id,
              assetId: asset.id,
              fileKey: `assets/${asset.id}/invoice.pdf`,
              fileName: `${asset.name} invoice.pdf`,
              mimeType: 'application/pdf',
            },
            {
              tenantId: tenant.id,
              assetId: asset.id,
              fileKey: `assets/${asset.id}/handover.pdf`,
              fileName: `${asset.name} handover.pdf`,
              mimeType: 'application/pdf',
            },
          ],
        });
      }
    }
  }

  // Projects + timesheets
  const clients = await Promise.all([
    prisma.client.create({
      data: { tenantId: tenant.id, name: 'Acme Corp', code: 'ACME', industry: 'Retail', billingContact: 'finance@acme.example' },
    }),
    prisma.client.create({
      data: { tenantId: tenant.id, name: 'Northwind Labs', code: 'NWL', industry: 'Technology', billingContact: 'ops@northwind.example' },
    }),
    prisma.client.create({
      data: { tenantId: tenant.id, name: 'Internal PeopleHub', code: 'PHUB', industry: 'SaaS' },
    }),
  ]);
  const projects = await Promise.all([
    prisma.project.create({ data: { tenantId: tenant.id, clientId: clients[2]!.id, name: 'PeopleHub Platform', code: 'PHUB', status: 'ACTIVE', budgetHours: 900, billingRate: 0 } }),
    prisma.project.create({ data: { tenantId: tenant.id, clientId: clients[0]!.id, name: 'Client Implementation — Acme', code: 'ACME', clientName: 'Acme Corp', status: 'ACTIVE', budgetHours: 420, billingRate: 3200 } }),
    prisma.project.create({ data: { tenantId: tenant.id, clientId: clients[1]!.id, name: 'Internal Tooling', code: 'INT', status: 'ACTIVE', budgetHours: 240, billingRate: 0 } }),
  ]);
  await prisma.projectTask.createMany({
    data: [
      { tenantId: tenant.id, projectId: projects[0]!.id, name: 'Platform architecture', code: 'PH-ARCH', isBillable: false, sortOrder: 1 },
      { tenantId: tenant.id, projectId: projects[0]!.id, name: 'Product engineering', code: 'PH-ENG', isBillable: false, sortOrder: 2 },
      { tenantId: tenant.id, projectId: projects[1]!.id, name: 'Implementation workshop', code: 'ACME-WKS', isBillable: true, rateOverride: 3200, sortOrder: 1 },
      { tenantId: tenant.id, projectId: projects[1]!.id, name: 'Deployment support', code: 'ACME-DEP', isBillable: true, rateOverride: 3200, sortOrder: 2 },
      { tenantId: tenant.id, projectId: projects[2]!.id, name: 'Internal automation', code: 'INT-AUTO', isBillable: false, sortOrder: 1 },
      { tenantId: tenant.id, projectId: projects[2]!.id, name: 'Ops improvements', code: 'INT-OPS', isBillable: false, sortOrder: 2 },
    ],
  });
  const monday = new Date(today0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) - 7); // last week's Monday
  monday.setHours(0, 0, 0, 0);
  for (let i = 0; i < 5; i++) {
    const project = projects[i % 3]!;
    const tasksForProject = await prisma.projectTask.findMany({ where: { tenantId: tenant.id, projectId: project.id }, orderBy: { sortOrder: 'asc' } });
    const entries = [0, 1, 2, 3, 4].map((d) => ({
      date: new Date(monday.getTime() + d * dayMs).toISOString().slice(0, 10),
      hours: 7 + (d % 2),
      task: tasksForProject[d % tasksForProject.length]?.name ?? 'Feature development',
      taskId: tasksForProject[d % tasksForProject.length]?.id,
      billable: project.billingRate ? d !== 4 : false,
    }));
    await prisma.timesheet.create({
      data: {
        tenantId: tenant.id,
        employeeId: employees[i + 8]!.id,
        projectId: project.id,
        weekStart: monday,
        entries,
        totalHours: entries.reduce((s, e) => s + e.hours, 0),
        billableHours: entries.filter((e) => e.billable).reduce((s, e) => s + e.hours, 0),
        status: i < 3 ? 'APPROVED' : 'SUBMITTED',
        submittedAt: new Date(monday.getTime() + 5 * dayMs),
      },
    });
  }

  // Expenses, loan, approvals, notifications
  await prisma.expenseClaim.createMany({
    data: [
      { tenantId: tenant.id, employeeId: employees[10]!.id, category: 'TRAVEL', amount: 4850, description: 'Client visit — Mumbai', status: 'SUBMITTED' },
      { tenantId: tenant.id, employeeId: employees[12]!.id, category: 'MEALS', amount: 1200, description: 'Team lunch', status: 'APPROVED' },
      { tenantId: tenant.id, employeeId: employees[15]!.id, category: 'INTERNET', amount: 999, description: 'Home broadband — June', status: 'PAID' },
    ],
  });
  await prisma.loan.create({
    data: {
      tenantId: tenant.id,
      employeeId: employees[14]!.id,
      type: 'LOAN',
      amount: 120000,
      outstanding: 90000,
      emiAmount: 10000,
      emiStartMonth: today0.getMonth(),
      emiStartYear: today0.getFullYear(),
      totalInstallments: 12,
      paidInstallments: 3,
    },
  });
  for (let i = 0; i < 5; i++) {
    await prisma.approvalRequest.create({
      data: {
        tenantId: tenant.id,
        requesterId: employees[(i * 5 + 9) % employees.length]!.id,
        approverId: employees[i % 8]!.id,
        module: i % 2 === 0 ? 'leave' : 'expenses',
        objectType: i % 2 === 0 ? 'LeaveRequest' : 'ExpenseClaim',
        objectId: `demo-${i}`,
        requestData: { note: 'Awaiting your approval' },
      },
    });
  }

  const expenseWorkflow = await prisma.workflow.create({
    data: {
      tenantId: tenant.id,
      name: 'Expense Claim Approval',
      module: 'expenses',
      trigger: 'expense.submitted',
      conditions: { amountThreshold: 2500 },
      steps: {
        trigger: 'expense.submitted',
        finalAction: 'notify_requester',
        rejectionBehavior: 'return_to_draft',
        notifications: ['requester', 'manager'],
        autoApproveRules: [],
      },
    },
  });
  await prisma.workflowStep.createMany({
    data: [
      { workflowId: expenseWorkflow.id, stepNumber: 1, approverType: 'REPORTING_MANAGER', slaHours: 24, autoApprove: false },
      { workflowId: expenseWorkflow.id, stepNumber: 2, approverType: 'HR_ADMIN', slaHours: 48, autoApprove: false },
    ],
  });

  const leaveWorkflow = await prisma.workflow.create({
    data: {
      tenantId: tenant.id,
      name: 'Leave Request Approval',
      module: 'leave',
      trigger: 'leave.requested',
      conditions: { leaveType: ['PL', 'SL', 'CL'] },
      steps: {
        trigger: 'leave.requested',
        finalAction: 'notify_requester',
        rejectionBehavior: 'return_to_draft',
        notifications: ['requester', 'manager'],
        autoApproveRules: ['1-day casual leave auto-approved by reporting manager'],
      },
    },
  });
  await prisma.workflowStep.createMany({
    data: [
      { workflowId: leaveWorkflow.id, stepNumber: 1, approverType: 'REPORTING_MANAGER', slaHours: 12, autoApprove: false },
      { workflowId: leaveWorkflow.id, stepNumber: 2, approverType: 'HR_ADMIN', slaHours: 24, autoApprove: false },
    ],
  });

  const workflowRequests = [
    {
      workflowId: expenseWorkflow.id,
      requesterId: employees[9]!.id,
      approverId: employees[0]!.id,
      module: 'expenses',
      objectType: 'ExpenseClaim',
      objectId: 'expense-demo-1',
      currentStep: 1,
      status: 'PENDING' as const,
      requestData: { title: 'Conference travel', amount: 8200, reason: 'Client workshop in Bengaluru' },
    },
    {
      workflowId: leaveWorkflow.id,
      requesterId: employees[13]!.id,
      approverId: employees[1]!.id,
      module: 'leave',
      objectType: 'LeaveRequest',
      objectId: 'leave-demo-1',
      currentStep: 1,
      status: 'ESCALATED' as const,
      requestData: { title: 'Planned leave', fromDate: '2026-07-15', toDate: '2026-07-16', reason: 'Family function' },
    },
  ];
  for (const request of workflowRequests) {
    const created = await prisma.approvalRequest.create({
      data: {
        tenantId: tenant.id,
        workflowId: request.workflowId,
        requesterId: request.requesterId,
        approverId: request.approverId,
        module: request.module,
        objectType: request.objectType,
        objectId: request.objectId,
        currentStep: request.currentStep,
        status: request.status,
        requestData: request.requestData,
        dueAt: new Date(Date.now() - 2 * 3600 * 1000),
        comments: [{ by: 'System', decision: 'APPROVED', comment: 'Seeded workflow request', at: new Date().toISOString() }],
      },
    });
    await prisma.approvalRequestHistory.create({
      data: {
        tenantId: tenant.id,
        approvalRequestId: created.id,
        stepNumber: 1,
        action: 'CREATED',
        actorName: 'Seed',
        status: request.status,
        metadata: { workflowId: request.workflowId },
      },
    });
  }

  const NOTIFS = [
    { type: 'LEAVE', title: 'Leave request pending', body: '6 leave requests need your approval' },
    { type: 'PAYROLL', title: 'Payroll run ready', body: 'June payroll run is ready for review' },
    { type: 'HIRING', title: 'Interview today', body: 'Technical round with Vivaan Chandra at 3:00 PM' },
    { type: 'SYSTEM', title: 'Welcome to PeopleHub OS', body: 'Explore the dashboard to get started' },
    { type: 'ENGAGEMENT', title: 'Pulse survey live', body: 'Q3 pulse survey closes this Friday' },
    { type: 'HELPDESK', title: 'Ticket escalated', body: 'VPN access ticket marked URGENT' },
  ];
  for (let i = 0; i < 12; i++) {
    const n = NOTIFS[i % NOTIFS.length]!;
    await prisma.notification.create({
      data: { tenantId: tenant.id, userId: adminUser.id, type: n.type, title: n.title, body: n.body, isRead: i > 5 },
    });
  }

  console.log(`   ${employees.length} employees, ${attendanceRows.length} attendance records, 25 leave requests`);
  console.log('   6 payroll runs (5 published + current), payslips, 14 candidates, tickets, assets');
  console.log('   Password for all demo users: Demo@123');

  console.log('✅ Seed complete!');
  console.log('\n📋 Demo Credentials:');
  console.log('   Super Admin: admin@democorp.com');
  console.log('   HR Admin:    hr@democorp.com');
  console.log('   Payroll:     payroll@democorp.com');
  console.log('   Employee:    employee@democorp.com (self-service portal at /me)');
  console.log('\n🏢 Tenant slug: demo-corp');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
