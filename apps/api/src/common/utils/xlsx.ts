/**
 * Turns labelled rows into an `.xlsx` workbook that is readable at the scale
 * these reports actually reach.
 *
 * A two-month, hundred-person attendance register is roughly six thousand rows.
 * CSV carries that data correctly but gives a reviewer no way to hold position
 * in it, so this adds the things that make a long sheet navigable: a frozen
 * header and frozen identity columns, AutoFilter, sized columns, right-aligned
 * numerics, and banding that alternates per *group* rather than per row so each
 * employee's block separates at a glance.
 *
 * Styling only — no figure is computed here.
 */

import ExcelJS from 'exceljs';

export type SheetColumn = {
  key: string;
  label: string;
  width: number;
  numeric?: boolean;
};

export type SheetRow = Record<string, string | number | null>;

export type SheetSpec = {
  /** Worksheet tab name. Sanitised for Excel's forbidden characters. */
  name: string;
  columns: SheetColumn[];
  rows: SheetRow[];
  /** Columns kept on screen while scrolling right. */
  frozenColumns?: number;
  /**
   * Row key whose value changes mark a new band — the employee code, for the
   * register. Omitted leaves the sheet unbanded.
   */
  bandByKey?: string;
  /** Fill colours per value of `statusKey`, as `AARRGGBB`. */
  statusKey?: string;
  statusFills?: Record<string, string>;
};

/** Key/value lines for a sheet that records how a report was produced. */
export type InfoSheet = { name: string; title: string; entries: Array<[string, string]> };

const HEADER_FILL = 'FF1F3A2E';
const HEADER_FONT = 'FFFFFFFF';
const BAND_FILL = 'FFF4F7F5';
const BORDER = 'FFD8E0DB';

/** Excel rejects `[]:*?/\` in a tab name and truncates past 31 characters. */
function safeSheetName(name: string): string {
  const cleaned = name.replace(/[[\]:*?/\\]/g, ' ').trim();
  return (cleaned || 'Sheet').slice(0, 31);
}

function applyHeader(sheet: ExcelJS.Worksheet, columns: SheetColumn[], frozenColumns: number) {
  const header = sheet.getRow(1);
  header.values = columns.map((column) => column.label);
  header.height = 22;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: HEADER_FONT }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
  });
  sheet.views = [{ state: 'frozen', xSplit: frozenColumns, ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  };
}

function addSheet(workbook: ExcelJS.Workbook, spec: SheetSpec) {
  const sheet = workbook.addWorksheet(safeSheetName(spec.name));
  sheet.columns = spec.columns.map((column) => ({ key: column.key, width: column.width }));
  applyHeader(sheet, spec.columns, spec.frozenColumns ?? 0);

  // Banding alternates whenever the grouping value changes, so one employee's
  // block of days is one shade however many rows it runs to.
  let band = false;
  let previousGroup: unknown;

  spec.rows.forEach((row, index) => {
    const excelRow = sheet.getRow(index + 2);
    spec.columns.forEach((column, columnIndex) => {
      const value = row[column.key];
      const cell = excelRow.getCell(columnIndex + 1);
      cell.value = value === null || value === undefined || value === '' ? null : value;
      cell.alignment = { horizontal: column.numeric ? 'right' : 'left', vertical: 'middle' };
      cell.font = { size: 10 };
      cell.border = {
        bottom: { style: 'thin', color: { argb: BORDER } },
        right: { style: 'thin', color: { argb: BORDER } },
      };
    });

    if (spec.bandByKey) {
      const group = row[spec.bandByKey];
      if (previousGroup !== undefined && group !== previousGroup) band = !band;
      previousGroup = group;
      if (band) {
        excelRow.eachCell({ includeEmpty: true }, (cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND_FILL } };
        });
      }
    }

    if (spec.statusKey && spec.statusFills) {
      const fill = spec.statusFills[String(row[spec.statusKey] ?? '')];
      if (fill) {
        const columnIndex = spec.columns.findIndex((column) => column.key === spec.statusKey);
        if (columnIndex >= 0) {
          const cell = excelRow.getCell(columnIndex + 1);
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
          cell.font = { size: 10, bold: true };
        }
      }
    }
  });

  return sheet;
}

function addInfoSheet(workbook: ExcelJS.Workbook, info: InfoSheet) {
  const sheet = workbook.addWorksheet(safeSheetName(info.name));
  sheet.columns = [{ width: 26 }, { width: 62 }];
  const title = sheet.getRow(1);
  title.getCell(1).value = info.title;
  title.getCell(1).font = { bold: true, size: 13 };
  info.entries.forEach(([label, value], index) => {
    const row = sheet.getRow(index + 3);
    row.getCell(1).value = label;
    row.getCell(1).font = { bold: true, size: 10 };
    row.getCell(2).value = value;
    row.getCell(2).font = { size: 10 };
    row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
  });
  return sheet;
}

/**
 * Builds the workbook and returns it as a buffer ready to stream.
 *
 * The info sheet goes last so the report itself is the tab that opens.
 */
export async function buildWorkbook(
  sheets: SheetSpec[],
  info?: InfoSheet,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  for (const spec of sheets) addSheet(workbook, spec);
  if (info) addInfoSheet(workbook, info);
  // An empty workbook is invalid, so a report with nothing to show still gets a
  // sheet rather than a file the reviewer cannot open.
  if (!workbook.worksheets.length) workbook.addWorksheet('Empty');
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
