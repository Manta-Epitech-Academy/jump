/**
 * What a real Chrome does with our documents.
 *
 * Here rather than in the unit project because it needs Puppeteer's Chromium,
 * an out-of-process dependency exactly like the database the other suites need.
 * `bun install` does not run puppeteer's install script (no `trustedDependencies`),
 * so CI has no browser and `bun run test` must stay browser-free. It touches no
 * database, hence no `assertTestDatabase()`.
 *
 * Two things are asserted, and both are things that fail silently in production
 * rather than loudly: a document quietly printing in a fallback face, and the
 * renderer quietly regaining network access.
 *
 * It reads the seeded `stage` design out of the database rather than inlining a
 * fixture, so what is under test is the certificate Jump actually ships.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '$lib/server/db';
import { renderPdf } from '$lib/server/infra/documentRenderer';
import { generateDiplomasPDF } from '../diplomaGenerator';
import { assertTestDatabase } from './testDatabase';

/**
 * The embedded font names, read straight out of the PDF bytes (`AAAAAA+Anton-Regular`).
 * Deliberately not shelling out to `pdffonts`: the assertion should not need
 * poppler installed.
 */
function embeddedFonts(pdf: Uint8Array): string[] {
  const bytes = Buffer.from(pdf).toString('latin1');
  const names = bytes.match(/[A-Z]{6}\+[A-Za-z-]+/g) ?? [];
  return [...new Set(names.map((n) => n.split('+')[1]))].sort();
}

describe('the PDF renderer', () => {
  beforeAll(assertTestDatabase);

  /** The internship certificate as the migration seeded it. */
  const stageDesign = async () =>
    prisma.diploma_Template.findUniqueOrThrow({
      where: { code: 'stage' },
      select: {
        styleCss: true,
        bodyHtml: true,
        pageWidthPx: true,
        pageHeightPx: true,
      },
    });

  it('embeds the brand faces, including for a name outside latin-1', async () => {
    // Every glyph of "Nguyễn Wróblewski" has to come from our own @font-face
    // rules. If one did not, Chrome would substitute and a THIRD family would
    // appear here, which is what asserting the exact set catches: the Vietnamese
    // and latin-ext subsets are load-bearing for a real student's name.
    const pdf = await generateDiplomasPDF(await stageDesign(), {
      students: [{ prenom: 'Nguyễn', nom: 'Wróblewski' }],
      city: 'Lille',
      startDate: '1 juillet 2026',
      endDate: '12 juillet 2026',
      todayDate: '24 août 2026',
      signatories: [
        { name: 'Jean Dupont', role: 'Directeur', imageDataUri: null },
      ],
    });

    expect(embeddedFonts(pdf)).toEqual([
      'Anton-Regular',
      'IBMPlexSans-Italic',
      'IBMPlexSans-Regular',
    ]);
  }, 120_000);

  it('blocks every remote resource, and does not stall on one', async () => {
    // 10.255.255.1 black-holes packets, so a real fetch would hang until its
    // timeout. This is the control that makes it safe to render a certificate
    // design authored at runtime: the pod can reach the database and every
    // internal service, and this page can reach nothing.
    const html = `<!doctype html><html><head>
        <link rel="stylesheet" href="http://10.255.255.1/x.css">
        <style>
          @font-face {
            font-family: Remote;
            src: url('http://10.255.255.1/f.woff2') format('woff2');
          }
          body { font-family: Remote, serif; }
        </style>
      </head><body>
        <p>bloqué</p>
        <img src="http://10.255.255.1/i.png" width="50" height="50">
      </body></html>`;

    const started = Date.now();
    const pdf = await renderPdf({ html, page: { format: 'A4' } });
    const elapsedMs = Date.now() - started;

    expect(pdf.byteLength).toBeGreaterThan(0);
    // The remote face never arrived, so the text fell back to a system serif.
    expect(embeddedFonts(pdf)).not.toContain('Remote');
    // Aborted requests fail immediately; a stalled one would blow past this.
    expect(elapsedMs).toBeLessThan(15_000);
  }, 60_000);
});
