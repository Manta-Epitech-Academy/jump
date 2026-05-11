export type RelanceType = 'student' | 'parent';

export const RELANCE_VARS_STUDENT = ['prenom', 'nom'] as const;
export const RELANCE_VARS_PARENT = [
  'prenomParent',
  'nomParent',
  'childName',
] as const;

export type StudentRelanceVar = (typeof RELANCE_VARS_STUDENT)[number];
export type ParentRelanceVar = (typeof RELANCE_VARS_PARENT)[number];
export type RelanceVar = StudentRelanceVar | ParentRelanceVar;

export function relanceVarsFor(type: RelanceType): readonly RelanceVar[] {
  return type === 'student' ? RELANCE_VARS_STUDENT : RELANCE_VARS_PARENT;
}

/** Cooldown between two relances of the same type for the same talent. */
export const COOLDOWN_DAYS = 3;
export const COOLDOWN_MS = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

/**
 * Substitutes `{{var}}` placeholders. Unknown vars are left untouched so a
 * staff typo doesn't silently swallow text. Trims values to avoid stray
 * whitespace creeping into rendered emails.
 */
export function applyPlaceholders(
  template: string,
  vars: Partial<Record<RelanceVar, string | null | undefined>>,
): string {
  return template.replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (match, name) => {
    const value = vars[name as RelanceVar];
    if (value == null) return match;
    return String(value).trim();
  });
}

function capitalize(s: string | null | undefined): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/** Subset of Talent fields needed to build relance variables. */
export type TalentRelanceFields = {
  prenom?: string | null;
  nom?: string | null;
  parentPrenom?: string | null;
  parentNom?: string | null;
};

/**
 * Canonical formatting of a Talent into the placeholder map shared by the
 * client preview and the server send. Keeping a single producer keeps both
 * sides in sync — drift here would make the staff-visible preview lie about
 * what the recipient sees.
 */
export function formatTalentVars(
  talent: TalentRelanceFields,
): Partial<Record<RelanceVar, string>> {
  const prenom = capitalize(talent.prenom);
  const nom = (talent.nom ?? '').toUpperCase();
  return {
    prenom,
    nom,
    prenomParent: capitalize(talent.parentPrenom),
    nomParent: capitalize(talent.parentNom),
    childName: `${prenom} ${nom}`.trim(),
  };
}

/**
 * Greeting line rendered above the body. Same producer used by the dialog
 * preview and the server-side email — the body is staff-editable but the
 * greeting is not, so it must agree on both sides.
 */
export function relanceGreeting(
  type: RelanceType,
  vars: Partial<Record<RelanceVar, string>>,
): string {
  if (type === 'student') {
    return vars.prenom ? `Salut ${vars.prenom} !` : 'Salut !';
  }
  return vars.nomParent ? `Bonjour Mr/Mme ${vars.nomParent},` : 'Bonjour,';
}

/**
 * Reasons a single recipient can be skipped *before* attempting to send.
 * The server adds a fourth bucket ('error') for transport failures, which
 * are not predictable client-side.
 */
export type RelanceSkipReason = 'cooldown' | 'completed' | 'noEmail';

export const RELANCE_SKIP_LABELS: Record<RelanceSkipReason | 'error', string> =
  {
    cooldown: 'cooldown',
    completed: 'onboarding complet',
    noEmail: 'email manquant',
    error: 'erreur',
  };

/** Subset of Talent state needed to decide eligibility for a relance. */
export type TalentEligibilityFields = {
  email?: string | null;
  parentEmail?: string | null;
  infoValidatedAt?: Date | string | null;
  rulesSignedAt?: Date | string | null;
  charterAcceptedAt?: Date | string | null;
  imageRightsSignedAt?: Date | string | null;
};

export type ClassifyRelanceInput = {
  type: RelanceType;
  talent: TalentEligibilityFields;
  /** Most recent matching-type reminder, or null/undefined if none. */
  lastReminderAt: Date | string | null | undefined;
  /** Override "now" for tests / SSR; defaults to current time. */
  now?: number;
};

/**
 * Decides whether a talent should be skipped, returning the dominant reason
 * or `undefined` if eligible. Order matches the server's send loop so the
 * dialog's preview agrees with what the action will actually count:
 * cooldown → completed → noEmail.
 */
export function classifyRelanceSkip(
  input: ClassifyRelanceInput,
): RelanceSkipReason | undefined {
  const { type, talent, lastReminderAt, now = Date.now() } = input;

  if (lastReminderAt) {
    const ts =
      lastReminderAt instanceof Date
        ? lastReminderAt.getTime()
        : new Date(lastReminderAt).getTime();
    if (now - ts < COOLDOWN_MS) return 'cooldown';
  }

  const complete =
    type === 'student'
      ? talent.infoValidatedAt &&
        talent.rulesSignedAt &&
        talent.charterAcceptedAt
      : talent.imageRightsSignedAt;
  if (complete) return 'completed';

  const recipient = type === 'student' ? talent.email : talent.parentEmail;
  if (!recipient) return 'noEmail';

  return undefined;
}
