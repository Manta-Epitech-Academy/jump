import ejs from 'ejs';
import { renderPdf, renderPng } from '../infra/documentRenderer';
import { fontFaceCss } from '../templates/fonts';
import { epitechLogoSvg } from '../templates/epitechLogo';
import certificateTemplate from '../templates/certificate.html?raw';
import { escapeHtml } from '$lib/domain/htmlEscape';
import { interpolateCertificate } from '$lib/domain/diplomas';

/**
 * The certificate design, as stored on a `Diploma_Template` row. Taken as a
 * parameter rather than imported: which certificate an event issues is a per-event
 * choice (`Event.diplomaTemplateId`), and the design itself is authored at runtime.
 */
export type CertificateDesign = {
  styleCss: string;
  bodyHtml: string;
  pageWidthPx: number;
  pageHeightPx: number;
};

/** A signatory block, its image already inlined by the caller. */
export type CertificateSignatory = {
  name: string;
  role: string;
  /**
   * Null when the image is absent (e.g. a database restored without its S3
   * objects); the block then renders the name and role over a blank line.
   */
  imageDataUri: string | null;
};

/**
 * The signature blocks, as the markup `{signatures}` is replaced with.
 *
 * Built here rather than left to the design: the count varies with the campus,
 * and the images are hoisted into one `<style>` in the shell, so an author has
 * nothing to bind them to. The `.sig-*` classes are theirs to style.
 */
function signaturesHtml(signatories: readonly CertificateSignatory[]): string {
  return signatories
    .map(
      (s, i) => `<div class="sig-block">
  <div class="sig-img sig-img-${i}"></div>
  <div class="sig-line">
    <p class="sig-name">${escapeHtml(s.name)}</p>
    <p class="sig-role">${escapeHtml(s.role)}</p>
  </div>
</div>`,
    )
    .join('\n');
}

/**
 * The cohort a certificate is shown with when there is no real one.
 *
 * Placeholder names on purpose, and that is what makes both the validation
 * render and the preview safe to expose: neither can ever carry a student's
 * identity, which matters because the preview travels into an LLM's context.
 * "Nguyễn Wróblewski" is deliberate too, it exercises the font subsets a real
 * name needs.
 */
const SAMPLE_DATA = {
  students: [
    { prenom: 'Camille', nom: 'Martin' },
    { prenom: 'Nguyễn', nom: 'Wróblewski' },
  ],
  city: 'Lille',
  startDate: '1 juillet 2026',
  endDate: '12 juillet 2026',
  todayDate: '24 août 2026',
  signatories: [
    { name: 'Prénom Nom', role: 'Directeur du campus', imageDataUri: null },
  ],
} as const;

/**
 * Render two sample pages, to prove a design produces a document at all.
 *
 * Run before a design is stored. What it catches is a design that makes the
 * renderer fail or run away - a crash, or a page that never settles inside the
 * budget - which is worth catching because the alternative is finding out in
 * front of a cohort's worth of certificates. What it does NOT catch is a design
 * that renders badly: browsers are forgiving, and ugly is not an exception. Two
 * pages rather than one, because page breaks are what one page would not
 * exercise, and a short budget because a runaway design must not hold an API
 * call open for two minutes.
 */
export async function renderCertificateSample(
  design: CertificateDesign,
): Promise<{ bytes: number }> {
  const pdf = await renderPdf({
    html: await buildCertificateHtml(design, SAMPLE_DATA),
    page: {
      width: `${design.pageWidthPx}px`,
      height: `${design.pageHeightPx}px`,
    },
    timeoutMs: 20_000,
  });
  return { bytes: pdf.byteLength };
}

/**
 * The first page of a design, as a PNG, for a human or a model to look at.
 *
 * This is the answer to "what does this certificate look like". Without it, that
 * question can only be answered from `styleCss` and `bodyHtml`, which do not
 * contain the shell: the fonts, the page geometry, the signature blocks. A model
 * asked it anyway renders its own approximation and presents it as the document,
 * which is the same failure as re-deriving a figure instead of quoting it.
 *
 * Rendered through the very same path as the export, so it cannot drift from what
 * actually prints. Downscaled because it has to travel in a chat message.
 */
