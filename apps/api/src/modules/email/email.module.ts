import { Module } from '@nestjs/common';
import { EmailController } from './email.controller';
import { EmailService } from './email.service';
import { SmtpConfigService } from './smtp-config.service';
import { EmailTemplateService } from './email-template.service';

@Module({
  controllers: [EmailController],
  providers: [EmailService, SmtpConfigService, EmailTemplateService],
  exports: [EmailService, EmailTemplateService],
})
export class EmailModule {}
