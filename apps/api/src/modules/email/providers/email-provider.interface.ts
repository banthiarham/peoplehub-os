export interface SendEmailInput {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  fromEmail: string;
  fromName: string;
  replyTo?: string;
  attachments?: EmailAttachmentInput[];
}

export interface EmailAttachmentInput {
  filename: string;
  content?: Buffer;
  contentType: string;
  url?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface IEmailProvider {
  sendEmail(input: SendEmailInput): Promise<SendEmailResult>;
  validateConfig(): Promise<boolean>;
  getProviderType(): string;
}
