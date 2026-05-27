/**
 * In-memory rate limiter for OTP verification and fastlogin endpoints.
 *
 * Tracks attempts by IP address. Allows max 5 attempts per 10-minute
 * sliding window. Expired entries are garbage-collected every 5 minutes.
 *
 * CWE-307 mitigation — users include minors (RGPD).
 */

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

interface AttemptRecord {
  timestamps: number[];
}

const attempts = new Map<string, AttemptRecord>();

// Auto-clean expired entries
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of attempts) {
    record.timestamps = record.timestamps.filter((t) => now - t < WINDOW_MS);
    if (record.timestamps.length === 0) {
      attempts.delete(ip);
    }
  }
}, CLEANUP_INTERVAL_MS).unref();

export function checkRateLimit(ip: string): {
  allowed: boolean;
  retryAfterSeconds?: number;
} {
  const now = Date.now();
  const record = attempts.get(ip);

  if (!record) {
    attempts.set(ip, { timestamps: [now] });
    return { allowed: true };
  }

  // Prune timestamps outside the current window
  record.timestamps = record.timestamps.filter((t) => now - t < WINDOW_MS);

  if (record.timestamps.length >= MAX_ATTEMPTS) {
    const oldest = record.timestamps[0]!;
    const retryAfterSeconds = Math.ceil((oldest + WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  record.timestamps.push(now);
  return { allowed: true };
}
