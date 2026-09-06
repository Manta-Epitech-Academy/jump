/**
 * CSV download helpers, shared by every admin export.
 *
 * Excel-friendly by default: a UTF-8 BOM so accented French opens correctly,
 * CRLF line endings, and RFC 4180 quoting on every cell.
 *
 * Cells carry untrusted input (talent-entered names, emails), so every cell is
 * also guarded against CSV/formula injection before quoting.
 */

/**
 * Quote-escape one cell (wrap in quotes, double any internal quotes), guarding
 * against spreadsheet formula injection.
 *
 * A cell whose first character is `= + - @` (or a tab/CR that Excel folds into
 * the next field) is treated as a formula by Excel/LibreOffice/Sheets, so a
 * talent named `=HYPERLINK("http://evil","x")` would execute when an admin
 * opens the export. We prefix such cells with a single quote, the documented
 * mitigation (OWASP), which forces the app to render the literal text.
 */
function csvCell(value: string | null | undefined): string {
  const raw = value ?? '';
  const guarded = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${guarded.replace(/"/g, '""')}"`;
}

/**
 * Build a `text/csv` download `Response`. `rows` are arrays of raw cell values
 * (escaping is applied here). `filename` is the `Content-Disposition` name.
 */
export function csvResponse(
  filename: string,
  headers: string[],
  rows: (string | null | undefined)[][],
): Response {
  const lines = [headers.map(csvCell).join(',')];
  for (const row of rows) lines.push(row.map(csvCell).join(','));
  const body = '﻿' + lines.join('\r\n');
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
