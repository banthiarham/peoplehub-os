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

export interface AttendanceMonthCounts {
  expectedWorkingDays: number;
  present: number;
  late: number;
  halfDay: number;
  absent: number;
  onLeave: number;
  holiday: number;
  weeklyOff: number;
  missingPunch: number;
  /** Null when the month has no attendable working days. */
  attendancePercentage: number | null;
  avgWorkHours: number;
  lateArrivals: number;
  earlyDepartures: number;
  totalWorkingMinutes: number;
  overtimeMinutes: number;
}

export interface LeaveBalanceRow {
  leaveTypeId: string;
  name: string;
  code: string;
  isPaid: boolean;
  opening: number;
  accrued: number;
  used: number;
  balance: number;
}

export interface LeaveHistoryRow {
  id: string;
  leaveTypeId: string;
  name: string;
  code: string;
  fromDate: string;
  toDate: string;
  days: number;
  status: string;
  reason?: string | null;
}

export interface EmployeeAttendanceSummary {
  month: string;
  employee: {
    id: string;
    status: EmployeeStatus;
    joiningDate: string | null;
    exitDate: string | null;
  };
  window: { start: string; end: string; clampedToToday: boolean };
  attendance: AttendanceMonthCounts;
  leave: {
    /** Attendance-calendar days in the window marked on leave. */
    calendarDaysOnLeave: number;
    /** Days charged to the leave policy, which can differ for half-day and month-straddling leave. */
    byType: Array<{ leaveTypeId: string; name: string; code: string; policyDays: number }>;
    balances: LeaveBalanceRow[];
  };
  recentLeaveHistory: LeaveHistoryRow[];
  dataQuality: {
    lateSource: string;
    halfDaySource: string;
    earlyDepartureSource: string;
    holidayCalendarScope: string;
    leaveDaysSource: string;
  };
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
