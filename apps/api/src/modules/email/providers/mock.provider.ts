import { Logger } from '@nestjs/common';
import { IEmailProvider, SendEmailInput, SendEmailResult } from './email-provider.interface';

export class MockEmailProvider implements IEmailProvider {
  private readonly logger = new Logger('MockEmailProvider');

  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    this.logger.log(
      `[MOCK EMAIL] To: ${input.to.join(', ')} | Subject: ${input.subject}`,
    );
    return { success: true, messageId: `mock-${Date.now()}` };
  }

  async validateConfig(): Promise<boolean> {
    return true;
  }

  getProviderType(): string {
    return 'mock';
  }
}
