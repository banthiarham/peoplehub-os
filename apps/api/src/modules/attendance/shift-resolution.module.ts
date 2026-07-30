import { Module } from '@nestjs/common';
import { ShiftResolutionService } from './shift-resolution.service';

/**
 * Shared so attendance and leave resolve the effective shift through the same
 * service instead of keeping parallel assignment lookups.
 */
@Module({
  providers: [ShiftResolutionService],
  exports: [ShiftResolutionService],
})
export class ShiftResolutionModule {}
