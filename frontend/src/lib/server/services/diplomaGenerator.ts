import ejs from 'ejs';
import { renderPdf } from '../infra/pdfRenderer';
import { fontFaceCss } from '../templates/fonts';
import { epitechLogoSvg } from '../templates/epitechLogo';
import stageDiplomaTemplate from '../templates/stage-diploma.html?raw';

// Internship certificate ("Certificat de stage"): one A4 landscape page per
// student, all sharing the same signatory blocks (one global Director General
// plus the campus's local managers). The signature images are passed as
// pre-built base64 data URIs so the template needs no network access.
export async function generateStageDiplomasPDF(data: {
  students: { prenom: string; nom: string }[];
  city: string;
  startDate: string;
  endDate: string;
  todayDate: string;
  // `imageDataUri` is null when the signatory's image is absent (e.g. a DB
  // restored without its S3 objects); the block then renders the name and role
  // over a blank signature line.
  signatories: { name: string; role: string; imageDataUri: string | null }[];
}): Promise<Uint8Array<ArrayBuffer>> {
  // The logo and the signature images are referenced as CSS background images
  // declared once in the template (see stage-diploma.html), not inlined per
  // page, so a 200-student sheet stays small. Encode the SVG logo as a data URI
  // here so the template needs nothing but the string.
  const logoDataUri = `data:image/svg+xml;base64,${Buffer.from(
    epitechLogoSvg,
  ).toString('base64')}`;

  return await generatePDF(
    stageDiplomaTemplate,
    {
      ...data,
      logoDataUri,
      fontFaces: fontFaceCss('anton', 'plexSans', 'plexSansItalic'),
    },
    { width: '1123px', height: '794px' },
  );
}

async function generatePDF(
  templateString: string,
  data: any,
  format: { width: string; height: string },
): Promise<Uint8Array<ArrayBuffer>> {
  const htmlContent = await ejs.render(
    templateString,
    { data },
    { async: true },
  );

  return renderPdf({
    html: htmlContent,
    page: format,
    // A cohort sheet can run to ~200 pages; on a constrained pod CPU the print
    // pass needs more headroom than Puppeteer's 30s default.
    timeoutMs: 120_000,
  });
}
