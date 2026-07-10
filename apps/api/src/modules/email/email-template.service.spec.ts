import { NotFoundException } from '@nestjs/common';
import { EmailTemplateService } from './email-template.service';

describe('EmailTemplateService', () => {
  function createService(findFirst = jest.fn()) {
    return new EmailTemplateService({
      emailTemplate: { findFirst },
    } as any);
  }

  it('renders built-in password reset template when database templates are missing', async () => {
    const service = createService(jest.fn().mockResolvedValue(null));

    await expect(
      service.render('tenant-1', 'password_reset', {
        company_name: 'KSK Healthcare',
        employee_name: 'Ram',
        login_link: 'https://viohr.triviontechnologies.com/reset-password?token=abc',
      }),
    ).resolves.toEqual({
      subject: 'Reset your password - KSK Healthcare',
      bodyHtml:
        '<p>Hi Ram,</p><p>We received a request to reset your password.</p><p><a href="https://viohr.triviontechnologies.com/reset-password?token=abc">Reset Password</a></p><p>This link expires in 1 hour. If you did not request this, ignore this email.</p>',
      bodyText:
        'Hi Ram, reset your password using this secure link: https://viohr.triviontechnologies.com/reset-password?token=abc. This link expires in 1 hour.',
    });
  });

  it('prefers tenant template over built-in defaults', async () => {
    const findFirst = jest.fn().mockResolvedValueOnce({
      subject: 'Tenant reset for {{company_name}}',
      bodyHtml: '<p>{{employee_name}} tenant link {{login_link}}</p>',
      bodyText: 'Tenant text {{login_link}}',
    });
    const service = createService(findFirst);

    await expect(
      service.render('tenant-1', 'password_reset', {
        company_name: 'Acme',
        employee_name: 'Asha',
        login_link: 'https://example.com/reset',
      }),
    ).resolves.toEqual({
      subject: 'Tenant reset for Acme',
      bodyHtml: '<p>Asha tenant link https://example.com/reset</p>',
      bodyText: 'Tenant text https://example.com/reset',
    });
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it('still fails unknown templates when no database template exists', async () => {
    const service = createService(jest.fn().mockResolvedValue(null));

    await expect(service.render('tenant-1', 'unknown_template', {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
