import ejs from 'ejs';
import { renderMarkdown } from '$lib/markdown';
import { withBrowser } from '../infra/browserPool';
import { epitechLogoSvg } from '../templates/epitechLogo';
import onboardingTemplate from '../templates/onboarding-document.html?raw';
import reglementMd from '$lib/content/reglement-interieur.md?raw';
import droitImageMd from '$lib/content/droit-image.md?raw';
import droitImageRefusalMd from '$lib/content/droit-image-refusal.md?raw';
import {
  ONBOARDING_DOCUMENTS,
  type OnboardingDocumentType,
} from './onboardingDocuments';
import type { ImageRightsDecision } from '$lib/domain/imageRights';

type DocumentType = OnboardingDocumentType;

// Decision-specific PDF titles. The descriptor label is intentionally neutral
// ("Droit à l'Image") because the same document type backs both outcomes; the
// PDF header itself states which way the guardian decided.
const IMAGE_RIGHTS_TITLES: Record<ImageRightsDecision, string> = {
  accepted: "Autorisation de Droit à l'Image",
  refused: "Refus de Droit à l'Image",
};

function buildImageRightsHtml(
  decision: ImageRightsDecision,
  signerName: string,
  relationship: string,
  studentName: string,
  city: string,
  formattedDate: string,
): string {
  const template = decision === 'refused' ? droitImageRefusalMd : droitImageMd;
  const filled = template
    .replace('{{signerName}}', `**${signerName}**`)
    .replace('{{relationship}}', `**${relationship}**`)
    .replace('{{studentName}}', `**${studentName}**`)
    .replace('{{city}}', city)
    .replace('{{date}}', formattedDate);
  return renderMarkdown(filled);
}

export async function generateOnboardingPDF(data: {
  type: DocumentType;
  /** Required for `image-rights`: selects the authorization vs refusal wording. */
  decision?: ImageRightsDecision;
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

  // Default to acceptance so legacy jobs enqueued before refusal existed (and
  // any caller that omits it) keep rendering the authorization wording.
  const decision: ImageRightsDecision = data.decision ?? 'accepted';

  let documentContent = '';
  if (data.type === 'rules') {
    const filled = reglementMd
      .replace('{{city}}', data.city ?? '')
      .replace('{{date}}', formattedDate);
    documentContent = renderMarkdown(filled);
  } else if (data.type === 'image-rights') {
    documentContent = buildImageRightsHtml(
      decision,
      data.signerName ?? '',
      data.relationship ?? 'représentant légal',
      data.studentName,
      data.city ?? '',
      formattedDate,
    );
  }

  const title =
    data.type === 'image-rights'
      ? IMAGE_RIGHTS_TITLES[decision]
      : ONBOARDING_DOCUMENTS[data.type].label;

  const htmlContent = await ejs.render(
    onboardingTemplate,
    {
      data: {
        type: data.type,
        title,
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
      await page.setContent(htmlContent, { waitUntil: 'load' });
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
