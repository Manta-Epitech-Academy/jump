import ejs from 'ejs';
import { withBrowser } from '../infra/browserPool';
import { epitechLogoSvg } from '../templates/epitechLogo';
import diplomaTemplate from '../templates/diploma.html?raw';
import certificateTemplate from '../templates/certificate.html?raw';
import stageDiplomaTemplate from '../templates/stage-diploma.html?raw';

export async function generateDiplomaPDF(data: {
  studentName: string;
  activityName: string;
  eventTitle: string;
  eventDate: string;
  todayDate: string;
}): Promise<Uint8Array<ArrayBuffer>> {
  return await generatePDF(
    diplomaTemplate,
    { ...data, logoSvg: epitechLogoSvg },
    { width: '1123px', height: '794px' },
  );
}

export async function generateCertificatePDF(data: {
  studentName: string;
  campus: string;
  schoolLevel: string;
  xp: number;
  hours: number;
  eventsAttended: number;
  activitiesCompleted: number;
  level: string;
  topThemes: { name: string; count: number; label: string }[];
  activities: { name: string; eventDate: string; difficulty: string }[];
  todayDate: string;
  images: string[];
}): Promise<Uint8Array<ArrayBuffer>> {
  return await generatePDF(
    certificateTemplate,
    { ...data, logoSvg: epitechLogoSvg },
    { width: '794px', height: '1123px' },
  );
}

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
  signatories: { name: string; role: string; imageDataUri: string }[];
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
    { ...data, logoDataUri },
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

  return withBrowser(async (browser) => {
    const page = await browser.newPage();
    try {
      // Parse the DOM but do NOT wait on the network `load` event. The Google
      // Fonts stylesheet is the only remote resource, and blocking setContent on
      // `load` blocks the whole render on that one request, which can hang it for
      // a long time when Google Fonts is slow or unreachable (a `load`-wait once
      // stalled the 200-page stage diploma into Puppeteer's 30s timeout). All
      // images/logo are inline data URIs, so the DOM is structurally complete at
      // `domcontentloaded`; the fonts get a bounded grace period in the race below.
      await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });

      // Give web fonts a brief chance to load when the network IS reachable,
      // but never block the render on a hung font request.
      await page.evaluate(() =>
        Promise.race([
          document.fonts.ready,
          new Promise((resolve) => setTimeout(resolve, 2000)),
        ]),
      );

      const pdfBuffer = await page.pdf({
        width: format.width,
        height: format.height,
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
        // A cohort sheet can run to ~200 pages; on a constrained pod CPU the
        // print pass needs more headroom than Puppeteer's 30s default.
        timeout: 120_000,
      });

      return new Uint8Array(pdfBuffer) as Uint8Array<ArrayBuffer>;
    } finally {
      await page.close();
    }
  });
}
