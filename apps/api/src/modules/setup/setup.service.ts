import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EmploymentType, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { AuthUser } from '../../common/types/auth-user';
import { SetupEmployeeImportDto, SetupEmployeeImportRowDto, SetupSalaryImportDto, SetupSalaryImportRowDto } from './dto/setup-import.dto';

type Severity = 'critical' | 'warning';
type ReadinessStatus = 'ready' | 'warning' | 'blocked';
type ImportStatus = 'ready' | 'warning' | 'error';

type ReadinessIssue = {
  code: string;
  severity: Severity;
  message: string;
  count?: number;
};

type ReadinessSection = {
  key: string;
  label: string;
  status: ReadinessStatus;
  score: number;
  completed: number;
  total: number;
  issues: ReadinessIssue[];
};

type ImportIssue = {
  field: string;
  code: string;
  severity: Severity;
  message: string;
};

type ReferenceIndex = Map<string, string>;
type EmployeeReferenceData = {
  departments: ReferenceIndex;
  designations: ReferenceIndex;
  locations: ReferenceIndex;
  legalEntities: ReferenceIndex;
  salaryStructures: ReferenceIndex;
  employees: Array<{ id: string; employeeCode: string; workEmail: string | null; firstName: string; lastName: string }>;
  employeeByCode: Map<string, { id: string; employeeCode: string; workEmail: string | null; firstName: string; lastName: string }>;
  employeeByEmail: Map<string, { id: string; employeeCode: string; workEmail: string | null; firstName: string; lastName: string }>;
  userByEmail: Map<string, { id: string; email: string }>;
};

const ACTIVE_EMPLOYEE_STATUSES = ['ACTIVE', 'ON_PROBATION', 'CONFIRMED', 'PREBOARDING', 'ON_NOTICE'] as const;
const EMPLOYEE_TEMPLATE_COLUMNS = [
  'employeeCode',
  'firstName',
  'lastName',
  'workEmail',
  'phone',
  'joiningDate',
  'department',
  'designation',
  'location',
  'legalEntity',
  'managerEmployeeCode',
  'employmentType',
  'pan',
  'aadhaar',
  'uan',
  'esicNumber',
  'bankAccountNumber',
  'bankIfsc',
  'salaryStructure',
  'ctc',
  'createUser',
];
const SALARY_TEMPLATE_COLUMNS = ['employeeCode', 'salaryStructure', 'ctc', 'effectiveFrom'];

@Injectable()
export class SetupService {
  constructor(private readonly prisma: PrismaService) {}

