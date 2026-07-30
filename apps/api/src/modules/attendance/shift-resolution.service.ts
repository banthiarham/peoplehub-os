import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';

/**
 * The authoritative resolver for "which shift, and at which location, does this
 * employee work on this date".
 *
 * Every consumer (punch validation, geofencing, the monthly ledger, overtime,
 * late/early marks, shift allowance, roster screens and assignment counts) goes
 * through here so a single precedence is applied everywhere.
 *
 * ## Effective shift precedence
 * 1. The `ShiftAssignment` covering the date, picked by {@link ASSIGNMENT_PRECEDENCE}.
 * 2. The tenant's designated default shift (`isDefault`).
 * 3. The oldest active tenant shift.
 * 4. `null` — callers fall back to Sat/Sun weekly offs.
 *
 * ## Effective work location precedence
 * 1. The covering assignment's `locationId`, when it sets one. A date-effective
 *    assignment overrides the working location for that assignment only.
 * 2. The employee's own `locationId` — their default/base location, which
 *    assigning a roster never reads, writes, or clears.
 *
 * Assignments may legitimately overlap (an open-ended base assignment plus
 * single-day roster or swap overrides). Overlap is therefore resolved, not
 * forbidden: the assignment that starts latest wins for the day, ties broken by
 * the most recently created row. Resolution is deterministic for any
 * (employee, date) pair, and the roster screens surface overlaps rather than
 * hiding them.
 */
export const ASSIGNMENT_PRECEDENCE: Prisma.ShiftAssignmentOrderByWithRelationInput[] = [
  { effectiveFrom: 'desc' },
  { createdAt: 'desc' },
  { id: 'desc' },
];

/**
 * `effectiveTo` is the inclusive last day an assignment applies to; `null`
 * means open-ended.
 */
export function assignmentCoversDate(
  assignment: { effectiveFrom: Date; effectiveTo: Date | null },
  at: Date,
): boolean {
  return (
    assignment.effectiveFrom <= at && (assignment.effectiveTo === null || assignment.effectiveTo >= at)
  );
}

/** Sorts already-loaded assignments by {@link ASSIGNMENT_PRECEDENCE}. */
export function byAssignmentPrecedence(
  a: { effectiveFrom: Date; createdAt?: Date | null; id?: string },
  b: { effectiveFrom: Date; createdAt?: Date | null; id?: string },
): number {
  const byFrom = b.effectiveFrom.getTime() - a.effectiveFrom.getTime();
  if (byFrom !== 0) return byFrom;
  const byCreated = (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0);
  if (byCreated !== 0) return byCreated;
  return (b.id ?? '').localeCompare(a.id ?? '');
}

type ResolvedShift = {
  shift: Prisma.ShiftGetPayload<Record<string, never>> | null;
  /** Location the covering assignment pins this day to, or null for "employee default". */
  assignedLocationId: string | null;
  assignment: { id: string; source: string; effectiveFrom: Date; effectiveTo: Date | null } | null;
};

