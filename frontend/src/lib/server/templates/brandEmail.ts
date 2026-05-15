/**
 * Shared brand frame for transactional emails.
 *
 * Wraps a typed body in the Epitech-branded HTML/plaintext shell so the
 * relance-compose flow only has to worry about the editable content
 * (subject + body), not the surrounding chrome (greeting, CTA button,
 * signature). Other helpers (OTP, parent welcome, etc.) can later migrate
 * to this same builder for consistency.
 */

export type BrandEmailCta = {
  label: string;
  url: string;
};

export type BrandEmailParts = {
  /** First line, e.g. "Salut Marie !" or "Bonjour Mr/Mme Dupont,". */
  greeting: string;
  /** The editable body text. Plain text with `\n` for paragraphs. */
  body: string;
  /** Primary CTA button. */
  cta: BrandEmailCta;
  /** Closing line, e.g. "À très vite,\nL'équipe Epitech Academy". */
  signature: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function bodyToParagraphs(body: string): string {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">${escapeHtml(
          p,
        ).replace(/\n/g, '<br/>')}</p>`,
    )
    .join('\n          ');
}

export function buildBrandEmailHtml(parts: BrandEmailParts): string {
  const { greeting, body, cta, signature } = parts;
  return `
      <div style="background-color: #f8fafc; padding: 40px 20px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; text-align: center;">
        <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; padding: 40px 30px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); border-top: 5px solid #00ff97; text-align: left;">
          <p style="font-size: 16px; line-height: 1.6; margin-top: 0; margin-bottom: 20px;">${escapeHtml(
            greeting,
          )}</p>
          ${bodyToParagraphs(body)}
          <div style="text-align: center; margin: 28px 0 30px;">
            <a href="${escapeHtml(cta.url)}" style="display: inline-block; background-color: #013afb; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 12px;">${escapeHtml(
              cta.label,
            )} &rarr;</a>
          </div>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
          <p style="font-size: 14px; color: #64748b; margin: 0; white-space: pre-line;">${escapeHtml(
            signature,
          )}</p>
        </div>
      </div>
    `;
}

export function buildBrandEmailText(parts: BrandEmailParts): string {
  const { greeting, body, cta, signature } = parts;
  return `${greeting}\n\n${body.trim()}\n\n${cta.label} : ${cta.url}\n\n${signature}`;
}
