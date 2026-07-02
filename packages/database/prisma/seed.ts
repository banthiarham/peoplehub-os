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
      data: { tenantId: tenant.id, name: 'Delhi HQ', city: 'New Delhi', state: 'Delhi', country: 'IN', timezone: 'Asia/Kolkata' },
    }),
    prisma.location.create({
      data: { tenantId: tenant.id, name: 'Bangalore Office', city: 'Bangalore', state: 'Karnataka', country: 'IN', timezone: 'Asia/Kolkata' },
    }),
    prisma.location.create({
      data: { tenantId: tenant.id, name: 'Mumbai Office', city: 'Mumbai', state: 'Maharashtra', country: 'IN', timezone: 'Asia/Kolkata' },
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
    await prisma.emailTemplate.upsert({
      where: { tenantId_templateKey_language: { tenantId: null as unknown as string, templateKey: tpl.templateKey, language: 'en' } },
      update: {},
      create: {
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

  console.log('✅ Seed complete!');
  console.log('\n📋 Demo Credentials:');
  console.log('   Super Admin: admin@democorp.com');
  console.log('   HR Admin:    hr@democorp.com');
  console.log('   Payroll:     payroll@democorp.com');
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