@Injectable()
export class ShiftResolutionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tenant-scoped window filter shared by every assignment read.
   *
   * `at` must be a **day anchor** — `dateOnly(...)` or `parseAttendanceDate(...)`,
   * i.e. the day at midnight — never a raw `new Date()`. `effectiveTo` is stored
   * at the midnight of its inclusive last day, so a timestamp compares greater
   * than it and the assignment drops out for the whole of its final day.
   *
   * The comparison is deliberately not normalized here: the stored anchors are
   * local calendar days at UTC midnight, and re-normalizing an anchor shifts it
   * back a day on negative UTC offsets. Callers own the conversion.
   */
  coveringWhere(tenantId: string, employeeId: string, at: Date): Prisma.ShiftAssignmentWhereInput {
    return {
      employeeId,
      employee: { tenantId },
      effectiveFrom: { lte: at },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: at } }],
    };
  }

  /** The tenant fallback used when no assignment covers the date. */
  async defaultShift(tenantId: string) {
    return (
      (await this.prisma.shift.findFirst({ where: { tenantId, isActive: true, isDefault: true } })) ??
      (await this.prisma.shift.findFirst({
        where: { tenantId, isActive: true },
        orderBy: { createdAt: 'asc' },
      }))
    );
  }

  /** Effective shift + assigned location for one employee on one date. */
  async resolveAt(tenantId: string, employeeId: string, at: Date): Promise<ResolvedShift> {
    const assignment = await this.prisma.shiftAssignment.findFirst({
      where: this.coveringWhere(tenantId, employeeId, at),
      include: { shift: true },
      orderBy: ASSIGNMENT_PRECEDENCE,
    });
    if (assignment) {
      return {
        shift: assignment.shift,
        assignedLocationId: assignment.locationId ?? null,
        assignment: {
          id: assignment.id,
          source: assignment.source,
          effectiveFrom: assignment.effectiveFrom,
          effectiveTo: assignment.effectiveTo,
        },
      };
    }
    return { shift: await this.defaultShift(tenantId), assignedLocationId: null, assignment: null };
  }

  async shiftAt(tenantId: string, employeeId: string, at: Date) {
    return (await this.resolveAt(tenantId, employeeId, at)).shift;
  }

  /**
   * The location that governs capture rules, geofencing and attendance-rule
   * resolution on `at`: the assignment override when one is set, otherwise the
   * employee's own base location.
   */
  async effectiveLocationId(tenantId: string, employeeId: string, at: Date): Promise<string | null> {
    const { assignedLocationId } = await this.resolveAt(tenantId, employeeId, at);
    return assignedLocationId ?? this.employeeLocationId(tenantId, employeeId);
  }

  /** The employee's default/base location. Never overwritten by an assignment. */
  async employeeLocationId(tenantId: string, employeeId: string): Promise<string | null> {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
      select: { locationId: true },
    });
    return employee?.locationId ?? null;
  }

  /**
   * Resolves every day in a range from one query, applying the same precedence
   * as {@link resolveAt} so a mid-range assignment change is honoured per date.
   */
  async resolverForRange(tenantId: string, employeeId: string, start: Date, end: Date) {
    const [assignments, fallback] = await Promise.all([
      this.prisma.shiftAssignment.findMany({
        where: {
          employeeId,
          employee: { tenantId },
          effectiveFrom: { lte: end },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: start } }],
        },
        include: { shift: true },
        orderBy: ASSIGNMENT_PRECEDENCE,
      }),
      this.defaultShift(tenantId),
    ]);
    const ordered = [...assignments].sort(byAssignmentPrecedence);
    return (at: Date): ResolvedShift => {
      const assignment = ordered.find((candidate) => assignmentCoversDate(candidate, at));
      if (!assignment) return { shift: fallback, assignedLocationId: null, assignment: null };
      return {
        shift: assignment.shift,
        assignedLocationId: assignment.locationId ?? null,
        assignment: {
          id: assignment.id,
          source: assignment.source,
          effectiveFrom: assignment.effectiveFrom,
          effectiveTo: assignment.effectiveTo,
        },
      };
    };
  }

  /**
   * Employees whose effective shift on `at` is each shift, resolved through the
   * same precedence as the punch path — including the unassigned employees the
   * tenant default shift actually covers. Lifetime assignment rows are not a
   * headcount.
   */
  async activeShiftCounts(tenantId: string, at: Date): Promise<Map<string, number>> {
    const [employees, assignments, fallback] = await Promise.all([
      this.prisma.employee.findMany({
        where: { tenantId, status: { notIn: ['EXITED', 'INACTIVE', 'CANDIDATE', 'PREBOARDING'] } },
        select: { id: true },
      }),
      this.prisma.shiftAssignment.findMany({
        where: {
          employee: { tenantId, status: { notIn: ['EXITED', 'INACTIVE', 'CANDIDATE', 'PREBOARDING'] } },
          effectiveFrom: { lte: at },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: at } }],
        },
        select: {
          id: true,
          employeeId: true,
          shiftId: true,
          effectiveFrom: true,
          effectiveTo: true,
          createdAt: true,
        },
      }),
      this.defaultShift(tenantId),
    ]);

    const winnerByEmployee = new Map<string, (typeof assignments)[number]>();
    for (const assignment of assignments) {
      const current = winnerByEmployee.get(assignment.employeeId);
      if (!current || byAssignmentPrecedence(assignment, current) < 0) {
        winnerByEmployee.set(assignment.employeeId, assignment);
      }
    }

    const counts = new Map<string, number>();
    const bump = (shiftId: string | null | undefined) => {
      if (!shiftId) return;
      counts.set(shiftId, (counts.get(shiftId) ?? 0) + 1);
    };
    for (const employee of employees) {
      bump(winnerByEmployee.get(employee.id)?.shiftId ?? fallback?.id);
    }
    return counts;
  }
}
