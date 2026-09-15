import { createHmac, timingSafeEqual } from 'node:crypto';

const FRESHNESS_WINDOW_SECONDS = 300;

export function verifyCallbackSignature(
  rawBody: string,
  timestamp: string,
  signature: string,
  secret: string,
): boolean {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > FRESHNESS_WINDOW_SECONDS) return false;

  const expected =
    'sha256=' +
    createHmac('sha256', secret).update(`${ts}.${rawBody}`).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
