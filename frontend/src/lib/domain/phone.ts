/**
 * Phone-number normalization for outbound SMS.
 *
 * `Talent.phone` / `Talent.parentPhone` are free-text, French-entered fields
 * ("06 12 …", "+33 6 …", "0033…", "0612345678"). Brevo's transactional SMS
 * API wants a digits-only, country-coded number with no leading 0 and no
 * "+" (e.g. "33612345678"). This is the single place that conversion lives so
 * the relance eligibility check and the actual send agree on what counts as a
 * sendable number.
 */

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

  // E.164 numbers (sans "+") run 8–15 digits. Anything outside that is a
  // typo or a fragment — refuse it rather than burn an SMS credit on a bounce.
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}
