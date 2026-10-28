/**
 * Minimal dependency-free XLSX writer.
 *
 * A `.xlsx` is an Office Open XML package: a ZIP archive of a handful of XML
 * parts. For our needs (sheets of text cells, each with a bold header) the
 * XML is trivial, and the only thing a library would really buy us is the ZIP
 * container, which we sidestep with *stored* (uncompressed) entries, so no
 * deflate and no dependency. Strings are written inline (`t="inlineStr"`), so
 * there is no shared-strings table to maintain either.
 *
 * Cells are text or numbers (numbers as real numeric cells, so Excel treats
 * them as numbers). Dates are passed as already-formatted strings: the caller
 * owns the campus timezone, so formatting there avoids the Excel date-serial /
 * timezone minefield. One or more sheets, bold header. A sheet more is the
 * same worksheet part again, listed in three index parts, so several sheets do
 * not change what this writer is. If a future export genuinely needs true date
 * cells, formulas or styling, reach for a real library rather than growing this.
 */

/** A single cell value. `null`/`undefined`/`''` render as a blank cell. */
export type XlsxCell = string | number | null | undefined;

// Escapes for both element text (`<t>` content) and double-quoted attributes
// (sheet name in `workbookXml`). `&quot;` is harmless in text but required in
// attributes, so one escaper stays correct wherever a value is interpolated.
function escapeXml(s: string): string {
  return (
    s
      // XML 1.0 forbids the C0 control chars (except tab/LF/CR) even when
      // escaped, so a single stray one from bad upstream data makes the part
      // unparseable and Excel refuses to open the whole workbook. Strip them
      // before escaping so one bad cell can't sink the file; tab (0x09), LF
      // (0x0A) and CR (0x0D) are legal and kept.
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  );
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

// ---- package parts -------------------------------------------------------

function contentTypesXml(sheetCount: number): string {
  const sheets = Array.from(
    { length: sheetCount },
    (_, i) =>
      `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets}</Types>`;
}

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

// Sheet i is `rId{i+1}`; the styles part takes the id after the last sheet.
function workbookRelsXml(sheetCount: number): string {
  const sheets = Array.from(
    { length: sheetCount },
    (_, i) =>
      `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
  ).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets}<Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
}

// Two cell formats: index 0 = default, index 1 = bold (header row).
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

function workbookXml(sheetNames: readonly string[]): string {
  const sheets = sheetNames
    .map(
      (name, i) =>
        `<sheet name="${escapeXml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets}</sheets></workbook>`;
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

/**
 * Excel's rules for a tab name: none of `\ / ? * [ ]`, at most 31 characters,
 * and unique in the workbook, case aside (Excel refuses to open a workbook
 * with two tabs of the same name). A clash takes a " (2)" suffix.
 */
function sheetNames(sheets: readonly XlsxSheet[]): string[] {
  const taken = new Set<string>();
  return sheets.map((sheet, i) => {
    const base =
      sheet.name
        .replace(/[\\/?*[\]]/g, ' ')
        .trim()
        .slice(0, 31) || `Feuille${i + 1}`;
    let name = base;
    for (let n = 2; taken.has(name.toLowerCase()); n++) {
      const suffix = ` (${n})`;
      name = base.slice(0, 31 - suffix.length) + suffix;
    }
    taken.add(name.toLowerCase());
    return name;
  });
}

/** Build an `.xlsx` workbook as bytes, one tab per sheet in the order given. */
export function buildXlsx(first: XlsxSheet, ...rest: XlsxSheet[]): Uint8Array {
  const sheets = [first, ...rest];
  const enc = new TextEncoder();

  return zipStore([
    {
      name: '[Content_Types].xml',
      data: enc.encode(contentTypesXml(sheets.length)),
    },
    { name: '_rels/.rels', data: enc.encode(ROOT_RELS) },
    {
      name: 'xl/workbook.xml',
      data: enc.encode(workbookXml(sheetNames(sheets))),
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: enc.encode(workbookRelsXml(sheets.length)),
    },
    { name: 'xl/styles.xml', data: enc.encode(STYLES) },
    ...sheets.map((sheet, i) => ({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      data: enc.encode(
        worksheetXml(sheet.headers, sheet.rows, sheet.colWidths),
      ),
    })),
  ]);
}

/**
 * An ASCII-only label for a `Content-Disposition` filename: accents stripped,
 * anything else outside letters, digits, space, `_` and `-` dropped. The page
 * names the download itself where it can; this is the fallback a header can
 * carry safely.
 */
export function asciiFilename(label: string, fallback: string): string {
  return (
    label
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9 _-]/g, '')
      .trim() || fallback
  );
}

/** A workbook as a download. `filename` is used as given, so pass it through
 *  `asciiFilename` first. */
export function xlsxResponse(bytes: Uint8Array, filename: string): Response {
  // `buildXlsx` returns an exactly-sized Uint8Array, so its backing buffer is
  // the whole payload.
  return new Response(bytes.buffer as ArrayBuffer, {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}.xlsx"`,
    },
  });
}
