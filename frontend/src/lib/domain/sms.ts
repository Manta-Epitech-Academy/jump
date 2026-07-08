/**
 * SMS sizing — the single source for "how long is this message, and how many
 * SMS will it cost?". Shared by the broadcast template editor and the relance
 * compose dialog so both count segments identically.
 *
 * GSM-7 assumed (the default templates are plain ASCII). A single SMS holds 160
 * characters; once a message spills over, the carrier splits it into
 * concatenated segments of 153 chars each, and you are billed *per segment*. (A
 * non-GSM-7 character — typographic apostrophe, emoji, … — would force UCS-2 at
 * 70/segment; we don't model that, so the count drifts if such chars are pasted.)
 */
export const SMS_SINGLE_SEGMENT_CHARS = 160;
const SMS_MULTIPART_SEGMENT_CHARS = 153;

/**
 * Sanity ceiling for a *broadcast* SMS, expressed in segments. Multipart is
 * allowed (the cost is surfaced in the UI), but a cohort send is capped so a
 * typo can't fan a 10-segment message out to ~200 recipients. This is a cost
 * guard, not a technical limit.
 */
export const SMS_MAX_SEGMENTS = 3;
export const SMS_BROADCAST_MAX_CHARS =
  SMS_MAX_SEGMENTS * SMS_MULTIPART_SEGMENT_CHARS;

/**
 * Estimated on-the-wire length. SMS links are sent verbatim (we never append a
 * tracking id; visible query junk reads as phishing on a handset and depresses
 * clicks, so click-tracking is mail-only), so the wire length is just the
 * character count. Caveat: a `{{...}}` link variable expands to a real URL at
 * send time, longer than its token, and that growth isn't modelled here.
 */
export function estimateSmsLength(body: string): number {
  return body.length;
}

/** How many SMS segments `estimatedChars` splits into (0 when empty). */
export function smsSegments(estimatedChars: number): number {
  if (estimatedChars <= 0) return 0;
  if (estimatedChars <= SMS_SINGLE_SEGMENT_CHARS) return 1;
  return Math.ceil(estimatedChars / SMS_MULTIPART_SEGMENT_CHARS);
}
