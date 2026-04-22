import ejs from 'ejs';
import { renderMarkdown } from '$lib/markdown';
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

function buildImageRightsHtml(
  signerName: string,
  relationship: string,
  studentName: string,
  city: string,
  formattedDate: string,
): string {
  const filled = droitImageMd
    .replace('{{signerName}}', `**${signerName}**`)
    .replace('{{relationship}}', `**${relationship}**`)
    .replace('{{studentName}}', `**${studentName}**`)
    .replace('{{city}}', city)
    .replace('{{date}}', formattedDate);
  return renderMarkdown(filled);
}

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

  let documentContent = '';
  if (data.type === 'rules') {
    const filled = reglementMd
      .replace('{{city}}', data.city ?? '')
      .replace('{{date}}', formattedDate);
    documentContent = renderMarkdown(filled);
  } else if (data.type === 'image-rights') {
    documentContent = buildImageRightsHtml(
      data.signerName ?? '',
      data.relationship ?? 'représentant légal',
      data.studentName,
      data.city ?? '',
      formattedDate,
    );
  }

  const htmlContent = await ejs.render(
    onboardingTemplate,
    {
      data: {
        title: TITLES[data.type],
        documentContent,
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
