import type { FastifyReply } from 'fastify';
import { AnalyticsController } from './analytics.controller';
import { XLSX_CONTENT_TYPE } from '../../common/utils/xlsx';
import type { AuthUser } from '../../common/types/auth-user';

/**
 * The export route is the only one in the module that answers with binary, so
 * these pin the two things a download depends on: the content type the browser
 * saves it under, and the filename the reply advertises.
 */
describe('AnalyticsController export', () => {
  const user = { tenantId: 'tenant-1' } as AuthUser;

  function replyDouble() {
    const headers: Record<string, string> = {};
    return {
      headers,
      reply: { header: (key: string, value: string) => { headers[key] = value; } } as unknown as FastifyReply,
    };
  }

  function analyticsDouble() {
    return {
      reportBuilderWorkbook: jest
        .fn()
        .mockResolvedValue({ buffer: Buffer.from('PK-xlsx'), filename: 'attendance-register.xlsx' }),
      reportBuilderCsv: jest
        .fn()
        .mockResolvedValue({ csv: 'Month,Date', filename: 'attendance-register.csv' }),
    };
  }

  it('defaults to a workbook, returning the buffer under the xlsx content type', async () => {
    const analytics = analyticsDouble();
    const controller = new AnalyticsController(analytics as never);
    const { headers, reply } = replyDouble();

    const body = await controller.reportBuilderExport(user, { report: 'attendance' }, reply);

    expect(Buffer.isBuffer(body)).toBe(true);
    expect(headers['Content-Type']).toBe(XLSX_CONTENT_TYPE);
    expect(headers['Content-Disposition']).toBe(
      'attachment; filename="attendance-register.xlsx"',
    );
    expect(headers['Content-Length']).toBe('7');
    expect(analytics.reportBuilderCsv).not.toHaveBeenCalled();
  });

  it('answers with CSV when it is asked for', async () => {
    const analytics = analyticsDouble();
    const controller = new AnalyticsController(analytics as never);
    const { headers, reply } = replyDouble();

    const body = await controller.reportBuilderExport(
      user,
      { report: 'attendance', format: 'csv' },
      reply,
    );

    expect(body).toBe('Month,Date');
    expect(headers['Content-Type']).toBe('text/csv; charset=utf-8');
    expect(analytics.reportBuilderWorkbook).not.toHaveBeenCalled();
  });

  it('treats the weekly-off flag as set unless it is explicitly false', async () => {
    const analytics = analyticsDouble();
    const controller = new AnalyticsController(analytics as never);
    const { reply } = replyDouble();

    await controller.reportBuilderExport(user, { report: 'attendance' }, reply);
    await controller.reportBuilderExport(
      user,
      { report: 'attendance', includeNonWorkingDays: 'false' },
      reply,
    );
    await controller.reportBuilderExport(
      user,
      { report: 'attendance', includeNonWorkingDays: 'true' },
      reply,
    );

    const flags = analytics.reportBuilderWorkbook.mock.calls.map(
      (call) => call[2].includeNonWorkingDays,
    );
    // Unset stays undefined so the service keeps its own default of "included".
    expect(flags).toEqual([undefined, false, true]);
  });
});
