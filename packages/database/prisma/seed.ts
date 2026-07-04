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

  // Roles
  await Promise.all([
    prisma.role.create({ data: { tenantId: tenant.id, name: 'Super Admin', isSystem: true } }),
    prisma.role.create({ data: { tenantId: tenant.id, name: 'HR Admin', isSystem: true } }),
    prisma.role.create({ data: { tenantId: tenant.id, name: 'Payroll Admin', isSystem: true } }),
    prisma.role.create({ data: { tenantId: tenant.id, name: 'Manager', isSystem: true } }),
    prisma.role.create({ data: { tenantId: tenant.id, name: 'Employee', isSystem: true } }),
    prisma.role.create({ data: { tenantId: tenant.id, name: 'Recruiter', isSystem: true } }),
  ]);

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
    prisma.leaveType.create({ data: { tenantId: tenant.id, name: 'Casual Leave', code: 'CL', isPaid: true, isCarryForward: false } }),
    prisma.leaveType.create({ data: { tenantId: tenant.id, name: 'Sick Leave', code: 'SL', isPaid: true, isCarryForward: false } }),
    prisma.leaveType.create({ data: { tenantId: tenant.id, name: 'Earned Leave', code: 'EL', isPaid: true, isCarryForward: true, maxCarryForwardDays: 30, isEncashable: true } }),
    prisma.leaveType.create({ data: { tenantId: tenant.id, name: 'Maternity Leave', code: 'ML', isPaid: true, isCarryForward: false, genderRestriction: 'FEMALE' } }),
    prisma.leaveType.create({ data: { tenantId: tenant.id, name: 'Leave Without Pay', code: 'LWP', isPaid: false, isCarryForward: false } }),
  ]);

  // Holiday calendar
  const holidayCalendar = await prisma.holidayCalendar.create({
    data: {
      tenantId: tenant.id,
      name: 'India 2025 Holidays',
      year: 2025,
      isDefault: true,
      holidays: {
        create: [
          { name: 'Republic Day', date: new Date('2025-01-26') },
          { name: 'Holi', date: new Date('2025-03-14') },
          { name: 'Good Friday', date: new Date('2025-04-18') },
          { name: 'Independence Day', date: new Date('2025-08-15') },
          { name: 'Gandhi Jayanti', date: new Date('2025-10-02') },
          { name: 'Diwali', date: new Date('2025-10-20') },
          { name: 'Christmas', date: new Date('2025-12-25') },
        ],
      },
    },
  });

  // Default shift
  await prisma.shift.create({
    data: {
      tenantId: tenant.id,
      name: 'Standard Shift',
      type: 'FIXED',
      startTime: '09:00',
      endTime: '18:00',
      gracePeriodMins: 15,
      weeklyOffDays: [0, 6],
    },
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
        status: 'ACTIVE',
        jobDescription: 'Build and scale our HRMS platform.',
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
        status: 'ACTIVE',
        jobDescription: 'Own the product roadmap for HR modules.',
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
        status: 'ACTIVE',
        jobDescription: 'Design beautiful employee experiences.',
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
        { id: '1', text: 'How satisfied are you with your work-life balance?', type: 'RATING', scale: 5 },
        { id: '2', text: 'Do you feel valued by your manager?', type: 'RATING', scale: 5 },
        { id: '3', text: 'How likely are you to recommend working here to a friend?', type: 'NPS' },
        { id: '4', text: 'Any feedback or suggestions?', type: 'TEXT' },
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
      { userId: hrUser.id, roleId: roleId('HR Admin') },
      { userId: hrUser.id, roleId: roleId('Manager') },
      { userId: payrollUser.id, roleId: roleId('Payroll Admin') },
      { userId: employeeUser.id, roleId: roleId('Employee') },
    ],
    skipDuplicates: true,
  });

  await prisma.jobRequisition.updateMany({
    where: { tenantId: tenant.id, status: 'ACTIVE' },
    data: { status: 'OPEN' },
  });

  const shift = (await prisma.shift.findFirst({ where: { tenantId: tenant.id } }))!;

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

  for (let i = 0; i < 35; i++) {
    const deptIdx = i % 8;
    const isHead = i < 8;
    const joinDaysAgo = i < 3 ? 20 + i * 15 : Math.floor(rnd() * 1400) + 90;
    const joiningDate = new Date(today0.getTime() - joinDaysAgo * dayMs);
    const emp = await prisma.employee.create({
      data: {
        tenantId: tenant.id,
        employeeCode: `EMP-${String(i + 1).padStart(4, '0')}`,
        firstName: FIRST[i]!,
        lastName: LAST[i]!,
        workEmail: `${FIRST[i]!.toLowerCase()}.${LAST[i]!.toLowerCase()}@democorp.com`,
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
      const roll = rnd();
      let status = 'PRESENT';
      if (roll > 0.96) status = 'ABSENT';
      else if (roll > 0.9) status = 'ON_LEAVE';
      else if (roll > 0.82) status = 'LATE';
      const inMin = status === 'LATE' ? 40 + Math.floor(rnd() * 60) : Math.floor(rnd() * 30) - 15;
      const punchIn = new Date(day.getTime() + (9 * 60 + inMin) * 60000);
      const workMins = 8 * 60 + Math.floor(rnd() * 90);
      attendanceRows.push({
        tenantId: tenant.id,
        employeeId: emp.id,
        date: day,
        status,
        punchIn: status === 'ABSENT' || status === 'ON_LEAVE' ? null : punchIn,
        punchOut:
          status === 'ABSENT' || status === 'ON_LEAVE'
            ? null
            : new Date(punchIn.getTime() + workMins * 60000),
        workingMinutes: status === 'ABSENT' || status === 'ON_LEAVE' ? null : workMins,
        punchSource: 'WEB',
      });
    }
  }
  await prisma.attendanceRecord.createMany({ data: attendanceRows as never, skipDuplicates: true });

  // Leave balances + requests
  const year = today0.getFullYear();
  const allocation: Record<string, number> = { CL: 12, SL: 12, EL: 15, ML: 26, LWP: 0 };
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
  for (let i = 0; i < 14; i++) {
    const cand = await prisma.candidate.create({
      data: {
        tenantId: tenant.id,
        jobRequisitionId: jobs[i % jobs.length]!.id,
        firstName: CAND_FIRST[i]!,
        lastName: CAND_LAST[i]!,
        email: `${CAND_FIRST[i]!.toLowerCase()}.${CAND_LAST[i]!.toLowerCase()}@example.com`,
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
        ...(upcoming ? {} : { rating: 3 + (i % 3), result: i % 3 === 2 ? 'ON_HOLD' : 'PASS', feedback: 'Strong fundamentals, good communication.' }),
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

  // Engagement: survey responses + recognitions
  const survey = await prisma.survey.findFirst({ where: { tenantId: tenant.id } });
  if (survey) {
    for (let i = 0; i < 12; i++) {
      await prisma.surveyResponse.create({
        data: {
          surveyId: survey.id,
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
      },
    });
  }

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
    }
  }

  // Projects + timesheets
  const projects = await Promise.all([
    prisma.project.create({ data: { tenantId: tenant.id, name: 'PeopleHub Platform', code: 'PHUB', status: 'ACTIVE' } }),
    prisma.project.create({ data: { tenantId: tenant.id, name: 'Client Implementation — Acme', code: 'ACME', clientName: 'Acme Corp', status: 'ACTIVE' } }),
    prisma.project.create({ data: { tenantId: tenant.id, name: 'Internal Tooling', code: 'INT', status: 'ACTIVE' } }),
  ]);
  const monday = new Date(today0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) - 7); // last week's Monday
  monday.setHours(0, 0, 0, 0);
  for (let i = 0; i < 5; i++) {
    const entries = [0, 1, 2, 3, 4].map((d) => ({
      date: new Date(monday.getTime() + d * dayMs).toISOString().slice(0, 10),
      hours: 7 + (d % 2),
      task: 'Feature development',
      billable: true,
    }));
    await prisma.timesheet.create({
      data: {
        tenantId: tenant.id,
        employeeId: employees[i + 8]!.id,
        projectId: projects[i % 3]!.id,
        weekStart: monday,
        entries,
        totalHours: entries.reduce((s, e) => s + e.hours, 0),
        billableHours: entries.reduce((s, e) => s + e.hours, 0),
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

  console.log(`   35 employees, ${attendanceRows.length} attendance records, 25 leave requests`);
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
