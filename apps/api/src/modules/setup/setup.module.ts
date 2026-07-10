import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../common/database/database.module';
import { EmailModule } from '../email/email.module';
import { SetupController } from './setup.controller';
import { SetupService } from './setup.service';

@Module({
  imports: [DatabaseModule, EmailModule],
  controllers: [SetupController],
  providers: [SetupService],
})
export class SetupModule {}
