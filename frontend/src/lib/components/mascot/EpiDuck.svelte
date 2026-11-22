<!--
  EpiDuck, drawn (#539): one still frame of the duck, in profile or facing the
  reader, wearing the talent's accessories. It moves nothing by itself; whoever
  places it (the header's lane, the questionnaire avatar, the settings preview)
  decides where it is and when it blinks or looks somewhere.

  He is modelled in Blender (`frontend/scripts/epiduck/build.py`), which renders
  each layer once into one atlas (`art/epiduck.webp`) and says where each layer
  sits in it (`art/epiduck.json`). This component stacks the layers he wears in
  the order the script rendered them for: body, scarf, pupils or lids, glasses,
  hair. One picture holds every layer, so a duck is never drawn half dressed
  while the rest arrives, and changing his scarf loads nothing.

  His eyes are layers too: a blink swaps the pupils for the lids, a look moves
  the pupils within the eye. The white sticker outline goes round the whole
  stack (one SVG filter), so it follows whatever he wears.

  In profile the duck faces right; mirror the element to face left.

  Props:
    pose        'side' (profile, facing right) or 'front'.
    look        the accessories; the name is not drawn.
    eyesClosed  a blink, or a sleeping duck.
    gaze        where the pupils look, each axis from -1 to 1.
    class       its size, set by the caller.
-->
<script lang="ts">
  import type { MascotLook } from '#lib/domain/mascot.ts';
  import atlasUrl from './art/epiduck.webp';
  import ATLAS from './art/epiduck.json';
  import { DUCK } from './art/palette.ts';

  type Layer = keyof typeof ATLAS.poses.side.cells;

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

  // Two ducks can share a page (the settings preview draws both poses).
  const uid = $props.id();
  const outlineId = `epiduck-outline-${uid}`;

  const clamp = (v: number) => Math.max(-1, Math.min(1, v));

  let cell = $derived(ATLAS.poses[pose]);
  let layers = $derived(
    [
      'body',
      look.scarf === 'none' ? null : `scarf.${look.scarf}`,
      eyesClosed ? 'lids' : 'pupils',
      look.glasses === 'none' ? null : `glasses.${look.glasses}`,
      `hair.${look.hair}`,
    ].filter((layer): layer is Layer => layer !== null),
  );
  let pupil = $derived({
    x: clamp(gaze.x) * cell.pupilTravel.x,
    y: clamp(gaze.y) * cell.pupilTravel.y,
  });
</script>

<svg
  viewBox="0 0 {cell.width} {cell.height}"
  class={className}
  aria-hidden="true"
  overflow="visible"
>
  <defs>
    <!-- Grow his silhouette, round it off, paint it white, put him on top. -->
    <filter
      id={outlineId}
      x="-5%"
      y="-5%"
      width="110%"
      height="110%"
      color-interpolation-filters="sRGB"
    >
      <feMorphology
        in="SourceAlpha"
        operator="dilate"
        radius={ATLAS.outline * 0.6}
      />
      <feGaussianBlur stdDeviation={ATLAS.outline * 0.3} />
      <feComponentTransfer result="ring">
        <feFuncA type="linear" slope="6" intercept="-1.2" />
      </feComponentTransfer>
      <feFlood flood-color={DUCK.outline} />
      <feComposite in2="ring" operator="in" />
      <feMerge>
        <feMergeNode />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>
  <g filter="url(#{outlineId})">
    {#each layers as layer (layer)}
      <svg
        x={layer === 'pupils' ? pupil.x : 0}
        y={layer === 'pupils' ? pupil.y : 0}
        width={cell.width}
        height={cell.height}
        viewBox="{cell.cells[layer]} {cell.y} {cell.width} {cell.height}"
      >
        <image href={atlasUrl} width={ATLAS.width} height={ATLAS.height} />
      </svg>
    {/each}
  </g>
</svg>
