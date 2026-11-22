<!--
  EpiDuck, drawn (#539): one still frame of the duck, in profile or facing the
  reader, wearing the talent's accessories. It moves nothing by itself; whoever
  places it (the header's lane, the questionnaire avatar, the settings preview)
  decides where it is and when it blinks or looks somewhere.

  The paths are the mockup's sprites, redrawn as layers in the order the sprite
  sheets stack them: body, scarf, glasses, hair. In profile the duck faces
  right; mirror the element to face left. Colours come from `art/palette.ts`
  and nowhere else.

  Props:
    pose        'side' (profile, facing right) or 'front'.
    look        the accessories; the name is not drawn.
    eyesClosed  a blink, or a sleeping duck.
    gaze        where the pupils look, each axis from -1 to 1.
    class       its size, set by the caller.
-->
<script lang="ts">
  import type { MascotLook } from '#lib/domain/mascot.ts';
  import { DUCK } from './art/palette';

  let {
    pose,
    look,
    eyesClosed = false,
    gaze = { x: 0, y: 0 },
    class: className,
  }: {
    pose: 'side' | 'front';
    look: Pick<MascotLook, 'glasses' | 'scarf' | 'hair'>;
    eyesClosed?: boolean;
    gaze?: { x: number; y: number };
    class?: string;
  } = $props();

  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  // How far a pupil travels inside its eye, in the drawing's own units.
  let pupil = $derived({ x: clamp(gaze.x) * 1.1, y: clamp(gaze.y) * 0.9 });
  let scarf = $derived(look.scarf === 'none' ? null : DUCK.scarf[look.scarf]);
</script>

{#if pose === 'side'}
  <svg
    viewBox="-1.5 -3 49 45"
    class={className}
    aria-hidden="true"
    overflow="visible"
  >
    <g
      fill={DUCK.outline}
      stroke={DUCK.outline}
      stroke-width="3"
      stroke-linejoin="round"
    >
      <path
        d="M4 22c0-2 2-3 4-2 3 1 6 1 10 0 0-6 4-12 11-12 6 0 10 4 10 9 0 3-1 5-3 6 3 1 6 4 6 8 0 6-8 9-19 9C10 40 4 33 4 22z"
      />
      <path
        d="M27.5 9C26.5 5 28.5 2 32 2.4 29.8 3.8 30.6 5.4 33 5.8 30.8 7 29.2 8 27.5 9z"
      />
      <path d="M38 14.5c3.4-.2 6.6 1 7.4 3.2-1.2 2.3-4.6 3.2-7.4 2.2z" />
    </g>
    <path
      d="M4 22c0-2 2-3 4-2 3 1 6 1 10 0 0-6 4-12 11-12 6 0 10 4 10 9 0 3-1 5-3 6 3 1 6 4 6 8 0 6-8 9-19 9C10 40 4 33 4 22z"
      fill={DUCK.body}
    />
    <path
      d="M27.5 9C26.5 5 28.5 2 32 2.4 29.8 3.8 30.6 5.4 33 5.8 30.8 7 29.2 8 27.5 9z"
      fill={DUCK.body}
    />
    <path
      d="M12 26c4 3.5 11 3.5 15 0-1 5.5-6.5 7.5-10.5 6.5-3-.5-4.5-3.5-4.5-6.5z"
      fill={DUCK.wing}
    />
    <path
      d="M38 14.5c3.4-.2 6.6 1 7.4 3.2-1.2 2.3-4.6 3.2-7.4 2.2z"
      fill={DUCK.beak}
    />
    <path
      d="M38.4 18.6c2.6.7 5.4.3 7-.9-1.2 2.3-4.6 3.2-7 2.2z"
      fill={DUCK.beakShade}
    />
    {#if eyesClosed}
      <path
        d="M29 13c1.6 1.4 4.4 1.4 6 0"
        fill="none"
        stroke={DUCK.pupil}
        stroke-width="1.2"
        stroke-linecap="round"
      />
    {:else}
      <circle cx="32" cy="12.6" r="3.5" fill={DUCK.eyeWhite} />
      <g transform="translate({pupil.x} {pupil.y})">
        <circle cx="33.1" cy="13" r="1.9" fill={DUCK.pupil} />
        <circle cx="32.6" cy="12.3" r="0.6" fill={DUCK.eyeWhite} />
      </g>
    {/if}

    {#if scarf}
      <path
        d="M19.5 21.5c5 2.2 11 2.6 17 1.2l.8 3.8c-6.2 1.6-12.6 1.2-18.6-1.4z"
        fill={scarf}
      />
      <path d="M22.5 24.5l-2.6 8 3.2.8 2.4-8z" fill={scarf} />
      <path
        d="M24 22.6l-.8 3.6M29 23.3l-.4 3.6M34 23.1l.2 3.6"
        stroke={DUCK.scarfStripe}
        stroke-width="0.9"
      />
    {/if}

    {#if look.glasses === 'round'}
      <circle
        cx="32.4"
        cy="12.6"
        r="4.6"
        fill="none"
        stroke={DUCK.ink}
        stroke-width="1.3"
      />
      <path
        d="M27.8 12.2L21 10.5"
        stroke={DUCK.ink}
        stroke-width="1.3"
        stroke-linecap="round"
      />
    {:else if look.glasses === 'sun'}
      <path
        d="M27.6 10.2h9.8v3.4a4 4 0 0 1-4 4h-1.8a4 4 0 0 1-4-4z"
        fill={DUCK.ink}
      />
      <path
        d="M27.6 11L21 10"
        stroke={DUCK.ink}
        stroke-width="1.3"
        stroke-linecap="round"
      />
    {:else if look.glasses === 'geek'}
      <rect
        x="27.6"
        y="9.4"
        width="9.8"
        height="6.6"
        rx="1.2"
        fill={DUCK.lensTint}
        stroke={DUCK.ink}
        stroke-width="1.8"
      />
      <path
        d="M27.6 11.5L21 10"
        stroke={DUCK.ink}
        stroke-width="1.6"
        stroke-linecap="round"
      />
    {/if}

    {#if look.hair === 'crest'}
      <path
        d="M22 9.5l1.6-6.5 2.6 4.2 1.8-6.4 2.6 5.4 2.2-5.2 1.6 7c-4-2.6-9.6-2.4-12.4 1.5z"
        fill={DUCK.crest}
      />
    {:else if look.hair === 'fringe'}
      <path
        d="M20.5 13c1-6 6-9.5 12-8.5 4 .7 6.5 3.5 7 7-3-3-7-3.6-10-2.4-3 1.2-6 2.6-9 3.9z"
        fill={DUCK.fringe}
      />
    {:else if look.hair === 'beanie'}
      <path
        d="M20 10.2c0-5.8 4.3-9.5 9.5-9.5s9.5 3.7 9.5 9.5z"
        fill={DUCK.beanie}
      />
      <rect
        x="19"
        y="8.2"
        width="21"
        height="3.4"
        rx="1.7"
        fill={DUCK.beanieTrim}
      />
      <circle cx="29.5" cy="0.4" r="2.4" fill={DUCK.beanieTrim} />
    {/if}
  </svg>
{:else}
  <svg
    viewBox="-3 -6 66 73"
    class={className}
    aria-hidden="true"
    overflow="visible"
  >
    <g
      fill={DUCK.outline}
      stroke={DUCK.outline}
      stroke-width="4"
      stroke-linejoin="round"
    >
      <path d="M27 9C26 4 29 1 33 2 30 4 31 6 34 7 31 8 29 9 27 9z" />
      <circle cx="30" cy="20" r="14" />
      <path d="M9 38C3 37 2 46 8 49L15 46z" />
      <path d="M51 38C57 37 58 46 52 49L45 46z" />
      <ellipse cx="30" cy="46" rx="17" ry="15" />
    </g>
    <g fill={DUCK.body}>
      <path d="M27 9C26 4 29 1 33 2 30 4 31 6 34 7 31 8 29 9 27 9z" />
      <circle cx="30" cy="20" r="14" />
      <path d="M9 38C3 37 2 46 8 49L15 46z" />
      <path d="M51 38C57 37 58 46 52 49L45 46z" />
      <ellipse cx="30" cy="46" rx="17" ry="15" />
    </g>
    {#if eyesClosed}
      <path
        d="M21.5 18.4c1.8 1.5 4.2 1.5 6 0M32.5 18.4c1.8 1.5 4.2 1.5 6 0"
        fill="none"
        stroke={DUCK.pupil}
        stroke-width="1.4"
        stroke-linecap="round"
      />
    {:else}
      <circle cx="24.5" cy="18" r="4.4" fill={DUCK.eyeWhite} />
      <circle cx="35.5" cy="18" r="4.4" fill={DUCK.eyeWhite} />
      <g transform="translate({pupil.x} {pupil.y})">
        <circle cx="25.6" cy="18.6" r="2.3" fill={DUCK.pupil} />
        <circle cx="34.4" cy="18.6" r="2.3" fill={DUCK.pupil} />
        <circle cx="25" cy="18" r="0.7" fill={DUCK.eyeWhite} />
        <circle cx="33.8" cy="18" r="0.7" fill={DUCK.eyeWhite} />
      </g>
    {/if}
    <ellipse cx="30" cy="25.8" rx="6.2" ry="2.6" fill={DUCK.beakShade} />
    <ellipse cx="30" cy="24.6" rx="6.6" ry="3.4" fill={DUCK.beak} />

    {#if scarf}
      <path
        d="M14 31c10 4 22 4 32 0l1.2 4.6c-11 4.4-23.4 4.4-34.4 0z"
        fill={scarf}
      />
      <path d="M36 35l2.6 9.5 3.8-1-2.2-9.6z" fill={scarf} />
      <path
        d="M20 33.2l-.6 4M26 34.2l-.3 4M32 34.4l0 4M38 33.8l.4 4"
        stroke={DUCK.scarfStripe}
        stroke-width="1"
      />
    {/if}

    {#if look.glasses === 'round'}
      <circle
        cx="24.5"
        cy="18"
        r="5.6"
        fill="none"
        stroke={DUCK.ink}
        stroke-width="1.6"
      />
      <circle
        cx="35.5"
        cy="18"
        r="5.6"
        fill="none"
        stroke={DUCK.ink}
        stroke-width="1.6"
      />
      <path
        d="M18.9 17L16.4 16M41.1 17l2.5-1"
        stroke={DUCK.ink}
        stroke-width="1.6"
        stroke-linecap="round"
      />
    {:else if look.glasses === 'sun'}
      <path
        d="M17.8 15h11v3.4a4.4 4.4 0 0 1-4.4 4.4h-2.2a4.4 4.4 0 0 1-4.4-4.4zM31.2 15h11v3.4a4.4 4.4 0 0 1-4.4 4.4h-2.2a4.4 4.4 0 0 1-4.4-4.4z"
        fill={DUCK.ink}
      />
      <path
        d="M28.8 16h2.4M17.8 16l-2 -1M42.2 16l2-1"
        stroke={DUCK.ink}
        stroke-width="1.6"
        stroke-linecap="round"
      />
    {:else if look.glasses === 'geek'}
      <rect
        x="18.6"
        y="13.4"
        width="10.8"
        height="9"
        rx="1.6"
        fill={DUCK.lensTint}
        stroke={DUCK.ink}
        stroke-width="2.2"
      />
      <rect
        x="30.6"
        y="13.4"
        width="10.8"
        height="9"
        rx="1.6"
        fill={DUCK.lensTint}
        stroke={DUCK.ink}
        stroke-width="2.2"
      />
      <path d="M29.4 17h1.2" stroke={DUCK.ink} stroke-width="2.2" />
    {/if}

    {#if look.hair === 'crest'}
      <path
        d="M24.5 8l1.2-9 2.4 6 1.9-8 1.9 8 2.4-6 1.2 9c-3.6-1.6-7.4-1.6-11 0z"
        fill={DUCK.crest}
      />
    {:else if look.hair === 'fringe'}
      <path
        d="M17 17c-1-8 5-13.5 13-13.5 7 0 11.5 4.5 12.5 9.5-4-3.4-9-4.4-13.5-3-4 1.2-8.5 3.6-12 7z"
        fill={DUCK.fringe}
      />
    {:else if look.hair === 'beanie'}
      <path d="M16 12c0-8 6.2-13 14-13s14 5 14 13z" fill={DUCK.beanie} />
      <rect
        x="14.5"
        y="9.4"
        width="31"
        height="4.2"
        rx="2.1"
        fill={DUCK.beanieTrim}
      />
      <circle cx="30" cy="-2" r="3" fill={DUCK.beanieTrim} />
    {/if}
  </svg>
{/if}
