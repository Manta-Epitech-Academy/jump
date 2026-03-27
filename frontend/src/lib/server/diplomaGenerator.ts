import ejs from 'ejs';
import { withBrowser } from './browserPool';
import { epitechLogoSvg } from './epitechLogo';
import diplomaTemplate from './templates/diploma.html?raw';
import certificateTemplate from './templates/certificate.html?raw';

export async function generateDiplomaPDF(data: {
  studentName: string;
  subjectName: string;
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
  xp: number;
  hours: number;
  level: string;
  subjects: string[];
  todayDate: string;
  images: string[];
}): Promise<Uint8Array<ArrayBuffer>> {
  return await generatePDF(
    certificateTemplate,
    { ...data, logoSvg: epitechLogoSvg },
    { width: '794px', height: '1123px' },
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
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
      await page.evaluateHandle('document.fonts.ready');

      const pdfBuffer = await page.pdf({
        width: format.width,
        height: format.height,
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
      });

      return new Uint8Array(pdfBuffer) as Uint8Array<ArrayBuffer>;
    } finally {
      await page.close();
    }
  });
}
