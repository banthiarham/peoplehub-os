/** Serializes rows to RFC-4180 CSV. Headers come from the keys of the first row. */
export function toCsv(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  return [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => escapeCsv(row[h])).join(',')),
  ].join('\n');
}

function escapeCsv(value: unknown): string {
  if (value == null) return '';
  const text = value instanceof Date ? value.toISOString() : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * CSV with an explicit column list, so the header carries reviewer-facing
 * labels and every row keeps the same columns.
 *
 * {@link toCsv} takes both its headers and its column set from the first row's
 * keys, which prints `workingMinutes` as a header and silently drops any column
 * the first row happens to omit. A report with labelled columns uses this.
 *
 * The header is emitted even for an empty row set, so an export with nothing to
 * show still opens as a recognisable sheet rather than a blank file.
 */
export function toLabelledCsv(
  columns: Array<{ key: string; label: string }>,
  rows: Array<Record<string, unknown>>,
): string {
  const header = columns.map((column) => escapeCsv(column.label)).join(',');
  return [
    header,
    ...rows.map((row) => columns.map((column) => escapeCsv(row[column.key])).join(',')),
  ].join('\n');
}
