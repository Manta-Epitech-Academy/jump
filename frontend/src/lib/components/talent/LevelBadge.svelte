<!--
  A talent's level as the 2027 mockup draws it: a hexagon in the level's colour,
  an inner ring, and a star. The level decides its own colours (`LevelTone`, set
  with its threshold in `domain/xp.ts`), so the badge never chooses one.

  The ring and the star are the pair that reads on each fill: dark on the neon,
  white on the coral, the magenta and the blue, neon on the near-black of the
  top level. The badge is drawn in brand colours that do not change with the
  theme: it is an emblem, like the logo, not a surface.
-->
<script lang="ts">
  import type { LevelTone } from '$lib/domain/xp';
  import { cn } from '$lib/utils';

  let {
    level,
    tone,
    class: className,
  }: { level: string; tone: LevelTone; class?: string } = $props();

  const colours: Record<
    LevelTone,
    { fill: string; ring: string; star: string }
  > = {
    tech: {
      fill: 'fill-epi-tech',
      ring: 'stroke-epi-dark',
      star: 'fill-epi-dark stroke-epi-dark',
    },
    together: {
      fill: 'fill-epi-together',
      ring: 'stroke-white',
      star: 'fill-white stroke-white',
    },
    tomorrow: {
      fill: 'fill-epi-tomorrow',
      ring: 'stroke-white',
      star: 'fill-white stroke-white',
    },
    blue: {
      fill: 'fill-epi-blue',
      ring: 'stroke-epi-tech',
      star: 'fill-white stroke-white',
    },
    dark: {
      fill: 'fill-epi-dark',
      ring: 'stroke-epi-tech',
      star: 'fill-epi-tech stroke-epi-tech',
    },
  };

  const colour = $derived(colours[tone]);
</script>

<svg
  viewBox="14 6 60 68"
  role="img"
  aria-label="Badge du niveau {level}"
  class={cn('h-16 w-auto shrink-0', className)}
>
  <path d="M44 8l28 16v32L44 72 16 56V24z" class={colour.fill} />
  <path
    d="M44 15l22 12.5v25L44 65 22 52.5v-25z"
    fill="none"
    stroke-width="2.5"
    class={colour.ring}
  />
  <path
    d="M44 27l3.41 9.31 9.9.36-7.79 6.12 2.71 9.54L44 46.8l-8.23 5.53 2.71-9.54-7.79-6.12 9.9-.36z"
    stroke-width="1.5"
    stroke-linejoin="round"
    class={colour.star}
  />
</svg>
