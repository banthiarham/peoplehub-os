import * as nodemailer from 'nodemailer';
import { IEmailProvider, SendEmailInput, SendEmailResult } from './email-provider.interface';

export interface SmtpProviderConfig {
  host: string;
  port: number;
  encryption: 'SSL' | 'TLS' | 'STARTTLS' | 'NONE';
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
  replyTo?: string;
}

export class SmtpProvider implements IEmailProvider {
  private transporter: nodemailer.Transporter;

  constructor(private readonly config: SmtpProviderConfig) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.encryption === 'SSL',
      auth: { user: config.username, pass: config.password },
      tls: config.encryption === 'NONE' ? { rejectUnauthorized: false } : undefined,
    });
  }

  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    try {
      const info = await this.transporter.sendMail({
        from: `"${input.fromName}" <${input.fromEmail}>`,
        to: input.to.join(', '),
        cc: input.cc?.join(', '),
        bcc: input.bcc?.join(', '),
        subject: input.subject,
        html: input.bodyHtml,
        text: input.bodyText,
        replyTo: input.replyTo,
        attachments: input.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
        })),
      });
      return { success: true, messageId: info.messageId };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'SMTP send failed' };
    }
  }

  async validateConfig(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch {
      return false;
    }
  }

  getProviderType(): string {
    return 'smtp';
  }
}
