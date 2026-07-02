export type EmployeeStatus =
  | 'CANDIDATE'
  | 'PREBOARDING'
  | 'ACTIVE'
  | 'ON_PROBATION'
  | 'CONFIRMED'
  | 'ON_NOTICE'
  | 'EXITED'
  | 'ABSCONDING'
  | 'CONTRACTOR'
  | 'INTERN'
  | 'INACTIVE';

export type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACTOR' | 'INTERN' | 'CONSULTANT';
export type WorkMode = 'OFFICE' | 'REMOTE' | 'HYBRID';
export type Gender = 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY';

export interface EmployeeBasic {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  workEmail?: string;
  status: EmployeeStatus;
  departmentId?: string;
  designationId?: string;
  managerId?: string;
}

export interface EmployeeProfile extends EmployeeBasic {
  preferredName?: string;
  personalEmail?: string;
  phone?: string;
  gender?: Gender;
  joiningDate?: string;
  employmentType: EmploymentType;
  workMode: WorkMode;
  legalEntityId?: string;
  locationId?: string;
  costCenterId?: string;
  businessUnitId?: string;
}
