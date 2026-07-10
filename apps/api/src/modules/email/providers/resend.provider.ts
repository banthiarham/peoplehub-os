import { IEmailProvider, SendEmailInput, SendEmailResult } from './email-provider.interface';

export interface ResendProviderConfig {
  apiKey: string;
  fromEmail: string;
  fromName: string;
  replyTo?: string;
}

export class ResendProvider implements IEmailProvider {
  constructor(private readonly config: ResendProviderConfig) {}

  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `"${input.fromName || this.config.fromName}" <${input.fromEmail || this.config.fromEmail}>`,
          to: input.to,
          cc: input.cc?.length ? input.cc : undefined,
          bcc: input.bcc?.length ? input.bcc : undefined,
          subject: input.subject,
          html: input.bodyHtml,
          text: input.bodyText || undefined,
          reply_to: input.replyTo || this.config.replyTo || undefined,
          attachments: input.attachments?.map((attachment) => ({
            filename: attachment.filename,
            content: attachment.content?.toString('base64'),
            path: attachment.url,
          })),
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        id?: string;
        message?: string;
        name?: string;
      };
      if (!response.ok) {
        return {
          success: false,
          error: payload.message || payload.name || `Resend request failed with ${response.status}`,
        };
      }
      return { success: true, messageId: payload.id };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Resend send failed' };
    }
  }

  async validateConfig(): Promise<boolean> {
    return Boolean(this.config.apiKey && this.config.fromEmail);
  }

  getProviderType(): string {
    return 'resend';
  }
}
