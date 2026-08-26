/**
 * What a real Chrome does with our documents.
 *
 * Here rather than in the unit project because it needs Puppeteer's Chromium,
 * an out-of-process dependency exactly like the database the other suites need.
 * `bun install` does not run puppeteer's install script (no `trustedDependencies`),
 * so CI has no browser and `bun run test` must stay browser-free. It touches no
 * database, hence no `assertTestDatabase()`.
 *
 * Three things are asserted, and all three fail silently in production rather
 * than loudly: a document quietly printing in a fallback face, the renderer
 * quietly regaining network access, and the renderer quietly regaining the
 * ability to run a stored design's scripts.
 *
 * It reads the seeded `stage` design out of the database rather than inlining a
 * fixture, so what is under test is the certificate Jump actually ships.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '$lib/server/db';
import { renderPdf, renderPng } from '$lib/server/infra/documentRenderer';
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

  it("runs none of the document's own JS", async () => {
    // The companion control to the one above, and the one that actually contains
    // a stored design: request interception never sees a `ws://` handshake, so a
    // script that ran could still reach every internal service the pod reaches.
    // Rendered twice, once with a script that would repaint the box - identical
    // bytes mean it never ran. The red render is there so the comparison cannot
    // pass by being blind: it proves these bytes do change when the pixels do.
    const box = '<div style="width:40px;height:40px;background:#0f0"></div>';
    const page = (body: string) =>
      renderPng({
        html: `<body style="margin:0">${body}</body>`,
        widthPx: 40,
        heightPx: 40,
      });

    const [plain, scripted, red] = await Promise.all([
      page(box),
      page(
        `${box}<script>document.querySelector('div').style.background = '#f00'</script>`,
      ),
      page('<div style="width:40px;height:40px;background:#f00"></div>'),
    ]);

    expect(Buffer.from(scripted).equals(Buffer.from(plain))).toBe(true);
    expect(Buffer.from(red).equals(Buffer.from(plain))).toBe(false);
  }, 60_000);
});
