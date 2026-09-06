import ejs from 'ejs';
import { renderMarkdown } from '$lib/markdown';
import { renderPdf } from '../infra/documentRenderer';
import { fontFaceCss } from '../templates/fonts';
import { epitechLogoSvg } from '../templates/epitechLogo';
import onboardingTemplate from '../templates/onboarding-document.html?raw';
import { reglementTextFor } from '$lib/content/reglement';
import { droitImageDocumentFor } from '$lib/content/droit-image';
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

/**
 * The droit-à-l'image document, filled in: the version's markdown with every
 * placeholder substituted. Pure, exported and separated from the render so the
 * substitution rules are testable without a browser, which is what they need to
 * be: they are business rules about a signed document, not formatting.
 *
 * Every field a pre-ledger decision may be missing has a neutral fallback,
 * because the worker now renders from the dossier and an admin retry reaches
 * those rows. Of the 831 decisions in production at the time of writing, 114
 * carry no signer name and 813 carry no relationship or place of signature: they
 * predate the pipeline that captures them. Without the fallbacks those documents
 * render "Mme/Mr ****" and "Fait à , le …".
 */
export function fillImageRightsDocument(fields: {
  version: string | null | undefined;
  decision: ImageRightsDecision;
  signerName: string;
  relationship: string;
  studentName: string;
  city: string;
  schoolYear: string;
  formattedDate: string;
}): string {
  // Pinned to the wording this decision committed to, not to the current text:
  // the document is re-rendered on every change of mind and every staff
  // correction, so reading the live text here would rewrite a decision already
  // taken. A null version predates the column and resolves to the legacy text.
  const template = droitImageDocumentFor(fields.version, fields.decision);
  const namedSigner = fields.signerName.trim() || 'Responsable légal';
  const relationship = fields.relationship.trim() || 'représentant légal';
  // Drop the place when it's unknown rather than rendering "Fait à , le …".
  const city = fields.city.trim();
  const signatureLine = city
    ? `Fait à ${city}, le ${fields.formattedDate}`
    : `Fait le ${fields.formattedDate}`;
  return (
    template
      .replace('{{signerName}}', `**${namedSigner}**`)
      .replace('{{relationship}}', `**${relationship}**`)
      .replace('{{studentName}}', `**${fields.studentName}**`)
      // Only the versions written after the decision became annual name the year
      // they cover; on an older one this replaces nothing, which is correct.
      .replace('{{schoolYear}}', `**${fields.schoolYear}**`)
      .replace('{{signatureLine}}', signatureLine)
  );
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
   * règlement artifact carries both signatures over time: the worker calls in
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
  /**
   * `image-rights` only: which version of the droit à l'image the decision
   * committed to, read off the dossier. Same contract as `reglementVersion`, and
   * needed for the same reason: this document is re-rendered from DB state, so
   * without it a regeneration would put today's wording under a decision taken
   * on another. Null resolves to the pre-versioning text.
   */
  droitImageVersion?: string | null;
  /** Required for `image-rights`: selects the authorization vs refusal wording. */
  decision?: ImageRightsDecision;
  /**
   * `image-rights` only: the school year the decision covers. Named in the
   * document itself since the decision became annual, so a guardian reading a
   * signed copy can tell which year they authorized.
   */
  schoolYear?: string;
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
    documentContent = renderMarkdown(
      fillImageRightsDocument({
        version: data.droitImageVersion,
        decision,
        signerName: data.signerName ?? '',
        relationship: data.relationship ?? '',
        studentName: data.studentName,
        city: data.city ?? '',
        schoolYear: data.schoolYear ?? '',
        formattedDate: formatFr(data.signedAt ?? new Date()),
      }),
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
        // Only the handwritten signature needs a webfont here; the body is set
        // in a system sans on purpose.
        fontFaces: fontFaceCss('dancingScript'),
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

  return renderPdf({
    html: htmlContent,
    page: { format: 'A4' },
    // This is the one document that wants Puppeteer's margin box rather than its
    // own @page rule: it is flowing prose, not a fixed-size canvas.
    margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
    preferCssPageSize: false,
  });
}
