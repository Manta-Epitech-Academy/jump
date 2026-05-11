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
