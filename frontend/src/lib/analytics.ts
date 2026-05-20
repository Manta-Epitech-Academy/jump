import { browser } from '$app/environment';

type Primitive = string | number | boolean | null | undefined;
export type EventData = Record<string, Primitive>;

interface UmamiTracker {
  track: (name: string, data?: EventData) => void;
  identify: (id: string, data?: EventData) => void;
  reset: () => void;
}

declare global {
  interface Window {
    umami?: UmamiTracker;
  }
}

const QUEUE_RETRY_MS = 100;
const QUEUE_MAX_RETRIES = 50; // ~5s before giving up — script.js loads with `defer`.

function call<T extends keyof UmamiTracker>(
  method: T,
  ...args: Parameters<UmamiTracker[T]>
): void {
  if (!browser) return;
  let tries = 0;
  const exec = () => {
    const u = window.umami;
    if (u) {
      (u[method] as (...a: unknown[]) => void)(...args);
      return;
    }
    if (tries++ < QUEUE_MAX_RETRIES) {
      setTimeout(exec, QUEUE_RETRY_MS);
    }
  };
  exec();
}

export function track(name: string, data?: EventData): void {
  call('track', name, data);
}

export function identify(id: string, data?: EventData): void {
  call('identify', id, data);
}

export function reset(): void {
  call('reset');
}

// ── small helpers used at call sites ────────────────────────────────────────
//
// Goal: keep Umami properties low-cardinality and RGPD-safe. Numeric values
// (sizes, durations, time-deltas) are bucketed; raw strings used as `reason`
// codes are stable, slug-like, never user-typed text.

/** Days between two dates (or now). Floors, ignores time of day. */
export function daysBetween(
  from: Date | string | null | undefined,
  to: Date | string = new Date(),
): number | null {
  if (!from) return null;
  const f = new Date(from).getTime();
  const t = new Date(to).getTime();
  if (Number.isNaN(f) || Number.isNaN(t)) return null;
  return Math.floor((t - f) / 86_400_000);
}

/** Seconds between two timestamps (or now). */
export function secondsBetween(
  from: Date | string | number | null | undefined,
  to: Date | string | number = Date.now(),
): number | null {
  if (from === null || from === undefined) return null;
  const f = typeof from === 'number' ? from : new Date(from).getTime();
  const t = typeof to === 'number' ? to : new Date(to).getTime();
  if (Number.isNaN(f) || Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((t - f) / 1000));
}

/** Bucket file sizes for low-cardinality stats. */
export function bucketBytes(bytes: number | null | undefined): string | null {
  if (bytes == null) return null;
  if (bytes < 100_000) return '<100k';
  if (bytes < 1_000_000) return '100k-1M';
  if (bytes < 10_000_000) return '1M-10M';
  if (bytes < 100_000_000) return '10M-100M';
  return '>100M';
}

/** Bucket durations (seconds) for low-cardinality stats. */
export function bucketSeconds(secs: number | null | undefined): string | null {
  if (secs == null) return null;
  if (secs < 5) return '<5s';
  if (secs < 30) return '5-30s';
  if (secs < 120) return '30s-2min';
  if (secs < 600) return '2-10min';
  if (secs < 3600) return '10min-1h';
  return '>1h';
}

/**
 * Extract a stable `reason` slug from a SuperForm action result, fetch
 * Response, or thrown error. Never emits raw user-facing French copy —
 * Umami groupings rely on stable, low-cardinality codes.
 */
export function errReason(input: unknown): string {
  if (!input) return 'unknown';
  // SuperForm `result.type === 'failure'`: data may carry a code/message.
  if (typeof input === 'object' && input !== null) {
    const obj = input as Record<string, unknown>;
    const data = (obj.data ?? obj) as Record<string, unknown>;
    const code = (data.code ?? data.errorCode ?? data.reason) as
      | string
      | undefined;
    if (typeof code === 'string' && code) return code;
    const status = obj.status;
    if (typeof status === 'number') return `http_${status}`;
    if (input instanceof Error) return input.name || 'error';
  }
  if (typeof input === 'string') return input;
  return 'unknown';
}
