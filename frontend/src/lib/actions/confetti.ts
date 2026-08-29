import confetti, { type CreateTypes } from 'canvas-confetti';

// Two problems solved here, both specific to celebrating over the embedded
// minigame iframe:
//
//  1. canvas-confetti's default canvas is a plain `position: fixed` element on
//     <body>. A cross-origin iframe renders on its own compositing layer, and
//     that plain canvas composites *behind* it, invisible over the game. We
//     render onto our own canvas promoted to its own layer (`translateZ(0)`) at
//     the top of the stack, so it paints above the iframe.
//  2. `useWorker: true` runs the renderer in a Worker created from a `blob:`
//     URL, which the app's CSP blocks (no worker/blob in script-src): the
//     worker dies silently and nothing draws. We render on the main thread.
let instance: CreateTypes | null = null;

function getConfetti(): CreateTypes {
  if (instance) return instance;
  // SSR / no DOM: a no-op (callers only ever fire client-side).
  if (typeof document === 'undefined') {
    return (() => Promise.resolve(undefined)) as unknown as CreateTypes;
  }

  const canvas = document.createElement('canvas');
  Object.assign(canvas.style, {
    position: 'fixed',
    inset: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    zIndex: '2147483647',
    transform: 'translateZ(0)', // own compositing layer → above the game iframe
  });
  document.body.appendChild(canvas);

  instance = confetti.create(canvas, { resize: true, useWorker: false });
  return instance;
}

export function triggerConfetti() {
  const fire = getConfetti();
  const count = 200;
  const defaults = { origin: { y: 0.7 } };

  function burst(particleRatio: number, opts: confetti.Options) {
    fire({
      ...defaults,
      ...opts,
      particleCount: Math.floor(count * particleRatio),
    });
  }

  burst(0.25, {
    spread: 26,
    startVelocity: 55,
    colors: ['#013afb', '#00ff97'], // Epitech Blue & Teal
  });
  burst(0.2, {
    spread: 60,
    colors: ['#ff5f3a', '#ffffff'], // Orange & White
  });
  burst(0.35, { spread: 100, decay: 0.91, scalar: 0.8 });
  burst(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });
  burst(0.1, { spread: 120, startVelocity: 45 });
}

/**
 * A second, distinct confetti beat: streams from both bottom corners for a
 * short while. Meant to fire ~0.8s *after* {@link triggerConfetti} so a finish
 * celebration lands in layers (pop → streams) rather than one flat burst.
 */
export function triggerSideCannons(durationMs = 600) {
  const fire = getConfetti();
  const end = Date.now() + durationMs;
  const colors = ['#013afb', '#00ff97', '#ff5f3a']; // Epitech blue, teal, orange

  (function frame() {
    fire({
      particleCount: 3,
      angle: 60,
      spread: 55,
      startVelocity: 50,
      origin: { x: 0, y: 0.9 },
      colors,
    });
    fire({
      particleCount: 3,
      angle: 120,
      spread: 55,
      startVelocity: 50,
      origin: { x: 1, y: 0.9 },
      colors,
    });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}
