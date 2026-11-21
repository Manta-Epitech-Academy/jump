/**
 * Strip email addresses and phone numbers out of a provider's failure text.
 *
 * A failed send carries a `message` that Jump does not write: Mailjet, Resend
 * and Brevo phrase their own errors, and a rejected address or number is the
 * first thing an error about it repeats. That text then travels far: into the
 * pod log, which Loki keeps 31 days, out of reach of the RGPD erasure
 * (`anonymizeTalent`), and onto `BroadcastRecipient.errorMessage`, which
 * `ops_broadcast_deliveries` reads. So the mail and SMS façades pass every
 * failure through here, once, and no caller has to remember to.
 *
 * What is lost is nothing a reader needs: the row the failure belongs to
 * already names its recipient, and the error keeps its meaning without it
 * ("[redacted email] is an invalid email address").
 *
 * The phone patterns are the shapes a number takes in Jump and at its
 * providers, not every digit run: an international `+33…`, a French
 * `06 12 34 56 78` in any separator, and Brevo's bare `33612345678`. A date or
 * a three-digit status code matches none of them.
 */
const EMAIL = /[^\s<>"'(),;:[\]]+@[^\s<>"'(),;:[\]]+\.[a-z]{2,}/gi;
const PHONE = [
  /\+\d[\d .-]{7,}\d/g,
  /\b0\d(?:[ .-]?\d{2}){4}\b/g,
  /\b\d{9,15}\b/g,
];

export function redactContacts(text: string): string {
  let out = text.replace(EMAIL, '[redacted email]');
  for (const pattern of PHONE) out = out.replace(pattern, '[redacted phone]');
  return out;
}

/** The same, over a send result: a success carries no provider text. */
export function redactFailure<T extends { ok: boolean; message?: string }>(
  result: T,
): T {
  return result.ok || result.message === undefined
    ? result
    : { ...result, message: redactContacts(result.message) };
}
