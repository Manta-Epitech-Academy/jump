<script lang="ts">
  import { fade } from 'svelte/transition';
  import EpitechLogo from '$lib/components/layout/EpitechLogo.svelte';

  // Full-screen "ceremony" overlay for long-running, once-in-a-while staff
  // actions (the first being the end-of-stage diploma generation, ~15-20s on a
  // big campus). A bare spinner left staff fearing the request had hung; this
  // turns the wait into a warm, branded beat instead.
  //
  // Visual language is the Epitech dev ("sales") chrome, lifted straight from
  // LoginBrandPanel: full-bleed epi-blue, blueprint grid, pixel-square
  // signature, Anton display title, Space Mono overline, neon-teal accent.
  // Flat and professional, never a soft generic loader. The blue surface is
  // theme-independent on purpose (like the sidebar / login panel) - it stays on
  // brand in both light and dark instead of bleeding into the page palette.
  //
  // Deliberately generic so it can wrap any slow action: the caller owns the
  // copy (title + rotating messages). The component owns the chrome, the message
  // rotation, and a minimum display time so it never flashes awkwardly when the
  // work finishes near-instantly (small campuses).
  //
  // Accessibility: the text block is a polite live region (announces the title
  // once, then each rotated message). It is not a dialog - no focus trap, no
  // aria-modal, nothing hidden from the rest of the page - so screen readers
  // and keyboard users are never blocked while it shows.
  type Props = {
    /** Whether the action is in flight. The overlay honours `minDurationMs`
     *  before it actually hides once this flips back to false. */
    open: boolean;
    /** Headline (Anton, auto-uppercased), e.g. "Génération de 246 diplômes". */
    title: string;
    /** Reassurance lines cycled every `rotateMs` while open. */
    messages?: string[];
    /** Floor on how long the overlay stays up, so quick work doesn't flash. */
    minDurationMs?: number;
    /** Cadence of the rotating messages. */
    rotateMs?: number;
  };

  let {
    open,
    title,
    messages = [],
    minDurationMs = 3500,
    rotateMs = 2600,
  }: Props = $props();

  // What's actually painted. Tracks `open` but lingers until the minimum beat
  // has elapsed. `openedAt` is plain (non-reactive) on purpose: it must not
  // re-trigger the effect, which would loop on its own write.
  let visible = $state(false);
  let openedAt = 0;

  $effect(() => {
    if (open) {
      openedAt = Date.now();
      visible = true;
      return;
    }
    // Closing: hold the remainder of the minimum beat, then drop.
    const remaining = Math.max(0, minDurationMs - (Date.now() - openedAt));
    const id = setTimeout(() => (visible = false), remaining);
    return () => clearTimeout(id);
  });

  let messageIndex = $state(0);

  $effect(() => {
    if (!visible || messages.length <= 1) {
      messageIndex = 0;
      return;
    }
    const id = setInterval(() => {
      messageIndex = (messageIndex + 1) % messages.length;
    }, rotateMs);
    return () => clearInterval(id);
  });

  const currentMessage = $derived(
    messages.length ? messages[messageIndex % messages.length] : '',
  );

  // Pixel-square loader — the brand signature motif, staggered so it shimmers
  // left to right. Delays are full literal classes so Tailwind's scanner keeps
  // them (an interpolated `[animation-delay:{n}ms]` would never be generated).
  const PIXEL_DELAYS = [
    '[animation-delay:0ms]',
    '[animation-delay:120ms]',
    '[animation-delay:240ms]',
    '[animation-delay:360ms]',
    '[animation-delay:480ms]',
  ];
</script>

{#if visible}
  <div
    class="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-[#013afb] px-6 text-center text-white"
    transition:fade={{ duration: 200 }}
  >
    <!-- Blueprint grid texture (same as the login brand panel). -->
    <div
      aria-hidden="true"
      class="absolute inset-0 bg-[image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[size:32px_32px]"
    ></div>
    <!-- Pixel overlays — offset squares, the brand signature. -->
    <div aria-hidden="true" class="absolute inset-0">
      <div
        class="absolute top-[16%] right-[20%] h-16 w-24 bg-white/10 motion-safe:animate-pulse"
      ></div>
      <div
        class="absolute top-[22%] right-[11%] h-20 w-16 bg-white/[0.06]"
      ></div>
      <div
        class="absolute bottom-[20%] left-[12%] h-14 w-20 bg-epi-teal/15 motion-safe:animate-pulse"
      ></div>
      <div
        class="absolute bottom-[30%] left-[21%] h-10 w-10 bg-white/[0.06]"
      ></div>
    </div>

    <div class="relative z-10 flex flex-col items-center gap-10">
      <!-- Always-dark brand surface → white logo, Jump_ demoted to a caption. -->
      <div class="flex flex-col items-center gap-3">
        <EpitechLogo tone="dark" class="h-8 w-auto" />
        <span class="font-mono text-xs tracking-widest text-white/60 uppercase">
          Jump<span class="text-epi-teal">_</span>
        </span>
      </div>

      <!-- Live region: mono overline (rotating step) + Anton display title. -->
      <div class="space-y-4" role="status" aria-live="polite">
        {#if currentMessage}
          <p
            class="font-mono text-xs tracking-widest text-epi-teal uppercase lg:text-sm"
          >
            {currentMessage}
          </p>
        {/if}
        <h2
          class="max-w-2xl font-heading text-3xl leading-[1.1] tracking-wide lg:text-5xl"
        >
          {title}
        </h2>
      </div>

      <!-- Pixel loader. -->
      <div class="flex items-center gap-1.5" aria-hidden="true">
        {#each PIXEL_DELAYS as delay}
          <div
            class="h-2.5 w-2.5 bg-epi-teal motion-safe:animate-pulse {delay}"
          ></div>
        {/each}
      </div>
    </div>

    <!-- Brand signature, straight from the login panel. -->
    <div
      aria-hidden="true"
      class="absolute bottom-8 font-mono text-xs text-white/50"
    >
      <span class="text-epi-teal">&#123;</span>
      &lt;Tech Together Tomorrow&gt;
      <span class="text-epi-teal">&#125;</span>
      <span class="ml-2 tracking-widest uppercase">Since 1999</span>
    </div>
  </div>
{/if}
