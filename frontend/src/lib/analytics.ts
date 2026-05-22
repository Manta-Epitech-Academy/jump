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

/** Bucket text lengths (chars) for low-cardinality stats. */
export function bucketLength(len: number | null | undefined): string | null {
  if (len == null) return null;
  if (len < 500) return '<500';
  if (len < 2_000) return '500-2k';
  if (len < 10_000) return '2k-10k';
  return '>10k';
}

/**
 * Normalize free text into a stable, low-cardinality slug: lowercased,
 * accent-stripped, non-alphanumerics collapsed to `_`, capped in length.
 * Server-side error copy is a fixed set of strings, so slugging it yields a
 * stable enum (`code_incorrect_ou_expire`) rather than user-typed noise.
 */
function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48)
    .replace(/_+$/, '');
  return slug || 'unknown';
}

/** First non-empty string among the candidates. */
function firstString(...vals: unknown[]): string | undefined {
  for (const v of vals) if (typeof v === 'string' && v) return v;
  return undefined;
}

/** A SuperForm message is either a bare string or `{ type, text }`. */
function messageText(m: unknown): string | undefined {
  if (typeof m === 'string') return m;
  if (m && typeof m === 'object') {
    const text = (m as { text?: unknown }).text;
    if (typeof text === 'string') return text;
  }
  return undefined;
}

/**
 * Extract a stable `reason` slug from the things our call sites actually hand
 * us: a SuperForm `ActionResult`, a `form.message`, a fetch `Response`, or a
 * thrown `Error`. Never emits raw user copy — see {@link slugify}.
 *
 * For SuperForm failures, pass the whole `result` (not `result.data`): the
 * HTTP `status` lives on the result and is the fallback when no message or
 * machine code is present.
 */
export function errReason(input: unknown): string {
  if (input == null) return 'unknown';

  // fetch Response — status is the most stable signal.
  if (input instanceof Response) return `http_${input.status}`;

  // Thrown Error — prefer an explicit code, else the message (often already a
  // slug like `http_500`), else the constructor name.
  if (input instanceof Error) {
    const code = (input as { code?: unknown }).code;
    return slugify(firstString(code, input.message, input.name) ?? 'error');
  }

  if (typeof input === 'string') return slugify(input);

  if (typeof input === 'object') {
    const obj = input as Record<string, unknown>;
    const data = obj.data as Record<string, unknown> | undefined;
    const form = (data?.form ?? obj.form) as
      | Record<string, unknown>
      | undefined;

    // Explicit machine codes win, wherever they sit.
    const code = firstString(obj.code, obj.errorCode, obj.reason);
    if (code) return slugify(code);

    // Server-set message (ActionResult.data.form.message, or `obj` when it is
    // itself the `{ type, text }` message handed to us by `onUpdated`).
    const text = messageText(form?.message) ?? messageText(obj);
    if (text) return slugify(text);

    // Last resort: the ActionResult / Response-like HTTP status.
    if (typeof obj.status === 'number') return `http_${obj.status}`;
  }

  return 'unknown';
}
