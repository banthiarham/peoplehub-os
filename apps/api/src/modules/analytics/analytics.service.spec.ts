import { AnalyticsService, MAX_REPORT_ROWS, PREVIEW_ROW_LIMIT } from './analytics.service';

describe('AnalyticsService', () => {
  it('builds employee report rows for the generic report builder', async () => {
    const prisma = {
      employee: {
        findMany: jest.fn().mockResolvedValue([
          {
            employeeCode: 'PH001',
            firstName: 'Asha',
            lastName: 'Shah',
            workEmail: 'asha@example.com',
            status: 'ACTIVE',
            department: { name: 'Engineering' },
            designation: { name: 'Engineer' },
            location: { name: 'Mumbai' },
            manager: { firstName: 'Ravi', lastName: 'Mehta' },
            joiningDate: new Date('2025-04-01'),
          },
        ]),
      },
    };
    const service = new AnalyticsService(prisma as any, {} as any);

    await expect(service.reportBuilder('tenant-1', 'employees', {})).resolves.toEqual([
      expect.objectContaining({
        employeeCode: 'PH001',
        department: 'Engineering',
        manager: 'Ravi Mehta',
      }),
    ]);
  });

  it('passes analytics filters through to scoped queries', async () => {
    const prisma = {
      employee: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      department: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new AnalyticsService(prisma as any, {} as any);

    await service.headcountTrend('tenant-1', 6, {
      departmentId: 'dept-1',
      locationId: 'loc-1',
      legalEntityId: 'le-1',
      managerId: 'mgr-1',
      employmentType: 'FULL_TIME',
    });

    expect(prisma.employee.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          departmentId: 'dept-1',
          locationId: 'loc-1',
          legalEntityId: 'le-1',
          managerId: 'mgr-1',
          employmentType: 'FULL_TIME',
        }),
      }),
    );
  });

  describe('attendance reports', () => {
    const employee = {
      id: 'emp-1',
      employeeCode: 'EMP0142',
      firstName: 'Ritu',
      lastName: 'Sharma',
      locationId: 'loc-1',
      joiningDate: null,
      exitDate: null,
      department: { name: 'Engineering' },
      location: { name: 'Pune HQ' },
    };

    function harness(options?: { employees?: unknown[]; endedWithoutExitDate?: number }) {
      const prisma = {
        employee: {
          findMany: jest.fn().mockResolvedValue(options?.employees ?? [employee]),
          count: jest.fn().mockResolvedValue(options?.endedWithoutExitDate ?? 0),
        },
      };
      const attendance = {
        rangeLedger: jest.fn().mockResolvedValue(new Map([['emp-1', []]])),
      };
      return {
        prisma,
        attendance,
        service: new AnalyticsService(prisma as any, attendance as any),
      };
    }

    it('defaults an unbounded range to the current month instead of an arbitrary slice', async () => {
      const { service, attendance } = harness();

      await service.reportTable('tenant-1', 'attendance', {});

      const [, , start, end] = attendance.rangeLedger.mock.calls[0];
      const today = new Date();
      expect(start.toISOString().slice(0, 7)).toBe(
        `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`,
      );
      expect(start.getUTCDate()).toBe(1);
      expect(end.toISOString().slice(0, 10)).toBe(
        new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()))
          .toISOString()
          .slice(0, 10),
      );
    });

    it('rejects a malformed or inverted range rather than guessing a period', async () => {
      const { service } = harness();

      await expect(
        service.reportTable('tenant-1', 'attendance', { from: '01/09/2026' }),
      ).rejects.toThrow(/Invalid from/);
      await expect(
        service.reportTable('tenant-1', 'attendance', { from: '2026-09-30', to: '2026-09-01' }),
      ).rejects.toThrow(/must not be after/);
    });

    it('refuses an over-wide range before reading the ledger, saying how to narrow it', async () => {
      // Enough employees that a two-month register clears the row ceiling.
      const employees = Array.from({ length: 1000 }, (_, index) => ({
        ...employee,
        id: `emp-${index}`,
        employeeCode: `EMP${index}`,
      }));
      const { service, attendance } = harness({ employees });

      await expect(
        service.reportTable('tenant-1', 'attendance', { from: '2026-09-01', to: '2026-10-31' }),
      ).rejects.toThrow(
        new RegExp(`over the ${MAX_REPORT_ROWS.toLocaleString('en-IN')} row limit`),
      );
      // The point of checking the range's own dimensions first.
      expect(attendance.rangeLedger).not.toHaveBeenCalled();

      // The same employees over one month summarised is one row each, well inside it.
      await expect(
        service.reportTable('tenant-1', 'attendanceSummary', {
          from: '2026-09-01',
          to: '2026-10-31',
        }),
      ).resolves.toBeDefined();
    });

    it('includes employees who have left, and excludes those who never started', async () => {
      const { service, prisma } = harness();

      await service.reportTable('tenant-1', 'attendance', {
        from: '2026-09-01',
        to: '2026-09-30',
      });

      const { where } = prisma.employee.findMany.mock.calls[0][0];
      expect(where.status).toEqual({ notIn: ['CANDIDATE', 'PREBOARDING'] });
      // Window overlap, plus the exclusion of an ended employment with no
      // relieving date to close it.
      expect(where.AND).toEqual([
        { OR: [{ joiningDate: null }, { joiningDate: { lte: expect.any(Date) } }] },
        { OR: [{ exitDate: null }, { exitDate: { gte: expect.any(Date) } }] },
        { NOT: { status: { in: ['EXITED', 'INACTIVE'] }, exitDate: null } },
      ]);
    });

    it('reports the employees it had to leave out rather than dropping them silently', async () => {
      const { service } = harness({ endedWithoutExitDate: 3 });

      const { info } = await service.reportTable('tenant-1', 'attendance', {
        from: '2026-09-01',
        to: '2026-09-30',
      });

      const excluded = info?.entries.find(([label]) => label === 'Excluded employees');
      expect(excluded?.[1]).toContain('3 employee(s)');
      expect(excluded?.[1]).toContain('no relieving date');
      expect(excluded?.[1]).toContain('Set a relieving date to include them');
    });

    it('counts only the exclusions an unclosable window actually cost', async () => {
      const { service, prisma } = harness({ endedWithoutExitDate: 2 });

      await service.reportTable('tenant-1', 'attendance', {
        from: '2026-09-01',
        to: '2026-09-30',
      });

      // Bounded by the same joining-date clause as the population, so someone
      // who had not joined by the end of the range is not reported as excluded
      // for a missing relieving date.
      expect(prisma.employee.count).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-1',
          status: { in: ['EXITED', 'INACTIVE'] },
          exitDate: null,
          AND: [{ OR: [{ joiningDate: null }, { joiningDate: { lte: expect.any(Date) } }] }],
        },
      });
    });

    it('says nothing about exclusions when there were none', async () => {
      const { service } = harness({ endedWithoutExitDate: 0 });

      const { info } = await service.reportTable('tenant-1', 'attendance', {
        from: '2026-09-01',
        to: '2026-09-30',
      });

      expect(info?.entries.some(([label]) => label === 'Excluded employees')).toBe(false);
    });

    it('names the period in the filename so a saved file still says what it covers', async () => {
      const { service } = harness();

      const { filename } = await service.reportBuilderCsv('tenant-1', 'attendance', {
        from: '2026-09-01',
        to: '2026-10-31',
      });

      expect(filename).toBe('attendance-register_2026-09-01_to_2026-10-31.csv');
    });

    it('caps the preview rows while still reporting the full total', async () => {
      const employees = Array.from({ length: 200 }, (_, index) => ({
        ...employee,
        id: `emp-${index}`,
        employeeCode: `EMP${String(index).padStart(4, '0')}`,
      }));
      const prisma = {
        employee: {
          findMany: jest.fn().mockResolvedValue(employees),
          count: jest.fn().mockResolvedValue(0),
        },
      };
      // One September day each, so the summary is one row per employee.
      const ledger = new Map(
        employees.map((e) => [
          e.id,
          [
            {
              date: new Date('2026-09-01T00:00:00.000Z'),
              status: 'PRESENT',
              source: 'RECORD',
              punchIn: null,
              punchOut: null,
              workingMinutes: 480,
              netMinutes: 480,
              overtimeMinutes: 0,
              isLate: false,
              lateByMinutes: 0,
              isEarlyDeparture: false,
              earlyDepartureMinutes: 0,
              shiftId: 'shift-1',
              shiftName: 'General',
              shiftStartTime: '09:00',
              shiftEndTime: '18:00',
              locationId: 'loc-1',
              leaveType: null,
              punchSource: 'WEB',
              isFinalized: true,
              remarks: null,
            },
          ],
        ]),
      );
      const service = new AnalyticsService(prisma as any, {
        rangeLedger: jest.fn().mockResolvedValue(ledger),
      } as any);
      const range = { from: '2026-09-01', to: '2026-09-30' };

      const preview = await service.reportTable(
        'tenant-1',
        'attendanceSummary',
        range,
        PREVIEW_ROW_LIMIT,
      );
      expect(preview.rows).toHaveLength(PREVIEW_ROW_LIMIT);
      expect(preview.rowCount).toBe(200);

      // The export path asks for no limit and gets every row.
      const full = await service.reportTable('tenant-1', 'attendanceSummary', range);
      expect(full.rows).toHaveLength(200);
      // The workbook reports the true total, not the preview's slice.
      expect(full.info?.entries).toContainEqual(['Rows', '200']);
    });

    it('labels legacy report headers from their row keys', async () => {
      const prisma = {
        employee: {
          findMany: jest.fn().mockResolvedValue([
            {
              employeeCode: 'PH001',
              firstName: 'Asha',
              lastName: 'Shah',
              workEmail: 'asha@example.com',
              status: 'ACTIVE',
              department: null,
              designation: null,
              location: null,
              manager: null,
              joiningDate: null,
            },
          ]),
        },
      };
      const service = new AnalyticsService(prisma as any, {} as any);

      const { columns } = await service.reportTable('tenant-1', 'employees', {});

      expect(columns.map((column) => column.label)).toContain('Work Email');
    });
  });
});
