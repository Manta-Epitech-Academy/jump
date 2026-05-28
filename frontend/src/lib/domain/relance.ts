import { toBrevoRecipient } from './phone';

export type RelanceType = 'student' | 'parent';

/**
 * Relance channel. `email` is the primary nudge; `sms` is the escalation step
 * — a short, link-free text that points the recipient back to their mailbox
 * once an email relance has gone unanswered.
 */
export type RelanceChannel = 'email' | 'sms';

// Aligned with broadcast / email-action variable names so admin-bound
// templates use the same tokens everywhere. Migrated from the legacy
// `prenomParent`/`nomParent`/`childName` set; `formatTalentVars` populates
// the talent-derived tokens, the server adds the campus-scoped ones
// (`campus`, `email_contact_campus`) — both of which the default bodies use,
// so they belong here too (chips + preview, not just the server context).
export const RELANCE_VARS_STUDENT = [
  'prenom',
  'nom',
  'campus',
  'email_contact_campus',
  'login_link',
] as const;
export const RELANCE_VARS_PARENT = [
  'parent_prenom',
  'parent_nom',
  'child_prenom',
  'child_nom',
  'campus',
  'email_contact_campus',
  'login_link',
] as const;

// SMS escalation carries no action link (the recipient is sent back to their
// inbox), so the only useful tokens are who it's for, which mailbox to check,
// and the campus the message signs off as. `{{email}}` is the recipient's own
// mailbox, named per the spec; `{{campus}}` is the "- Epitech {{campus}}"
// sign-off in the default body.
export const RELANCE_SMS_VARS_STUDENT = ['prenom', 'email', 'campus'] as const;
export const RELANCE_SMS_VARS_PARENT = [
  'child_prenom',
  'email',
  'campus',
] as const;

export type StudentRelanceVar = (typeof RELANCE_VARS_STUDENT)[number];
export type ParentRelanceVar = (typeof RELANCE_VARS_PARENT)[number];
export type RelanceVar = StudentRelanceVar | ParentRelanceVar | 'email';

export function relanceVarsFor(
  type: RelanceType,
  channel: RelanceChannel = 'email',
): readonly RelanceVar[] {
  if (channel === 'sms') {
    return type === 'student'
      ? RELANCE_SMS_VARS_STUDENT
      : RELANCE_SMS_VARS_PARENT;
  }
  return type === 'student' ? RELANCE_VARS_STUDENT : RELANCE_VARS_PARENT;
}

/**
 * Max length of an SMS relance body. Two GSM-7 segments (~306 chars) is plenty
 * for "check your inbox" and keeps the per-message credit cost predictable;
 * the compose dialog surfaces a live segment count against this cap.
 */
export const RELANCE_SMS_BODY_MAX = 306;

/** Cooldown between two relances of the same type+channel for the same talent. */
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
    parent_prenom: capitalize(talent.parentPrenom),
    parent_nom: capitalize(talent.parentNom),
    child_prenom: prenom,
    child_nom: nom,
    // login_link is injected by the server send (depends on `RelanceType`).
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
  return vars.parent_nom ? `Bonjour Mr/Mme ${vars.parent_nom},` : 'Bonjour,';
}

/**
 * Reasons a single recipient can be skipped *before* attempting to send.
 * The server adds an 'error' bucket for transport failures, which are not
 * predictable client-side. `noPhone` / `noPriorEmail` are SMS-channel only.
 */
export type RelanceSkipReason =
  | 'cooldown'
  | 'completed'
  | 'noEmail'
  | 'noPhone'
  | 'noPriorEmail';

export const RELANCE_SKIP_LABELS: Record<
  RelanceSkipReason | 'error' | 'noTemplate',
  string
> = {
  cooldown: 'cooldown',
  completed: 'onboarding complet',
  noEmail: 'email manquant',
  noPhone: 'téléphone manquant',
  noPriorEmail: 'aucune relance email préalable',
  error: 'erreur',
  noTemplate: 'template non configuré',
};

/** Subset of Talent state needed to decide eligibility for a relance. */
export type TalentEligibilityFields = {
  email?: string | null;
  parentEmail?: string | null;
  phone?: string | null;
  parentPhone?: string | null;
  infoValidatedAt?: Date | string | null;
  rulesSignedAt?: Date | string | null;
  charterAcceptedAt?: Date | string | null;
  parentRulesSignedAt?: Date | string | null;
  imageRightsDecidedAt?: Date | string | null;
};

export type ClassifyRelanceInput = {
  type: RelanceType;
  /** Defaults to 'email' for back-compat with the original call sites. */
  channel?: RelanceChannel;
  talent: TalentEligibilityFields;
  /**
   * Most recent reminder matching this type+channel, or null/undefined if
   * none. Drives the cooldown — each channel has its own track.
   */
  lastReminderAt: Date | string | null | undefined;
  /**
   * Whether an email relance of this type has ever been sent. SMS only — the
   * escalation requires a prior email nudge so we don't open on a text.
   */
  hasPriorEmail?: boolean;
  /** Override "now" for tests / SSR; defaults to current time. */
  now?: number;
};

/**
 * Decides whether a talent should be skipped, returning the dominant reason
 * or `undefined` if eligible. Order matches the server's send loop so the
 * dialog's preview agrees with what the action counts:
 *   email → cooldown → completed → noEmail
 *   sms   → cooldown → completed → noPhone → noPriorEmail
 */
export function classifyRelanceSkip(
  input: ClassifyRelanceInput,
): RelanceSkipReason | undefined {
  const {
    type,
    channel = 'email',
    talent,
    lastReminderAt,
    hasPriorEmail,
    now = Date.now(),
  } = input;

  if (lastReminderAt) {
    const ts =
      lastReminderAt instanceof Date
        ? lastReminderAt.getTime()
        : new Date(lastReminderAt).getTime();
    if (now - ts < COOLDOWN_MS) return 'cooldown';
  }

  // Parent relances chase two acts per child — co-signing the règlement and an
  // image-rights *decision* (a refusal counts: the guardian acted and must not
  // be nagged further). The chase stops only once both are settled.
  const complete =
    type === 'student'
      ? talent.infoValidatedAt &&
        talent.rulesSignedAt &&
        talent.charterAcceptedAt
      : talent.parentRulesSignedAt && talent.imageRightsDecidedAt;
  if (complete) return 'completed';

  if (channel === 'sms') {
    const rawPhone = type === 'student' ? talent.phone : talent.parentPhone;
    if (!toBrevoRecipient(rawPhone)) return 'noPhone';
    // SMS is an escalation, never first contact: require a prior email relance.
    if (!hasPriorEmail) return 'noPriorEmail';
    return undefined;
  }

  const recipient = type === 'student' ? talent.email : talent.parentEmail;
  if (!recipient) return 'noEmail';

  return undefined;
}
