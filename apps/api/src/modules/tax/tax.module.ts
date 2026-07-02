import { Module } from '@nestjs/common';
import { TaxController } from './tax.controller';
import { TaxService } from './tax.service';
import { TdsEngineService } from './tds-engine.service';

@Module({
  controllers: [TaxController],
  providers: [TaxService, TdsEngineService],
  exports: [TaxService, TdsEngineService],
})
export class TaxModule {}