export async function renderCertificatePreviewPng(
  design: CertificateDesign,
): Promise<{
  png: Uint8Array<ArrayBuffer>;
  widthPx: number;
  heightPx: number;
}> {
  // One recipient: a preview shows the page, not the pagination.
  const html = await buildCertificateHtml(design, {
    ...SAMPLE_DATA,
    students: [SAMPLE_DATA.students[1]],
  });
  const png = await renderPng({
    html,
    widthPx: design.pageWidthPx,
    heightPx: design.pageHeightPx,
    scale: PREVIEW_SCALE,
  });
  return {
    png,
    widthPx: Math.round(design.pageWidthPx * PREVIEW_SCALE),
    heightPx: Math.round(design.pageHeightPx * PREVIEW_SCALE),
  };
}

/** Enough to read the layout and the wording, small enough to send. */
const PREVIEW_SCALE = 0.75;

/**
 * One page per recipient, of whatever certificate the event issues.
 *
 * Token values are HTML-escaped before substitution, because they land in markup
 * the shell injects unescaped: a name is data, and `{signatures}` is the one
 * value that is markup by design.
 */
export async function generateDiplomasPDF(
  design: CertificateDesign,
  data: {
    students: { prenom: string; nom: string }[];
    city: string;
    startDate: string;
    endDate: string;
    todayDate: string;
    signatories: CertificateSignatory[];
  },
  options?: {
    /** Print budget. Defaults to the cohort-sized one; a sample render lowers it. */
    timeoutMs?: number;
  },
): Promise<Uint8Array<ArrayBuffer>> {
  return renderPdf({
    html: await buildCertificateHtml(design, data),
    page: {
      width: `${design.pageWidthPx}px`,
      height: `${design.pageHeightPx}px`,
    },
    // A cohort sheet can run to ~200 pages; on a constrained pod CPU the print
    // pass needs more headroom than Puppeteer's 30s default.
    timeoutMs: options?.timeoutMs ?? 120_000,
  });
}

/**
 * The whole document as HTML: the design's pages, its CSS, and the shell around
 * them. Shared by the export, the validation render and the preview, so all three
 * are looking at the same thing by construction.
 */
async function buildCertificateHtml(
  design: CertificateDesign,
  data: {
    students: readonly { prenom: string; nom: string }[];
    city: string;
    startDate: string;
    endDate: string;
    todayDate: string;
    signatories: readonly CertificateSignatory[];
  },
): Promise<string> {
  // Every token in one pass per recipient, rather than an event-level pass
  // followed by a per-student one: two passes only work if each leaves the
  // other's tokens alone, and that is a subtlety worth not depending on.
  const perEvent = {
    ville: escapeHtml(data.city),
    dateDebut: escapeHtml(data.startDate),
    dateFin: escapeHtml(data.endDate),
    dateDuJour: escapeHtml(data.todayDate),
    signatures: signaturesHtml(data.signatories),
  };

  const pages = data.students.map((student) =>
    interpolateCertificate(design.bodyHtml, {
      ...perEvent,
      prenom: escapeHtml(student.prenom),
      nom: escapeHtml(student.nom),
    }),
  );

  // The logo and the signature images are declared once as CSS background
  // images in the shell, never inlined per page: duplicating tens of kilobytes
  // across 200 pages is the slow path that once timed out.
  const logoDataUri = `data:image/svg+xml;base64,${Buffer.from(
    epitechLogoSvg,
  ).toString('base64')}`;

  return ejs.render(
    certificateTemplate,
    {
      data: {
        pages,
        styleCss: design.styleCss,
        pageWidthPx: design.pageWidthPx,
        pageHeightPx: design.pageHeightPx,
        signatories: data.signatories,
        logoDataUri,
        fontFaces: fontFaceCss('anton', 'plexSans', 'plexSansItalic'),
      },
    },
    { async: true },
  );
}
