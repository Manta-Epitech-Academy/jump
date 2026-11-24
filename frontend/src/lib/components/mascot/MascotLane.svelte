<!--
  EpiDuck's stretch of water in the talent header (#539): the free space
  between the logo and the account controls, where he swims, stops, turns to
  the talent, blinks, looks around, preens and answers a tap.

  Everything here is how he moves; what he does and says is the controller's
  (`mascotController.svelte.ts`), which outlives the page. The lane only reads
  it, and writes back where he was when the page changes, so the next header
  puts him back on the same spot of the screen. That spot is read off his swim
  animation, never off the page: by the time a page's teardown runs, its
  elements are already out of the document and measure nothing.

  He stops whenever he is not free to swim: while he speaks (he turns to the
  talent, and his bubble stays under him), and on his way under the water.

  The row keeps its height: the lane is as tall as the controls, and the duck
  sits on its bottom edge (the water line) and rises into the header's top
  padding. What goes under the water line is clipped, which is how he dives.

  He stays in front of the page while it changes, twice over:
    - a change of page is a View Transition (`crossfadePageChanges` in
      `#lib/motion/viewTransition.ts`), which cross-fades a picture of the
      old page into one of the new. Drawn into those pictures, his bubble
      blended with the new page's cards for the length of the fade, and a
      duck caught mid-turn flickered. The lane is its own layer of the
      transition (`view-transition-name`), painted above both pictures and
      moved from his old spot to his new one;
    - the new page then brings its cards in with a transform, and anything
      animated that way paints over whatever comes before it in the document.
      The lane is stacked above the page (`z-30`), still under every popover
      and dialog.
  The bubble asks nothing, so a click on it reaches what it covers.

  Less motion asked: he stays put, does not bob, squash or follow the
  pointer, and his dives are fades. His bubble still fades in.

  Asleep, he is under the water and nothing marks the spot, as in the mockup:
  the sleep button's « zz » says where he went, and a talent who sent him to
  sleep asked for calm.

  The randomness is the client's alone (nothing is drawn on the server, which
  renders him still), so it breaks no "rotate by a key" rule: that one is for
  lines, and what he says is picked by the controller.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { fade } from '#lib/motion/index.ts';
  import { DEFAULT_MASCOT_LOOK, mascotLookOf } from '#lib/domain/mascot.ts';
  import EpiDuck, { eyesOnScreen } from './EpiDuck.svelte';
  import { DIVE_MS, EMERGE_MS, useMascot } from './mascotController.svelte.ts';

  // Read once: the lane is remounted with the page, and a sign-in that makes
  // the duck happens on a page that draws no header.
  const mascot = useMascot()();

  /** Width of the duck in profile, at the header's size (h-11). */
  const DUCK_WIDTH = 48;
  /** Swimming speed, pixels per second: unhurried, a duck on a pond. */
  const SPEED = 28;
  /**
   * How far from his eyes, in pixels, a pointer has to be for him to look
   * all the way towards it; nearer, his pupils move less.
   */
  const GAZE_REACH = 160;
  /** The share of the way to where he looks that his pupils cover per frame. */
  const GAZE_EASE = 0.22;

  let look = $derived(
    page.data.talent ? mascotLookOf(page.data.talent) : DEFAULT_MASCOT_LOOK,
  );

  let lane = $state<HTMLDivElement>();
  let swimmer = $state<HTMLDivElement>();
  let diver = $state<HTMLDivElement>();
  let squasher = $state<HTMLDivElement>();
  let turner = $state<HTMLDivElement>();

  // Taken from the controller on mount: the page being left writes it back
  // only after this one is made.
  let facingLeft = $state(false);
  let idleFront = $state(false);
  let eyesClosed = $state(false);
  let gaze = $state({ x: 0, y: 0 });
  /** Where his pupils are heading; `gaze` eases towards it every frame. */
  let gazeTarget = { x: 0, y: 0 };
  let lookingAround = false;
  let bubbleAlign = $state<'start' | 'center' | 'end'>('center');

  let phase = $derived(mascot?.state.phase ?? 'awake');
  let front = $derived(
    phase === 'awake' && (mascot?.facingTalent || idleFront),
  );
  let swimming = $derived(phase === 'awake' && !mascot?.facingTalent);

  // State, so the effect that pauses the swim follows each new leg.
  let swimAnimation = $state.raw<Animation | null>(null);
  /**
   * The current leg, in pixels from the lane's left edge. State, so where his
   * bubble sits follows him being put back on his spot when a page comes in:
   * the bubble is already there before he is.
   */
  let leg = $state.raw({ from: 0, to: 0 });
  /** The lane's left edge on screen, read while it is in the document. */
  let laneLeft = 0;

  const rand = (min: number, max: number) => min + Math.random() * (max - min);

  /**
   * Where he is right now in the lane, from the swim animation's own clock:
   * valid mid-leg, paused, and after the page has left the document.
   */
  function currentX(): number {
    const progress = swimAnimation?.effect?.getComputedTiming().progress;
    if (progress == null) return leg.to;
    return leg.from + (leg.to - leg.from) * progress;
  }

  function measureLane(): void {
    if (lane?.isConnected) laneLeft = lane.getBoundingClientRect().left;
  }

  function place(x: number): void {
    leg = { from: x, to: x };
    swimmer?.animate([{ transform: `translateX(${x}px)` }], {
      duration: 0,
      fill: 'forwards',
    });
  }

  /** A quick squeeze to nothing and back: how a flat drawing turns round. */
  async function turn(change: () => void): Promise<void> {
    if (!turner || mascot?.reducedMotion) {
      change();
      return;
    }
    await turner.animate(
      [{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }],
      { duration: 110, easing: 'ease-in' },
    ).finished;
    change();
    await turner.animate(
      [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }],
      { duration: 110, easing: 'ease-out' },
    ).finished;
  }

  function onPoke(): void {
    if (!mascot || phase !== 'awake') return;
    mascot.poke();
    if (squasher && !mascot.reducedMotion) {
      squasher.animate(
        [
          { transform: 'scale(1, 1)' },
          { transform: 'scale(1.12, 0.86)' },
          { transform: 'scale(0.96, 1.05)' },
          { transform: 'scale(1, 1)' },
        ],
        { duration: 320, easing: 'ease-out' },
      );
    }
  }

  // Pause the swim while he talks, sleeps or dives; resume where he stopped.
  $effect(() => {
    if (!swimAnimation) return;
    if (swimming) swimAnimation.play();
    else swimAnimation.pause();
  });

  // Down and up. The controller times the phases; this only draws them, and a
  // phase's motion lasts only as long as the phase: leaving it cancels it, so
  // whatever comes next starts from the duck at rest. A dive held at its end
  // would keep him under the water line after the controller put him back on
  // it (a sleep the server refused), drawn nowhere while he swims.
  $effect(() => {
    if (!diver) return;
    const reduced = mascot?.reducedMotion;
    let motion: Animation | undefined;
    if (phase === 'diving') {
      motion = diver.animate(
        reduced
          ? [{ opacity: 1 }, { opacity: 0 }]
          : [
              { transform: 'translateY(0) rotate(0)' },
              { transform: 'translateY(-6px) rotate(-12deg)', offset: 0.35 },
              { transform: 'translateY(60px) rotate(35deg)' },
            ],
        {
          duration: reduced ? 200 : DIVE_MS,
          easing: 'ease-in',
          fill: 'forwards',
        },
      );
    } else if (phase === 'emerging') {
      motion = diver.animate(
        reduced
          ? [{ opacity: 0 }, { opacity: 1 }]
          : [
              { transform: 'translateY(60px) rotate(-25deg)' },
              { transform: 'translateY(-6px) rotate(6deg)', offset: 0.7 },
              { transform: 'translateY(0) rotate(0)' },
            ],
        {
          duration: reduced ? 200 : EMERGE_MS,
          easing: 'ease-out',
          fill: 'forwards',
        },
      );
    }
    return () => motion?.cancel();
  });

  // Keep his bubble on screen: centred under him, or pinned to the lane's
  // edge he is near.
  $effect(() => {
    if (!mascot?.bubble || !lane) return;
    const x = currentX();
    const room = lane.clientWidth;
    bubbleAlign = x < 90 ? 'start' : x > room - 140 ? 'end' : 'center';
  });

  onMount(() => {
    if (!mascot || !lane || !swimmer) return;
    let alive = true;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        const t = setTimeout(() => {
          timers.delete(t);
          resolve();
        }, ms);
        timers.add(t);
      });
    const maxX = () => Math.max(0, (lane?.clientWidth ?? 0) - DUCK_WIDTH);

    // Back on the spot the last page left him, facing the same way and,
    // if he was under way, still heading where he was going. On a first draw,
    // where the server put him: the lane's left edge.
    measureLane();
    const inLane = (windowX: number) =>
      Math.min(Math.max(0, windowX - laneLeft), maxX());
    let x = mascot.x === null ? 0 : inLane(mascot.x);
    let resumeTo = mascot.heading === null ? null : inLane(mascot.heading);
    mascot.heading = null;
    facingLeft = mascot.facingLeft;
    place(x);
    mascot.greet();

    /** What he does at a stop: turn to the talent, look around, preen. */
    async function idle(): Promise<void> {
      const roll = Math.random();
      if (roll < 0.35) {
        idleFront = true;
        await wait(rand(1400, 2200));
        idleFront = false;
      } else if (roll < 0.6) {
        lookingAround = true;
        for (const x of [-1, 1, 0]) {
          gazeTarget = { x, y: 0 };
          await wait(rand(450, 700));
        }
        lookingAround = false;
      } else if (roll < 0.8 && squasher) {
        // Preening: a shake of the feathers.
        await squasher.animate(
          [
            { transform: 'rotate(0)' },
            { transform: 'rotate(-9deg)' },
            { transform: 'rotate(8deg)' },
            { transform: 'rotate(-4deg)' },
            { transform: 'rotate(0)' },
          ],
          { duration: 640, easing: 'ease-in-out' },
        ).finished;
      }
      await wait(rand(1500, 3500));
    }

    async function swim(): Promise<void> {
      while (alive) {
        const room = maxX();
        if (mascot!.reducedMotion || room < 24 || !swimming) {
          await wait(800);
          continue;
        }
        let to = resumeTo ?? rand(0, room);
        if (resumeTo === null && Math.abs(to - x) < room * 0.25) {
          to = x < room / 2 ? room : 0;
        }
        resumeTo = null;
        const left = to < x;
        if (left !== facingLeft) await turn(() => (facingLeft = left));
        const durationMs = Math.max(1500, (Math.abs(to - x) / SPEED) * 1000);
        measureLane();
        leg = { from: x, to };
        swimAnimation = swimmer!.animate(
          [
            { transform: `translateX(${x}px)` },
            { transform: `translateX(${to}px)` },
          ],
          { duration: durationMs, easing: 'ease-in-out', fill: 'forwards' },
        );
        if (!swimming) swimAnimation.pause();
        try {
          await swimAnimation.finished;
        } catch {
          // Cancelled: on the way out, or cut short by a narrower lane, which
          // has already put him back inside it.
          if (!alive) return;
          x = leg.to;
          continue;
        }
        x = to;
        if (alive) await idle();
      }
    }

    async function blink(): Promise<void> {
      while (alive) {
        await wait(rand(2500, 6000));
        if (mascot!.reducedMotion) continue;
        eyesClosed = true;
        await wait(130);
        eyesClosed = false;
        if (Math.random() < 0.2) {
          await wait(160);
          eyesClosed = true;
          await wait(110);
          eyesClosed = false;
        }
      }
    }

    // His eyes follow a mouse; a finger has nothing to follow. The pointer is
    // only remembered when it moves: where he looks is aimed from his eyes on
    // every frame, so it stays true while he swims under a still pointer, and
    // his pupils ease there rather than jump.
    let frame = 0;
    let pointer: { x: number; y: number } | null = null;
    const finePointer = window.matchMedia('(pointer: fine)');
    const onPointer = (event: PointerEvent) => {
      pointer = finePointer.matches
        ? { x: event.clientX, y: event.clientY }
        : null;
    };
    const onPointerGone = () => (pointer = null);

    /** Where to look for the pointer to be in his eyes' line, or ahead. */
    function aimAtPointer(): { x: number; y: number } {
      const drawn = turner?.querySelector('svg');
      if (!pointer || !drawn) return { x: 0, y: 0 };
      const mirrored = !front && facingLeft;
      const eyes = eyesOnScreen(drawn, front ? 'front' : 'side', mirrored);
      // A mirrored drawing looks the other way for the same pupil offset.
      const dx = (pointer.x - eyes.x) * (mirrored ? -1 : 1);
      const dy = pointer.y - eyes.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 1) return { x: 0, y: 0 };
      const reach = Math.min(1, distance / GAZE_REACH) / distance;
      return { x: dx * reach, y: dy * reach };
    }

    function look(): void {
      if (mascot!.reducedMotion) gazeTarget = { x: 0, y: 0 };
      else if (!lookingAround) gazeTarget = aimAtPointer();
      const dx = gazeTarget.x - gaze.x;
      const dy = gazeTarget.y - gaze.y;
      if (Math.abs(dx) > 0.004 || Math.abs(dy) > 0.004) {
        gaze = mascot!.reducedMotion
          ? gazeTarget
          : { x: gaze.x + dx * GAZE_EASE, y: gaze.y + dy * GAZE_EASE };
      }
      frame = requestAnimationFrame(look);
    }

    window.addEventListener('pointermove', onPointer, { passive: true });
    document.documentElement.addEventListener('pointerleave', onPointerGone);
    frame = requestAnimationFrame(look);

    // A narrower window (a phone turned, a window resized) would leave him
    // over the controls: bring him back to the lane's new end.
    const resized = new ResizeObserver(() => {
      measureLane();
      if (currentX() <= maxX()) return;
      // Dropped, not only cancelled: a cancelled animation that is played
      // again starts its leg over.
      swimAnimation?.cancel();
      swimAnimation = null;
      x = maxX();
      place(x);
    });
    resized.observe(lane);

    void swim();
    void blink();

    return () => {
      alive = false;
      for (const t of timers) clearTimeout(t);
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onPointer);
      document.documentElement.removeEventListener(
        'pointerleave',
        onPointerGone,
      );
      resized.disconnect();
      mascot.x = laneLeft + currentX();
      mascot.facingLeft = facingLeft;
      const progress = swimAnimation?.effect?.getComputedTiming().progress;
      mascot.heading =
        progress != null && progress < 1 ? laneLeft + leg.to : null;
      swimAnimation?.cancel();
    };
  });
