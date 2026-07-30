import { Test } from '@nestjs/testing';
import { DatabaseModule } from '../../common/database/database.module';
import { LeaveService } from '../leave/leave.service';
import { LeaveModule } from '../leave/leave.module';
import { AttendanceService } from './attendance.service';
import { AttendanceModule } from './attendance.module';
import { ShiftResolutionService } from './shift-resolution.service';

/**
 * Guards the wiring that lets attendance and leave share one shift resolver:
 * a missing `ShiftResolutionModule` import only fails at application boot,
 * which no unit test would otherwise catch.
 */
describe('ShiftResolutionModule wiring', () => {
  it('injects the shared resolver into both attendance and leave', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule, AttendanceModule, LeaveModule],
    }).compile();

    expect(moduleRef.get(AttendanceService)).toBeInstanceOf(AttendanceService);
    expect(moduleRef.get(LeaveService)).toBeInstanceOf(LeaveService);
    expect(moduleRef.get(ShiftResolutionService, { strict: false })).toBeInstanceOf(
      ShiftResolutionService,
    );

    await moduleRef.close();
  });
});
