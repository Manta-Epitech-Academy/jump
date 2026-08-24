import ejs from 'ejs';
import { renderPdf } from '../infra/pdfRenderer';
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
function signaturesHtml(signatories: CertificateSignatory[]): string {
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
  const pdf = await generateDiplomasPDF(
    design,
    {
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
    },
    { timeoutMs: 20_000 },
  );
  return { bytes: pdf.byteLength };
}

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

  const html = await ejs.render(
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

  return renderPdf({
    html,
    page: {
      width: `${design.pageWidthPx}px`,
      height: `${design.pageHeightPx}px`,
    },
    // A cohort sheet can run to ~200 pages; on a constrained pod CPU the print
    // pass needs more headroom than Puppeteer's 30s default.
    timeoutMs: options?.timeoutMs ?? 120_000,
  });
}
