import { ResendProvider } from './resend.provider';

describe('ResendProvider', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('sends email through the Resend API', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ id: 'email-123' }),
    });
    const provider = new ResendProvider({
      apiKey: 'test-key',
      fromEmail: 'noreply@example.com',
      fromName: 'VioHr',
    });

    await expect(
      provider.sendEmail({
        to: ['employee@example.com'],
        subject: 'Welcome',
        bodyHtml: '<p>Hello</p>',
        fromEmail: 'noreply@example.com',
        fromName: 'VioHr',
      }),
    ).resolves.toEqual({ success: true, messageId: 'email-123' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
      }),
    );
  });

  it('returns provider errors without throwing', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      json: jest.fn().mockResolvedValue({ message: 'Domain not verified' }),
    });
    const provider = new ResendProvider({
      apiKey: 'test-key',
      fromEmail: 'noreply@example.com',
      fromName: 'VioHr',
    });

    await expect(
      provider.sendEmail({
        to: ['employee@example.com'],
        subject: 'Welcome',
        bodyHtml: '<p>Hello</p>',
        fromEmail: 'noreply@example.com',
        fromName: 'VioHr',
      }),
    ).resolves.toEqual({ success: false, error: 'Domain not verified' });
  });
});