</script>

{#if mascot}
  <div
    bind:this={lane}
    class="lane relative z-30 h-8 min-w-12 flex-1 self-stretch sm:min-w-24"
  >
    <div bind:this={swimmer} class="absolute bottom-0 left-0 w-12">
      <!-- The water line is this box's bottom edge. -->
      <div
        class="absolute bottom-0 left-1/2 h-12 w-16 -translate-x-1/2 overflow-hidden"
      >
        {#if phase !== 'under'}
          <div
            bind:this={diver}
            class="absolute inset-x-0 bottom-0 flex justify-center"
          >
            <div class="bob">
              <div bind:this={squasher} class="origin-bottom">
                <div bind:this={turner}>
                  <button
                    type="button"
                    onclick={onPoke}
                    disabled={phase !== 'awake'}
                    aria-label="Parler à {look.name}"
                    class="block cursor-pointer rounded-full disabled:cursor-default"
                  >
                    {#if front}
                      <EpiDuck
                        pose="front"
                        {look}
                        eyes={eyesClosed ? 'shut' : 'open'}
                        {gaze}
                        class="h-11 w-10"
                      />
                    {:else}
                      <EpiDuck
                        pose="side"
                        {look}
                        eyes={eyesClosed ? 'shut' : 'open'}
                        {gaze}
                        class="h-11 w-12 {facingLeft ? '-scale-x-100' : ''}"
                      />
                    {/if}
                  </button>
                </div>
              </div>
            </div>
          </div>
        {/if}
      </div>

      {#if mascot.bubble}
        {#key mascot.bubble.id}
          <p
            in:fade
            out:fade
            aria-hidden="true"
            class="pointer-events-none absolute top-full z-30 mt-2 w-max max-w-56 rounded-xl border border-border bg-card px-3 py-2 text-center font-mono text-xs leading-snug font-bold text-primary shadow-overlay
              {bubbleAlign === 'start'
              ? 'left-0'
              : bubbleAlign === 'end'
                ? 'right-0'
                : 'left-1/2 -translate-x-1/2'}"
          >
            {mascot.bubble.text}
          </p>
        {/key}
      {/if}
    </div>
    <!-- One live region for everything he says, so a screen reader hears each
         line once; the drawn bubble is for the eyes. -->
    <p class="sr-only" aria-live="polite">{mascot.bubble?.text ?? ''}</p>
  </div>
{/if}

<style>
  /* His own layer of a page change: see the comment at the top. One lane per
     page, so the name is unique in the document, as it has to be. */
  .lane {
    view-transition-name: epiduck;
  }

  /* The bob of a duck on water: the one loop he runs while awake. */
  @media (prefers-reduced-motion: no-preference) {
    .bob {
      animation: mascot-bob 2.3s ease-in-out infinite;
      transform-origin: 50% 85%;
    }
  }

  @keyframes mascot-bob {
    0%,
    100% {
      transform: translateY(0) rotate(-3deg);
    }
    50% {
      transform: translateY(-3px) rotate(3deg);
    }
  }
</style>
