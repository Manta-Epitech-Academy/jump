/**
 * The placeholder vocabulary a certificate design may use.
 *
 * A `Diploma_Template` row is authored at runtime, so its text is written
 * against these tokens and the shell substitutes them per page. Same `{token}`
 * convention as the feedback-form bot copy (`domain/feedbackForms/schema.ts`),
 * with one contract deliberately reversed: there, an unknown token is left
 * untouched so authored braces survive. Here that would print `{dateDbut}` on a
 * document handed to a student, so an unknown token is a REFUSAL at write time
 * and `unknownCertificateTokens` is what the write operation reports.
 */

/** What each token resolves to, in French, for the authoring contract. */
export const CERTIFICATE_TOKENS = {
  prenom: "Prénom du jeune, tel qu'il figure sur son dossier.",
  nom: 'Nom du jeune.',
  ville: 'Ville du campus qui délivre le document (« Lille »).',
  dateDebut: "Premier jour de l'événement, en français (« 1 juillet 2026 »).",
  dateFin:
    "Dernier jour de l'événement. Égal à « dateDebut » pour un événement d'une seule journée.",
  dateDuJour: 'Date de génération du document, en français.',
  signatures:
    'Bloc des signatures du campus. Remplacé par la mise en page complète, à placer là où le bloc doit apparaître.',
} as const;

export type CertificateToken = keyof typeof CERTIFICATE_TOKENS;

const TOKEN_NAMES = new Set<string>(Object.keys(CERTIFICATE_TOKENS));

/** `{token}`, the same shape the feedback-form copy uses. */
const TOKEN_PATTERN = /\{(\w+)\}/g;

export type CertificateTokenValues = Partial<Record<CertificateToken, string>>;

/**
 * Fill in the tokens `values` actually carries, and leave every other one exactly
 * as written.
 *
 * Substituting on "is a known token" instead would blank a token whose value is
 * simply not in this call, which is worse than useless: a partially-filled pass
 * would silently erase `{prenom}` before anything got to supply it. Leaving it
 * alone means a value nobody supplies prints as `{prenom}` - glaring, and
 * diagnosable - rather than as a gap on a document handed to a student.
 *
 * An unknown token is left alone for the same reason, and is refused earlier: the
 * write operation checks with `unknownCertificateTokens` before storing.
 */
export function interpolateCertificate(
  text: string,
  values: CertificateTokenValues,
): string {
  return text.replace(TOKEN_PATTERN, (whole, name: string) =>
    Object.hasOwn(values, name)
      ? (values[name as CertificateToken] ?? '')
      : whole,
  );
}

/**
 * The tokens a design uses that do not exist, in the order they appear, each
 * reported once. Empty means the text is safe to store.
 */
export function unknownCertificateTokens(text: string): string[] {
  const unknown = new Set<string>();
  for (const [, name] of text.matchAll(TOKEN_PATTERN)) {
    if (!TOKEN_NAMES.has(name)) unknown.add(name);
  }
  return [...unknown];
}
