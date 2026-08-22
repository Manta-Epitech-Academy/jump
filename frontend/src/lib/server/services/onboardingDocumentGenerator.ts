import ejs from 'ejs';
import { renderMarkdown } from '$lib/markdown';
import { withBrowser } from '../infra/browserPool';
import { epitechLogoSvg } from '../templates/epitechLogo';
import onboardingTemplate from '../templates/onboarding-document.html?raw';
import { reglementTextFor } from '$lib/content/reglement';
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

function formatFr(d: Date): string {
  return d.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function buildImageRightsHtml(
  decision: ImageRightsDecision,
  signerName: string,
  relationship: string,
  studentName: string,
  city: string,
  formattedDate: string,
): string {
  const template = decision === 'refused' ? droitImageRefusalMd : droitImageMd;
  // Drop the place when it's unknown rather than rendering "Fait à , le …".
  // City was never persisted before the decision ledger, so a regeneration of a
  // pre-ledger document legitimately has no town to show.
  const trimmedCity = city.trim();
  const signatureLine = trimmedCity
    ? `Fait à ${trimmedCity}, le ${formattedDate}`
    : `Fait le ${formattedDate}`;
  const filled = template
    .replace('{{signerName}}', `**${signerName}**`)
    .replace('{{relationship}}', `**${relationship}**`)
    .replace('{{studentName}}', `**${studentName}**`)
    .replace('{{signatureLine}}', signatureLine);
  return renderMarkdown(filled);
}

/** Talent's signature input for the shared règlement PDF. */
export type RulesTalentSignature = {
  city: string;
  signedAt: Date;
};

/** Guardian's signature input for the shared règlement PDF. */
export type RulesParentSignature = {
  signerName: string;
  relationship: string;
  city: string;
  signedAt: Date;
};

export async function generateOnboardingPDF(data: {
  type: DocumentType;
  studentName: string;
  /**
   * For `rules`: signature blocks to render at the foot of the PDF. The shared
   * règlement artifact carries both signatures over time — the worker calls in
   * here every time either signer commits, passing whichever blocks are set on
   * the talent row. A block missing from this object simply doesn't render.
   */
  rules?: {
    talent?: RulesTalentSignature;
    parent?: RulesParentSignature;
  };
  /**
   * `rules` only: which version of the règlement the signature committed to,
   * read off `Talent.reglementVersion`. The body is pinned to it rather than to
   * the current wording, so a co-signature years later re-renders the text that
   * was actually signed. Null resolves to the pre-versioning text.
   */
  reglementVersion?: string | null;
  /** Required for `image-rights`: selects the authorization vs refusal wording. */
  decision?: ImageRightsDecision;
  /** Image-rights only: guardian's name, relationship, city, and signature time. */
  signerName?: string;
  relationship?: string;
  city?: string;
  signedAt?: Date;
}): Promise<Uint8Array<ArrayBuffer>> {
  // Default to acceptance so legacy image-rights jobs enqueued before refusal
  // existed (and any caller that omits it) keep rendering the authorization
  // wording.
  const decision: ImageRightsDecision = data.decision ?? 'accepted';

  let documentContent = '';
  if (data.type === 'rules') {
    documentContent = renderMarkdown(reglementTextFor(data.reglementVersion));
  } else if (data.type === 'image-rights') {
    documentContent = buildImageRightsHtml(
      decision,
      data.signerName ?? '',
      data.relationship ?? 'représentant légal',
      data.studentName,
      data.city ?? '',
      formatFr(data.signedAt ?? new Date()),
    );
  }

  const title =
    data.type === 'image-rights'
      ? IMAGE_RIGHTS_TITLES[decision]
      : ONBOARDING_DOCUMENTS[data.type].label;

  // Pre-format the per-signer dates so the EJS template stays formatting-free.
  const rules = data.rules
    ? {
        talent: data.rules.talent
          ? {
              city: data.rules.talent.city,
              date: formatFr(data.rules.talent.signedAt),
            }
          : null,
        parent: data.rules.parent
          ? {
              signerName: data.rules.parent.signerName,
              relationship: data.rules.parent.relationship,
              city: data.rules.parent.city,
              date: formatFr(data.rules.parent.signedAt),
            }
          : null,
      }
    : null;

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
        signedAt: data.signedAt ? formatFr(data.signedAt) : null,
        rules,
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