  async readiness(tenantId: string) {
    const [
      tenant,
      legalEntities,
      locations,
      departments,
      roles,
      employees,
      salaryStructures,
      employeeSalaries,
      leaveTypes,
      leavePolicies,
      shifts,
      attendanceCaptureSettings,
      payrollRuns,
      statutoryComponents,
    ] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: tenantId } }),
      this.prisma.legalEntity.findMany({ where: { tenantId } }),
      this.prisma.location.findMany({ where: { tenantId, isActive: true } }),
      this.prisma.department.findMany({ where: { tenantId, isActive: true } }),
      this.prisma.role.findMany({ where: { tenantId } }),
      this.prisma.employee.findMany({
        where: { tenantId, status: { in: [...ACTIVE_EMPLOYEE_STATUSES] } },
        select: {
          id: true,
          employeeCode: true,
          workEmail: true,
          firstName: true,
          lastName: true,
          legalEntityId: true,
          managerId: true,
          pan: true,
          uan: true,
          bankDetails: true,
        },
      }),
      this.prisma.salaryStructure.findMany({ where: { tenantId, isActive: true }, select: { id: true } }),
      this.prisma.employeeSalary.findMany({
        where: { employee: { tenantId, status: { in: [...ACTIVE_EMPLOYEE_STATUSES] } }, effectiveTo: null },
        select: { employeeId: true },
      }),
      this.prisma.leaveType.findMany({ where: { tenantId }, select: { id: true } }),
      this.prisma.leavePolicy.findMany({ where: { tenantId }, select: { id: true } }),
      this.prisma.shift.findMany({ where: { tenantId, isActive: true }, select: { id: true } }),
      this.prisma.attendanceCaptureSetting.findMany({ where: { tenantId, enabled: true }, select: { id: true } }),
      this.prisma.payrollRun.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 1 }),
      this.prisma.salaryComponent.findMany({
        where: { salaryStructure: { tenantId, isActive: true }, isStatutory: true },
        select: { statutoryType: true },
      }),
    ]);

    if (!tenant) throw new NotFoundException('Tenant not found');

    const salariedEmployeeIds = new Set(employeeSalaries.map((salary) => salary.employeeId));
    const missingSalary = employees.filter((employee) => !salariedEmployeeIds.has(employee.id));
    const missingLegalEntity = employees.filter((employee) => !employee.legalEntityId);
    const missingPan = employees.filter((employee) => !employee.pan);
    const missingUan = employees.filter((employee) => !employee.uan);
    const missingBank = employees.filter((employee) => !this.hasBankAccount(employee.bankDetails));
    const duplicateEmailCount = this.duplicateCount(employees.map((employee) => employee.workEmail).filter(Boolean) as string[]);
    const duplicateCodeCount = this.duplicateCount(employees.map((employee) => employee.employeeCode));
    const statutoryTypes = new Set(statutoryComponents.map((component) => component.statutoryType).filter(Boolean));

    const sections: ReadinessSection[] = [
      this.section('company', 'Company setup', [
        { ok: Boolean(tenant.name), message: 'Company profile is configured' },
        { ok: legalEntities.length > 0, message: 'Add at least one legal entity', code: 'missing_legal_entities' },
        { ok: locations.length > 0, message: 'Add at least one active location', code: 'missing_locations' },
        { ok: departments.length > 0, message: 'Add at least one active department', code: 'missing_departments', severity: 'warning' },
        { ok: roles.length > 0, message: 'Configure workspace roles', code: 'missing_roles' },
      ]),
      this.section('hr', 'HR readiness', [
        { ok: employees.length > 0, message: 'Import active employees', code: 'missing_employees' },
        { ok: duplicateCodeCount === 0, message: 'Resolve duplicate employee codes', code: 'duplicate_employee_codes' },
        { ok: duplicateEmailCount === 0, message: 'Resolve duplicate work emails', code: 'duplicate_work_emails' },
        { ok: missingLegalEntity.length === 0, message: 'Map employees to legal entities', code: 'employees_missing_legal_entity', count: missingLegalEntity.length },
      ]),
      this.section('payroll', 'Payroll readiness', [
        { ok: salaryStructures.length > 0, message: 'Create at least one salary structure', code: 'missing_salary_structures' },
        { ok: missingSalary.length === 0, message: 'Assign salary to active employees', code: 'employees_missing_salary', count: missingSalary.length },
        { ok: missingBank.length === 0, message: 'Add bank details for active employees', code: 'employees_missing_bank', count: missingBank.length },
        { ok: statutoryTypes.has('PF'), message: 'Configure PF statutory component', code: 'missing_pf_component', severity: 'warning' },
        { ok: statutoryTypes.has('TDS'), message: 'Configure TDS statutory component', code: 'missing_tds_component', severity: 'warning' },
      ]),
      this.section('attendance', 'Attendance readiness', [
        { ok: locations.length > 0, message: 'Locations exist for attendance policy' },
        { ok: shifts.length > 0, message: 'Create at least one active shift', code: 'missing_shifts' },
        { ok: attendanceCaptureSettings.length > 0, message: 'Enable at least one attendance capture mode', code: 'missing_attendance_capture' },
      ]),
      this.section('leave', 'Leave readiness', [
        { ok: leaveTypes.length > 0, message: 'Create leave types', code: 'missing_leave_types' },
        { ok: leavePolicies.length > 0, message: 'Create leave policies', code: 'missing_leave_policies' },
      ]),
      this.section('compliance', 'Compliance readiness', [
        { ok: legalEntities.some((entity) => entity.pan || entity.tan), message: 'Add legal entity tax identifiers', code: 'missing_entity_tax_ids' },
        { ok: missingPan.length === 0, message: 'Add PAN for active employees', code: 'employees_missing_pan', count: missingPan.length, severity: 'warning' },
        { ok: missingUan.length === 0, message: 'Add UAN for active employees', code: 'employees_missing_uan', count: missingUan.length, severity: 'warning' },
        { ok: payrollRuns.length > 0, message: 'Create the first payroll dry run', code: 'missing_payroll_dry_run', severity: 'warning' },
      ]),
    ];

    const criticalIssues = sections.flatMap((section) => section.issues).filter((issue) => issue.severity === 'critical');
    const warningIssues = sections.flatMap((section) => section.issues).filter((issue) => issue.severity === 'warning');
    const completed = sections.reduce((sum, section) => sum + section.completed, 0);
    const total = sections.reduce((sum, section) => sum + section.total, 0);

    return {
      status: criticalIssues.length ? 'blocked' : warningIssues.length ? 'warning' : 'ready',
      score: total ? Math.round((completed / total) * 100) : 0,
      totals: {
        legalEntities: legalEntities.length,
        locations: locations.length,
        departments: departments.length,
        employees: employees.length,
        salaryStructures: salaryStructures.length,
        leaveTypes: leaveTypes.length,
        leavePolicies: leavePolicies.length,
        shifts: shifts.length,
        payrollRuns: payrollRuns.length,
        criticalIssues: criticalIssues.length,
        warnings: warningIssues.length,
      },
      sections,
      payrollBlockers: criticalIssues.map((issue) => issue.message),
      updatedAt: new Date().toISOString(),
    };
  }

  async template(type: string, tenantId?: string) {
    const normalized = type.toLowerCase();
    const [tenant, legalEntity, location, department] = tenantId
      ? await Promise.all([
          this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, slug: true } }),
          this.prisma.legalEntity.findFirst({ where: { tenantId }, orderBy: { createdAt: 'asc' } }),
          this.prisma.location.findFirst({ where: { tenantId }, orderBy: { createdAt: 'asc' } }),
          this.prisma.department.findFirst({ where: { tenantId }, orderBy: { createdAt: 'asc' } }),
        ])
      : [null, null, null, null];
    const emailDomain = tenant?.slug ? `${tenant.slug}.example.com` : 'example.com';

    if (['employees', 'employee'].includes(normalized)) {
      return {
        type: 'employees',
        filename: 'peoplehub-employee-import-template.csv',
        columns: EMPLOYEE_TEMPLATE_COLUMNS,
        sampleRows: [
          {
            employeeCode: 'PH-1001',
            firstName: 'Aarav',
            lastName: 'Sharma',
            workEmail: `aarav.sharma@${emailDomain}`,
            phone: '+919876543210',
            joiningDate: '2026-07-01',
            department: department?.name ?? 'Engineering',
            designation: 'Software Engineer',
            location: location?.name ?? 'Primary Office',
            legalEntity: legalEntity?.name ?? tenant?.name ?? 'Primary Legal Entity',
            managerEmployeeCode: 'PH-1000',
            employmentType: 'FULL_TIME',
            pan: 'ABCDE1234F',
            aadhaar: '',
            uan: '100200300400',
            esicNumber: '',
            bankAccountNumber: '123456789012',
            bankIfsc: 'HDFC0001234',
            salaryStructure: 'India Standard CTC',
            ctc: 1200000,
            createUser: true,
          },
        ],
      };
    }
    if (['salary', 'salaries'].includes(normalized)) {
      return {
        type: 'salary',
        filename: 'peoplehub-salary-import-template.csv',
        columns: SALARY_TEMPLATE_COLUMNS,
        sampleRows: [
          {
            employeeCode: 'PH-1001',
            salaryStructure: 'India Standard CTC',
            ctc: 1200000,
            effectiveFrom: '2026-07-01',
          },
        ],
      };
    }
    throw new NotFoundException(`Unknown setup template type: ${type}`);
  }

  async previewEmployees(tenantId: string, dto: SetupEmployeeImportDto) {
    const refs = await this.referenceData(tenantId);
    const rows = dto.rows ?? [];
    const seenCodes = new Set<string>();
    const seenEmails = new Set<string>();
    const fileCodes = new Set(rows.map((row) => this.key(row.employeeCode)).filter(Boolean));
    const normalizedRows = rows.map((row, index) => {
      const issues = this.validateEmployeeRow(row, index, refs, seenCodes, seenEmails, fileCodes);
      return {
        rowNumber: index + 1,
        status: this.importStatus(issues),
        normalized: this.toEmployeePreview(row, refs),
        issues,
      };
    });
    return this.previewSummary(normalizedRows);
  }

  async commitEmployees(user: AuthUser, dto: SetupEmployeeImportDto) {
    const preview = await this.previewEmployees(user.tenantId, dto);
    if (preview.summary.errors > 0) {
      throw new BadRequestException({ message: 'Employee import has critical validation errors', preview });
    }

    const refs = await this.referenceData(user.tenantId);
    const created = await this.prisma.$transaction(async (tx) => {
      const codeToEmployeeId = new Map(refs.employees.map((employee) => [this.key(employee.employeeCode), employee.id]));
      const imported: Array<{ id: string; employeeCode: string; name: string }> = [];

      for (const row of dto.rows) {
        const employeeCode = row.employeeCode?.trim() || (await this.nextEmployeeCode(tx, user.tenantId, codeToEmployeeId.size + imported.length + 1));
        let createdUserId: string | undefined;
        if (row.createUser && row.workEmail) {
          const createdUser = await tx.user.create({
            data: {
              tenantId: user.tenantId,
              email: row.workEmail.trim().toLowerCase(),
              name: `${row.firstName.trim()} ${row.lastName.trim()}`,
              isActive: true,
            },
          });
          createdUserId = createdUser.id;
        }
        const employee = await tx.employee.create({
          data: {
            tenantId: user.tenantId,
            userId: createdUserId,
            employeeCode,
            firstName: row.firstName.trim(),
            lastName: row.lastName.trim(),
            workEmail: this.trimLower(row.workEmail),
            phone: this.trim(row.phone),
            joiningDate: row.joiningDate ? new Date(row.joiningDate) : undefined,
            departmentId: this.lookup(refs.departments, row.department),
            designationId: this.lookup(refs.designations, row.designation),
            locationId: this.lookup(refs.locations, row.location),
            legalEntityId: this.lookup(refs.legalEntities, row.legalEntity),
            employmentType: this.parseEmploymentType(row.employmentType),
            pan: this.trimUpper(row.pan),
            aadhaar: this.trim(row.aadhaar),
            uan: this.trim(row.uan),
            esicNumber: this.trim(row.esicNumber),
            bankDetails: this.bankDetails(row),
            status: 'ACTIVE',
          },
        });
        codeToEmployeeId.set(this.key(employeeCode), employee.id);
        imported.push({ id: employee.id, employeeCode, name: `${employee.firstName} ${employee.lastName}` });

        if (row.salaryStructure && row.ctc) {
          const salaryStructureId = this.lookup(refs.salaryStructures, row.salaryStructure);
          if (salaryStructureId) {
            await tx.employeeSalary.create({
              data: {
                employeeId: employee.id,
                salaryStructureId,
                ctc: Number(row.ctc),
                effectiveFrom: row.joiningDate ? new Date(row.joiningDate) : new Date(),
                components: [],
              },
            });
          }
        }
      }

      for (const row of dto.rows) {
        if (!row.managerEmployeeCode || !row.employeeCode) continue;
        const employeeId = codeToEmployeeId.get(this.key(row.employeeCode));
        const managerId = codeToEmployeeId.get(this.key(row.managerEmployeeCode));
        if (employeeId && managerId && employeeId !== managerId) {
          await tx.employee.update({ where: { id: employeeId }, data: { managerId } });
        }
      }

      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          actorId: user.userId,
          action: 'setup.employee_import_committed',
          objectType: 'Employee',
          objectId: 'bulk',
          newValue: { imported: imported.length } as Prisma.InputJsonValue,
        },
      });

      return imported;
    });

    return { imported: created.length, employees: created };
  }

  async previewSalary(tenantId: string, dto: SetupSalaryImportDto) {
    const refs = await this.referenceData(tenantId);
    const seenCodes = new Set<string>();
    const rows = (dto.rows ?? []).map((row, index) => {
      const issues = this.validateSalaryRow(row, refs, seenCodes);
      return {
        rowNumber: index + 1,
        status: this.importStatus(issues),
        normalized: {
          employeeCode: row.employeeCode,
          salaryStructure: row.salaryStructure,
          ctc: row.ctc,
          effectiveFrom: row.effectiveFrom,
        },
        issues,
      };
    });
    return this.previewSummary(rows);
  }

  async commitSalary(user: AuthUser, dto: SetupSalaryImportDto) {
    const preview = await this.previewSalary(user.tenantId, dto);
    if (preview.summary.errors > 0) {
      throw new BadRequestException({ message: 'Salary import has critical validation errors', preview });
    }
    const refs = await this.referenceData(user.tenantId);
    const result = await this.prisma.$transaction(async (tx) => {
      let assigned = 0;
      for (const row of dto.rows) {
        const employeeId = refs.employeeByCode.get(this.key(row.employeeCode))?.id;
        const salaryStructureId = this.lookup(refs.salaryStructures, row.salaryStructure);
        if (!employeeId || !salaryStructureId) continue;
        await tx.employeeSalary.updateMany({
          where: { employeeId, effectiveTo: null },
          data: { effectiveTo: new Date(row.effectiveFrom) },
        });
        await tx.employeeSalary.create({
          data: {
            employeeId,
            salaryStructureId,
            ctc: Number(row.ctc),
            effectiveFrom: new Date(row.effectiveFrom),
            components: [],
          },
        });
        assigned++;
      }
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          actorId: user.userId,
          action: 'setup.salary_import_committed',
          objectType: 'EmployeeSalary',
          objectId: 'bulk',
          newValue: { assigned } as Prisma.InputJsonValue,
        },
      });
      return assigned;
    });
    return { assigned: result };
  }

  private async referenceData(tenantId: string) {
    const [departments, designations, locations, legalEntities, salaryStructures, employees, users] = await Promise.all([
      this.prisma.department.findMany({ where: { tenantId, isActive: true }, select: { id: true, name: true, code: true } }),
      this.prisma.designation.findMany({ where: { tenantId, isActive: true }, select: { id: true, name: true, grade: true } }),
      this.prisma.location.findMany({ where: { tenantId, isActive: true }, select: { id: true, name: true } }),
      this.prisma.legalEntity.findMany({ where: { tenantId }, select: { id: true, name: true, legalName: true } }),
      this.prisma.salaryStructure.findMany({ where: { tenantId, isActive: true }, select: { id: true, name: true } }),
      this.prisma.employee.findMany({
        where: { tenantId },
        select: { id: true, employeeCode: true, workEmail: true, firstName: true, lastName: true },
      }),
      this.prisma.user.findMany({ where: { tenantId }, select: { id: true, email: true } }),
    ]);

    return {
      departments: this.indexReferences(departments, ['name', 'code']),
      designations: this.indexReferences(designations, ['name', 'grade']),
      locations: this.indexReferences(locations, ['name']),
      legalEntities: this.indexReferences(legalEntities, ['name', 'legalName']),
      salaryStructures: this.indexReferences(salaryStructures, ['name']),
      employees,
      employeeByCode: new Map(employees.map((employee) => [this.key(employee.employeeCode), employee])),
      employeeByEmail: new Map(employees.filter((employee) => employee.workEmail).map((employee) => [this.key(employee.workEmail), employee])),
      userByEmail: new Map(users.map((user) => [this.key(user.email), user])),
    };
  }

  private validateEmployeeRow(
    row: SetupEmployeeImportRowDto,
    index: number,
    refs: EmployeeReferenceData,
    seenCodes: Set<string>,
    seenEmails: Set<string>,
    fileCodes: Set<string>,
  ) {
    const issues: ImportIssue[] = [];
    if (!row.firstName?.trim()) this.issue(issues, 'firstName', 'required', 'First name is required');
    if (!row.lastName?.trim()) this.issue(issues, 'lastName', 'required', 'Last name is required');
    if (row.workEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.workEmail)) {
      this.issue(issues, 'workEmail', 'invalid_email', 'Work email is not valid');
    }
    if (row.createUser && row.workEmail && refs.userByEmail.has(this.key(row.workEmail))) {
      this.issue(issues, 'workEmail', 'user_email_exists', 'A login user already exists for this email');
    }
    this.checkDuplicate(issues, 'employeeCode', row.employeeCode, refs.employeeByCode, seenCodes, 'Employee code already exists or repeats in this file');
    this.checkDuplicate(issues, 'workEmail', row.workEmail, refs.employeeByEmail, seenEmails, 'Work email already exists or repeats in this file');
    this.checkReference(issues, 'department', row.department, refs.departments, 'Department does not exist');
    this.checkReference(issues, 'designation', row.designation, refs.designations, 'Designation does not exist');
    this.checkReference(issues, 'location', row.location, refs.locations, 'Location does not exist');
    this.checkReference(issues, 'legalEntity', row.legalEntity, refs.legalEntities, 'Legal entity does not exist');
    this.checkReference(issues, 'salaryStructure', row.salaryStructure, refs.salaryStructures, 'Salary structure does not exist');
    if (!row.legalEntity) this.issue(issues, 'legalEntity', 'missing_legal_entity', 'Payroll entity is required before payroll can run');
    if (!row.bankAccountNumber || !row.bankIfsc) this.issue(issues, 'bankDetails', 'missing_bank_details', 'Bank account number and IFSC are required');
    if (row.salaryStructure && (!row.ctc || Number(row.ctc) <= 0)) this.issue(issues, 'ctc', 'invalid_ctc', 'CTC must be greater than zero');
    if (row.managerEmployeeCode) {
      const managerInDb = refs.employeeByCode.has(this.key(row.managerEmployeeCode));
      const managerInFile = fileCodes.has(this.key(row.managerEmployeeCode));
      if (!managerInDb && !managerInFile) {
        this.issue(issues, 'managerEmployeeCode', 'manager_unverified', 'Manager code must exist in PeopleHub or in the same import file', 'warning');
      }
      if (row.employeeCode && this.key(row.managerEmployeeCode) === this.key(row.employeeCode)) {
        this.issue(issues, 'managerEmployeeCode', 'self_manager', 'Employee cannot be their own manager');
      }
    }
    if (!row.pan) this.issue(issues, 'pan', 'missing_pan', 'PAN is missing', 'warning');
    if (!row.uan) this.issue(issues, 'uan', 'missing_uan', 'UAN is missing', 'warning');
    if (row.employmentType && !(Object.values(EmploymentType) as string[]).includes(row.employmentType)) {
      this.issue(issues, 'employmentType', 'invalid_employment_type', `Employment type must be one of ${Object.values(EmploymentType).join(', ')}`);
    }
    if (row.joiningDate && Number.isNaN(new Date(row.joiningDate).getTime())) {
      this.issue(issues, 'joiningDate', 'invalid_date', 'Joining date must be a valid date');
    }
    if (!row.employeeCode && index > -1) {
      this.issue(issues, 'employeeCode', 'auto_generated', 'Employee code will be auto-generated', 'warning');
    }
    return issues;
  }

  private validateSalaryRow(row: SetupSalaryImportRowDto, refs: EmployeeReferenceData, seenCodes: Set<string>) {
    const issues: ImportIssue[] = [];
    if (!row.employeeCode) this.issue(issues, 'employeeCode', 'required', 'Employee code is required');
    if (!row.salaryStructure) this.issue(issues, 'salaryStructure', 'required', 'Salary structure is required');
    if (!row.ctc || Number(row.ctc) <= 0) this.issue(issues, 'ctc', 'invalid_ctc', 'CTC must be greater than zero');
    if (!row.effectiveFrom || Number.isNaN(new Date(row.effectiveFrom).getTime())) {
      this.issue(issues, 'effectiveFrom', 'invalid_date', 'Effective date must be valid');
    }
    if (row.employeeCode && !refs.employeeByCode.has(this.key(row.employeeCode))) {
      this.issue(issues, 'employeeCode', 'unknown_employee', 'Employee code does not exist');
    }
    if (row.employeeCode) {
      const key = this.key(row.employeeCode);
      if (seenCodes.has(key)) this.issue(issues, 'employeeCode', 'duplicate_in_file', 'Employee has more than one salary row in this file');
      seenCodes.add(key);
    }
    this.checkReference(issues, 'salaryStructure', row.salaryStructure, refs.salaryStructures, 'Salary structure does not exist');
    return issues;
  }

  private previewSummary<T extends { status: ImportStatus; issues: ImportIssue[] }>(rows: T[]) {
    const errors = rows.filter((row) => row.status === 'error').length;
    const warnings = rows.reduce((sum, row) => sum + row.issues.filter((issue) => issue.severity === 'warning').length, 0);
    return {
      summary: {
        totalRows: rows.length,
        validRows: rows.filter((row) => row.status !== 'error').length,
        errors,
        warnings,
        canCommit: errors === 0 && rows.length > 0,
      },
      rows,
    };
  }

  private section(
    key: string,
    label: string,
    checks: Array<{ ok: boolean; message: string; code?: string; severity?: Severity; count?: number }>,
  ): ReadinessSection {
    const issues = checks
      .filter((check) => !check.ok)
      .map((check) => ({
        code: check.code ?? `${key}_not_ready`,
        severity: check.severity ?? 'critical',
        message: check.count ? `${check.message} (${check.count})` : check.message,
        count: check.count,
      }));
    const completed = checks.length - issues.length;
    const critical = issues.some((issue) => issue.severity === 'critical');
    return {
      key,
      label,
      status: critical ? 'blocked' : issues.length ? 'warning' : 'ready',
      score: checks.length ? Math.round((completed / checks.length) * 100) : 0,
      completed,
      total: checks.length,
      issues,
    };
  }

  private toEmployeePreview(row: SetupEmployeeImportRowDto, refs: EmployeeReferenceData) {
    return {
      employeeCode: row.employeeCode || 'Auto-generated',
      name: `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim(),
      workEmail: row.workEmail ?? null,
      departmentId: this.lookup(refs.departments, row.department),
      designationId: this.lookup(refs.designations, row.designation),
      locationId: this.lookup(refs.locations, row.location),
      legalEntityId: this.lookup(refs.legalEntities, row.legalEntity),
      salaryStructureId: this.lookup(refs.salaryStructures, row.salaryStructure),
      managerEmployeeCode: row.managerEmployeeCode ?? null,
      ctc: row.ctc ?? null,
    };
  }

  private indexReferences<T extends { id: string }>(items: T[], fields: Array<keyof T>) {
    const map = new Map<string, string>();
    for (const item of items) {
      for (const field of fields) {
        const value = item[field];
        if (typeof value === 'string' && value) map.set(this.key(value), item.id);
      }
    }
    return map;
  }

  private checkReference(issues: ImportIssue[], field: string, value: string | undefined, references: Map<string, string>, message: string) {
    if (value && !references.has(this.key(value))) this.issue(issues, field, 'unknown_reference', message);
  }

  private checkDuplicate(
    issues: ImportIssue[],
    field: string,
    value: string | undefined,
    existing: Map<string, unknown>,
    seen: Set<string>,
    message: string,
  ) {
    if (!value) return;
    const key = this.key(value);
    if (existing.has(key) || seen.has(key)) this.issue(issues, field, 'duplicate', message);
    seen.add(key);
  }

  private issue(issues: ImportIssue[], field: string, code: string, message: string, severity: Severity = 'critical') {
    issues.push({ field, code, severity, message });
  }

  private importStatus(issues: ImportIssue[]): ImportStatus {
    if (issues.some((issue) => issue.severity === 'critical')) return 'error';
    if (issues.length) return 'warning';
    return 'ready';
  }

  private lookup(references: Map<string, string>, value: string | undefined) {
    return value ? references.get(this.key(value)) : undefined;
  }

  private key(value: string | undefined | null) {
    return String(value ?? '').trim().toLowerCase();
  }

  private trim(value: string | undefined) {
    return value?.trim() || undefined;
  }

  private trimLower(value: string | undefined) {
    return value?.trim().toLowerCase() || undefined;
  }

  private trimUpper(value: string | undefined) {
    return value?.trim().toUpperCase() || undefined;
  }

  private bankDetails(row: SetupEmployeeImportRowDto) {
    if (!row.bankAccountNumber && !row.bankIfsc) return undefined;
    return {
      accountNumber: row.bankAccountNumber?.trim(),
      ifsc: row.bankIfsc?.trim().toUpperCase(),
    };
  }

  private hasBankAccount(value: unknown) {
    if (!value || typeof value !== 'object') return false;
    const bank = value as Record<string, unknown>;
    return Boolean(bank.accountNumber || bank.account || bank.bankAccountNumber);
  }

  private parseEmploymentType(value: string | undefined) {
    return value && (Object.values(EmploymentType) as string[]).includes(value) ? (value as EmploymentType) : undefined;
  }

  private duplicateCount(values: string[]) {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const value of values) {
      const key = this.key(value);
      if (seen.has(key)) duplicates.add(key);
      seen.add(key);
    }
    return duplicates.size;
  }

  private async nextEmployeeCode(
    tx: Prisma.TransactionClient,
    tenantId: string,
    startAt: number,
  ): Promise<string> {
    for (let i = startAt; ; i++) {
      const code = `EMP-${String(i).padStart(4, '0')}`;
      const exists = await tx.employee.findFirst({ where: { tenantId, employeeCode: code }, select: { id: true } });
      if (!exists) return code;
    }
  }
}
