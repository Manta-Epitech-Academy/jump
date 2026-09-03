import { buildXlsx, type XlsxSheet } from './xlsx';

/**
 * Handing a generated file to a browser.
 *
 * Every export route composed the same two headers and folded the same event
 * title down to ASCII for the filename, each on its own, four times over. The
 * folding in particular is not a formatting preference: `Content-Disposition`'s
 * plain `filename` parameter is a latin-1 field, so an accented title arrives
 * mangled or, depending on the client, drops the header's meaning entirely.
 */

/**
 * A filename fragment safe to interpolate into `Content-Disposition`: accents
 * stripped to their base letters, everything else outside `[A-Za-z0-9 _-]`
 * dropped, and `fallback` when nothing survives (an event titled only in
 * non-latin script, or in punctuation).
 */
export function asciiFilename(raw: string, fallback: string): string {
  return (
    raw
      .normalize('NFD')
      // Combining marks: `é` decomposes to `e` + U+0301, so dropping the range
      // leaves the base letter rather than the whole character.
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9 _-]/g, '')
      .trim() || fallback
  );
}

/**
 * Last line of defence on a filename that reaches a response header. Callers
 * build theirs out of `asciiFilename`, so nothing should be left to strip; a
 * quote or a newline slipping in would end the parameter or the header itself.
 */
function headerSafe(filename: string): string {
  return filename.replace(/[\r\n"\\]/g, '');
}

const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** A single-sheet workbook as a download. */
export function xlsxAttachment(sheet: XlsxSheet, filename: string): Response {
  const bytes = buildXlsx(sheet);
  return new Response(bytes.buffer as ArrayBuffer, {
    headers: {
      'Content-Type': XLSX_CONTENT_TYPE,
      'Content-Disposition': `attachment; filename="${headerSafe(filename)}"`,
    },
  });
}

/**
 * A streamed archive as a download.
 *
 * `no-store` because the bytes are assembled from live data on every request:
 * an archive of rendered documents served from a cache would hand back
 * yesterday's records under today's filename.
 */
export function zipAttachment(
  body: ReadableStream<Uint8Array>,
  filename: string,
): Response {
  return new Response(body, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${headerSafe(filename)}"`,
      'Cache-Control': 'no-store',
    },
  });
}
