import ejs from 'ejs';
import { marked } from 'marked';
import { withBrowser } from '../infra/browserPool';
import { epitechLogoSvg } from '../templates/epitechLogo';
import onboardingTemplate from '../templates/onboarding-document.html?raw';
import reglementMd from '$lib/content/reglement-interieur.md?raw';
import droitImageMd from '$lib/content/droit-image.md?raw';

type DocumentType = 'charter' | 'rules' | 'image-rights';

const TITLES: Record<DocumentType, string> = {
  charter: 'Charte Informatique et Éthique',
  rules: 'Règlement Intérieur',
  'image-rights': "Autorisation de Droit à l'Image",
};

const DOCUMENT_CONTENT: Record<DocumentType, string> = {
  charter: '',
  rules: marked.parse(reglementMd) as string,
  'image-rights': marked.parse(droitImageMd) as string,
};

export async function generateOnboardingPDF(data: {
  type: DocumentType;
  studentName: string;
  signerName?: string;
  relationship?: string;
  city?: string;
  signedAt: Date;
}): Promise<Uint8Array<ArrayBuffer>> {
  const formattedDate = data.signedAt.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const htmlContent = await ejs.render(
    onboardingTemplate,
    {
      data: {
        title: TITLES[data.type],
        documentContent: DOCUMENT_CONTENT[data.type],
        studentName: data.studentName,
        signerName: data.signerName ?? null,
        relationship: data.relationship ?? null,
        city: data.city ?? null,
        signedAt: formattedDate,
        logoSvg: epitechLogoSvg,
      },
    },
    { async: true },
  );

  return withBrowser(async (browser) => {
    const page = await browser.newPage();
    try {
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
      await page.evaluateHandle('document.fonts.ready');

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
      });

      return new Uint8Array(pdfBuffer) as Uint8Array<ArrayBuffer>;
    } finally {
      await page.close();
    }
  });
}
