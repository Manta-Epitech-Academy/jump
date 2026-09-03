import { describe, it, expect } from 'vitest';
import { asciiFilename, xlsxAttachment, zipAttachment } from './attachments';

describe('asciiFilename', () => {
  it('should keep the base letter of an accented character', () => {
    // Not a formatting preference: `Content-Disposition`'s plain `filename` is
    // a latin-1 field, so "Stage d'Été" has to arrive as readable ASCII rather
    // than as mojibake or a header the client gives up on.
    expect(asciiFilename("Stage d'Été 2026", 'x')).toBe('Stage dEte 2026');
  });

  it('should fall back when nothing survives the fold', () => {
    // An event titled only in non-latin script, or only in punctuation.
    expect(asciiFilename('日本語', 'closings')).toBe('closings');
    expect(asciiFilename('   ', 'closings')).toBe('closings');
  });
});

describe('attachment responses', () => {
  it('should not let a filename break out of the header', () => {
    // Arrange: what a stray quote or CRLF would do if it reached the header.
    const hostile = 'a"; x=1\r\nX-Injected: yes';
    // Act
    const res = xlsxAttachment(
      { name: 'S', headers: ['A'], rows: [['1']] },
      `${hostile}.xlsx`,
    );
    // Assert: one `Content-Disposition`, no injected header, no stray quote.
    expect(res.headers.get('x-injected')).toBeNull();
    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="a; x=1X-Injected: yes.xlsx"',
    );
  });

  it('should serve an archive uncacheable', () => {
    // The bytes are rendered from live data per request, so a cached archive
    // would hand back yesterday's records under today's filename.
    const res = zipAttachment(new ReadableStream<Uint8Array>(), 'a.zip');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('content-type')).toBe('application/zip');
  });
});
