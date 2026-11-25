<!--
  EpiDuck, drawn (#539): one still frame of the duck, in profile or facing the
  reader, wearing the talent's accessories. It moves nothing by itself; whoever
  places it (the header's lane, the questionnaire avatar, the settings preview)
  decides where it is and when it blinks or looks somewhere.

  He is modelled in Blender (`frontend/scripts/epiduck/build.py`), which renders
  each layer once into one atlas (`art/epiduck.webp`) and says where each layer
  sits in it (`art/epiduck.json`). This component stacks the layers he wears in
  the order the script rendered them for: body, scarf, eyes, glasses, hair. One
  picture holds every layer, so a duck is never drawn half dressed while the
  rest arrives, and changing his scarf loads nothing.

  A celebration draws him far larger than the header does (#540), so the script
  renders a second atlas of the same layers, facing the reader only
  (`art/epiduck-stage.webp`). It is fetched the first time a stage duck is
  drawn, never by the header.

  His eyes are layers too: a blink swaps the pupils for the lids, his joy for
  the eyes squeezed shut in an arch, and a look moves
  the pupils layer, clipped to the eye whites (their own cell, used only as a
  mask) so a pupil looking hard to one side meets the edge of its eye and never
  slides off it. The white sticker outline goes round the whole stack (one SVG
  filter), so it follows whatever he wears.

  In profile the duck faces right; mirror the element to face left.

  Props:
    pose        'side' (profile, facing right) or 'front'.
    atlas       'lane' (default), or 'stage' for a duck drawn large, which
                faces the reader only.
    look        the accessories; the name is not drawn.
    eyes        'open' (default), 'shut' (a blink, or asleep) or 'joy'.
    gaze        where the open pupils look, a point in the unit disc: its
                direction is where, its length how far towards the edge of the
                eye.
    class       its size, set by the caller.
-->
<script module lang="ts">
  import ATLAS from './art/epiduck.json';
  import STAGE_ATLAS from './art/epiduck-stage.json';
  import atlasUrl from './art/epiduck.webp';
  import stageAtlasUrl from './art/epiduck-stage.webp';

  /** How his eyes look: open (and aimed by `gaze`), shut, or squeezed in joy. */
  export type DuckEyes = 'open' | 'shut' | 'joy';

  const ATLASES = {
    lane: { manifest: ATLAS, url: atlasUrl },
    stage: { manifest: STAGE_ATLAS, url: stageAtlasUrl },
  };

  /** The stage atlas, for whoever wants it fetched before a scene opens. */
  export const STAGE_ATLAS_URL = stageAtlasUrl;

  /**
   * Where his eyes are on screen, for whoever aims his gaze: the near eye in
   * profile, between both facing the reader. `drawn` is the duck's own `<svg>`,
   * `mirrored` true when the caller flipped a profile to face left. Reads the
   * box as laid out, so it follows him while he swims, bobs and squashes.
   */
  export function eyesOnScreen(
    drawn: SVGSVGElement,
    pose: 'side' | 'front',
    mirrored = false,
  ): { x: number; y: number } {
    const cell = ATLAS.poses[pose];
    const box = drawn.getBoundingClientRect();
    // The drawing is fitted and centred in its box (`xMidYMid meet`).
    const scale = Math.min(box.width / cell.width, box.height / cell.height);
    const left = (box.width - cell.width * scale) / 2;
    const top = (box.height - cell.height * scale) / 2;
    const x = left + cell.eyes.x * scale;
    return {
      x: box.left + (mirrored ? box.width - x : x),
      y: box.top + top + cell.eyes.y * scale,
    };
  }
</script>

<script lang="ts">
  import type { MascotLook } from '#lib/domain/mascot.ts';
  import { DUCK } from './art/palette.ts';

  type Layer = keyof typeof ATLAS.poses.side.cells;

  let {
    pose,
    atlas = 'lane',
    look,
    eyes = 'open',
    gaze = { x: 0, y: 0 },
    class: className,
  }: (
    | { atlas?: 'lane'; pose: 'side' | 'front' }
    | { atlas: 'stage'; pose: 'front' }
  ) & {
    look: Pick<MascotLook, 'glasses' | 'scarf' | 'hair'>;
    eyes?: DuckEyes;
    gaze?: { x: number; y: number };
    class?: string;
  } = $props();

  // Two ducks can share a page (the settings preview draws both poses).
  const uid = $props.id();
  const outlineId = `epiduck-outline-${uid}`;
  const eyesId = `epiduck-eyes-${uid}`;

  let sheet = $derived(ATLASES[atlas]);
  let cell = $derived(
    atlas === 'stage' ? STAGE_ATLAS.poses.front : ATLAS.poses[pose],
  );
  const EYE_LAYERS = { open: 'pupils', shut: 'lids', joy: 'joy' } as const;
  let layers = $derived(
    [
      'body',
      look.scarf === 'none' ? null : `scarf.${look.scarf}`,
      EYE_LAYERS[eyes],
      look.glasses === 'none' ? null : `glasses.${look.glasses}`,
      `hair.${look.hair}`,
    ].filter((layer): layer is Layer => layer !== null),
  );
  // Held inside the unit disc, so a look into a corner goes as far as a look
  // to one side, not further.
  let pupil = $derived.by(() => {
    const reach = Math.max(1, Math.hypot(gaze.x, gaze.y));
    return {
      x: (gaze.x / reach) * cell.pupilTravel.x,
      y: (gaze.y / reach) * cell.pupilTravel.y,
    };
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
        radius={sheet.manifest.outline * 0.6}
      />
      <feGaussianBlur stdDeviation={sheet.manifest.outline * 0.3} />
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
    <mask
      id={eyesId}
      class="mask-type-alpha"
      maskUnits="userSpaceOnUse"
      x="0"
      y="0"
      width={cell.width}
      height={cell.height}
    >
      {@render atlasCell('eyes')}
    </mask>
  </defs>
  <g filter="url(#{outlineId})">
    {#each layers as layer (layer)}
      {#if layer === 'pupils'}
        <g mask="url(#{eyesId})">{@render atlasCell(layer, pupil)}</g>
      {:else}
        {@render atlasCell(layer)}
      {/if}
    {/each}
  </g>
</svg>

{#snippet atlasCell(layer: Layer, at = { x: 0, y: 0 })}
  <svg
    x={at.x}
    y={at.y}
    width={cell.width}
    height={cell.height}
    viewBox="{cell.cells[layer]} {cell.y} {cell.width} {cell.height}"
  >
    <image
      href={sheet.url}
      width={sheet.manifest.width}
      height={sheet.manifest.height}
    />
  </svg>
{/snippet}
