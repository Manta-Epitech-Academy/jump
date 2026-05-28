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
export const SMS_MULTIPART_SEGMENT_CHARS = 153;

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
 * Approximate characters a tracked link adds once `&tracking_id=<cuid>` is
 * injected at send time: cuid ~25 + `&tracking_id=` 13 ≈ 38, rounded up.
 */
export const SMS_TRACKING_ID_OVERHEAD = 40;

/** Estimated on-the-wire length: body length + tracking-id overhead per link. */
export function estimateSmsLength(body: string): number {
  const urlRegex = /\bhttps?:\/\/[^\s<>"')]+/gi;
  const urlCount = body.match(urlRegex)?.length ?? 0;
  return body.length + urlCount * SMS_TRACKING_ID_OVERHEAD;
}

/** How many SMS segments `estimatedChars` splits into (0 when empty). */
export function smsSegments(estimatedChars: number): number {
  if (estimatedChars <= 0) return 0;
  if (estimatedChars <= SMS_SINGLE_SEGMENT_CHARS) return 1;
  return Math.ceil(estimatedChars / SMS_MULTIPART_SEGMENT_CHARS);
}
