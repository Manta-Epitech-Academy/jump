/**
 * Phone-number normalization.
 *
 * `Talent.phone` / `Talent.parentPhone` start life as free-text, mixed-shape
 * values: French-entered at onboarding ("06 12 …", "+33 6 …", "0033…") and
 * fed raw from Salesforce, which hands us full E.164 ("+33607131175") for most
 * but a bare national number with no country and no leading 0 ("765719823")
 * for some. Two consumers each want their own shape:
 *
 *  - `normalizePhoneToE164`: the canonical *storage* form, E.164 with a "+"
 *    ("+33765719823"). Used at the Salesforce ingest boundary and as the form
 *    the onboarding input submits, so every parseable shape collapses to one
 *    representation and equality checks (reconciliation, prefill) compare like
 *    with like.
 *  - `toBrevoRecipient`: the *send* form Brevo's SMS API wants, digits-only
 *    with no leading 0 and no "+" ("33765719823").
 *  - `formatPhoneForDisplay`: the human-readable form for staff screens, in
 *    international grouping ("+33 6 12 34 56 78") so a number is legible at a
 *    glance instead of rendered as the run-together string we store.
 */

import { parsePhoneNumberFromString } from 'libphonenumber-js';

// Salesforce and our onboarding audience are French; an unqualified national
// number ("765719823", "0612345678") is read against this region.
const DEFAULT_REGION = 'FR';

/**
 * Collapse any parseable phone shape to canonical E.164 ("+33765719823"), or
 * return `null` when the value isn't a valid number. Parses as international
 * first (a "+" / "00…" prefix wins), then falls back to reading it as a French
 * national number: this is what rescues SF's bare "765719823" form, which
 * carries no country and would otherwise be stored verbatim (missing its
 * leading 0) and read as different from the same number entered at onboarding.
 *
 * Callers at the ingest boundary keep the raw string when this returns `null`,
 * so an unparseable value is preserved rather than discarded.
 */
export function normalizePhoneToE164(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const parsed =
    parsePhoneNumberFromString(trimmed) ??
    parsePhoneNumberFromString(trimmed, DEFAULT_REGION);
  return parsed?.isValid() ? parsed.number : null;
}

/**
 * Coerce a user-entered phone string into the form Brevo expects, or return
 * `null` when the value can't be turned into a plausible international number.
 * Callers treat `null` as "no usable phone" (relance counts it as `noPhone`)
 * rather than handing the provider a number it would silently reject.
 */
export function toBrevoRecipient(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  // A leading "+" marks an already-international number; preserve that intent
  // so we don't mistake e.g. "+1 555…" for a French national number.
  const isInternational = trimmed.startsWith('+');
  let digits = trimmed.replace(/\D/g, '');
  if (digits.length === 0) return null;

  // "00" international dialing prefix → bare country code.
  if (!isInternational && digits.startsWith('00')) {
    digits = digits.slice(2);
  } else if (
    !isInternational &&
    digits.length === 10 &&
    digits.startsWith('0')
  ) {
    // French national form 0X######## → 33 + 9 significant digits.
    digits = '33' + digits.slice(1);
  }

  // E.164 numbers (sans "+") run 8 to 15 digits. Anything outside that is a
  // typo or a fragment, so refuse it rather than burn an SMS credit on a bounce.
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

/**
 * Render a stored phone number in a legible, spaced form for display.
 *
 * Every number comes back in international grouping with its country code
 * visible ("+33 6 12 34 56 78", "+44 7911 123456"), French numbers included,
 * so staff always see the dialable form. Returns `null` for an empty value (so
 * callers can `?? '—'` / `|| 'Aucun numéro'`), and falls back to the trimmed
 * input verbatim when the value won't parse, so a malformed-but-present number
 * is shown as-is rather than hidden. Display only: the `tel:` href and SMS
 * sends keep deriving from the raw value.
 */
export function formatPhoneForDisplay(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const parsed =
    parsePhoneNumberFromString(trimmed) ??
    parsePhoneNumberFromString(trimmed, DEFAULT_REGION);
  if (!parsed?.isValid()) return trimmed;
  return parsed.formatInternational();
}
