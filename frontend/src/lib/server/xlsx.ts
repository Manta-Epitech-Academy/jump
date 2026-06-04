/**
 * Minimal dependency-free XLSX writer.
 *
 * A `.xlsx` is an Office Open XML package: a ZIP archive of a handful of XML
 * parts. For our needs (a single sheet of text cells with a bold header) the
 * XML is trivial, and the only thing a library would really buy us is the ZIP
 * container — which we sidestep with *stored* (uncompressed) entries, so no
 * deflate and no dependency. Strings are written inline (`t="inlineStr"`), so
 * there is no shared-strings table to maintain either.
 *
 * Cells are text or numbers (numbers as real numeric cells, so Excel treats
 * them as numbers). Dates are passed as already-formatted strings: the caller
 * owns the campus timezone, so formatting there avoids the Excel date-serial /
 * timezone minefield. Single sheet, bold header. If a future export genuinely
 * needs true date cells, multiple sheets, or formulas/styling, reach for a real
 * library rather than growing this.
 */

/** A single cell value. `null`/`undefined`/`''` render as a blank cell. */
export type XlsxCell = string | number | null | undefined;

// Escapes for both element text (`<t>` content) and double-quoted attributes
// (sheet name in `workbookXml`). `&quot;` is harmless in text but required in
// attributes, so one escaper stays correct wherever a value is interpolated.
function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 0-based column index -> spreadsheet column name (0 -> A, 26 -> AA). */
function columnName(index: number): string {
  let name = '';
  let i = index + 1;
  while (i > 0) {
    const rem = (i - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    i = Math.floor((i - 1) / 26);
  }
  return name;
}

// ---- static package parts ------------------------------------------------

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

// Two cell formats: index 0 = default, index 1 = bold (header row).
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

function workbookXml(sheetName: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
}

function cellXml(
  col: string,
  rowNum: number,
  value: XlsxCell,
  bold: boolean,
): string {
  const ref = `${col}${rowNum}`;
  const style = bold ? ' s="1"' : '';
  if (value === null || value === undefined || value === '') {
    return `<c r="${ref}"${style}/>`;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${ref}"${style} t="n"><v>${value}</v></c>`;
  }
  return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(value))}</t></is></c>`;
}

function worksheetXml(
  headers: string[],
  rows: XlsxCell[][],
  colWidths?: number[],
): string {
  const cols = colWidths?.length
    ? `<cols>${colWidths
        .map(
          (w, i) =>
            `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`,
        )
        .join('')}</cols>`
    : '';

  const headerRow = `<row r="1">${headers
    .map((h, i) => cellXml(columnName(i), 1, h, true))
    .join('')}</row>`;

  const bodyRows = rows
    .map((row, ri) => {
      const rowNum = ri + 2;
      return `<row r="${rowNum}">${row
        .map((v, i) => cellXml(columnName(i), rowNum, v ?? '', false))
        .join('')}</row>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${headerRow}${bodyRows}</sheetData></worksheet>`;
}

// ---- ZIP container (stored, no compression) ------------------------------

function crc32(bytes: Uint8Array): number {
  let crc = ~0;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (-(crc & 1) & 0xedb88320);
    }
  }
  return (~crc >>> 0) >>> 0;
}

type ZipEntry = { name: string; data: Uint8Array };

function zipStore(entries: ZipEntry[]): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = enc.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); // local file header signature
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0, true); // flags
    lv.setUint16(8, 0, true); // method 0 = stored
    lv.setUint16(10, 0, true); // mod time
    lv.setUint16(12, 0, true); // mod date
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true); // compressed size
    lv.setUint32(22, size, true); // uncompressed size
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true); // extra length
    local.set(nameBytes, 30);
    parts.push(local, entry.data);

    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true); // central dir header signature
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, 0, true); // flags
    cv.setUint16(10, 0, true); // method
    cv.setUint16(12, 0, true); // time
    cv.setUint16(14, 0, true); // date
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true); // extra
    cv.setUint16(32, 0, true); // comment
    cv.setUint16(34, 0, true); // disk number start
    cv.setUint16(36, 0, true); // internal attrs
    cv.setUint32(38, 0, true); // external attrs
    cv.setUint32(42, offset, true); // local header offset
    cd.set(nameBytes, 46);
    central.push(cd);

    offset += local.length + size;
  }

  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); // end of central dir signature
  ev.setUint16(4, 0, true); // disk number
  ev.setUint16(6, 0, true); // disk with central dir
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true); // central dir offset
  ev.setUint16(20, 0, true); // comment length

  const all = [...parts, ...central, eocd];
  const total = all.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of all) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}

// ---- public API ----------------------------------------------------------

export type XlsxSheet = {
  /** Sheet tab name (sanitised + clamped to Excel's 31-char limit). */
  name: string;
  headers: string[];
  rows: XlsxCell[][];
  /** Optional per-column widths (Excel "character" units). */
  colWidths?: number[];
};

/** Build a single-sheet `.xlsx` workbook as bytes. */
export function buildXlsx(sheet: XlsxSheet): Uint8Array {
  const enc = new TextEncoder();
  const safeName =
    sheet.name
      .replace(/[\\/?*[\]]/g, ' ')
      .trim()
      .slice(0, 31) || 'Feuille1';

  return zipStore([
    { name: '[Content_Types].xml', data: enc.encode(CONTENT_TYPES) },
    { name: '_rels/.rels', data: enc.encode(ROOT_RELS) },
    { name: 'xl/workbook.xml', data: enc.encode(workbookXml(safeName)) },
    { name: 'xl/_rels/workbook.xml.rels', data: enc.encode(WORKBOOK_RELS) },
    { name: 'xl/styles.xml', data: enc.encode(STYLES) },
    {
      name: 'xl/worksheets/sheet1.xml',
      data: enc.encode(
        worksheetXml(sheet.headers, sheet.rows, sheet.colWidths),
      ),
    },
  ]);
}
