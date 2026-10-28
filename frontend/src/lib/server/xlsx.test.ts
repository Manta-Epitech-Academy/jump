import { describe, it, expect } from 'vitest';
import { buildXlsx } from './xlsx';

/**
 * The parts a workbook of several tabs must agree on. Excel refuses the whole
 * file when one tab is listed in the workbook but missing from its
 * relationships or content types, or when two tabs share a name, so these are
 * the failures that would cost an export rather than a cell.
 *
 * Entries are stored uncompressed, so each XML part reads back as text.
 */
function partsOf(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

const sheet = (name: string) => ({
  name,
  headers: ['Prénom'],
  rows: [['Lou']],
});

describe('a workbook of several sheets', () => {
  it('lists each tab in the workbook, its relationships and content types', () => {
    const xml = partsOf(buildXlsx(sheet('Inscrits'), sheet('Émargement')));
    expect(xml).toContain('<sheet name="Inscrits" sheetId="1" r:id="rId1"/>');
    expect(xml).toContain('<sheet name="Émargement" sheetId="2" r:id="rId2"/>');
    expect(xml).toContain('Target="worksheets/sheet2.xml"');
    expect(xml).toContain('PartName="/xl/worksheets/sheet2.xml"');
    // The styles part takes the id after the last sheet, never a sheet's.
    expect(xml).toContain(
      'Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles"',
    );
  });

  it('never gives two tabs the same name, case aside', () => {
    const xml = partsOf(buildXlsx(sheet('Closings'), sheet('closings')));
    expect(xml).toContain('<sheet name="Closings" sheetId="1"');
    expect(xml).toContain('<sheet name="closings (2)" sheetId="2"');
  });

  it("keeps a clashing name within Excel's 31 characters", () => {
    const long = 'Une feuille au nom beaucoup trop long';
    const xml = partsOf(buildXlsx(sheet(long), sheet(long)));
    const names = [...xml.matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1]);
    expect(names).toHaveLength(2);
    for (const name of names) expect(name.length).toBeLessThanOrEqual(31);
    expect(new Set(names).size).toBe(2);
  });
});
