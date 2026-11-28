<script lang="ts">
  import { badgeStickerSvg } from '#lib/domain/badges.ts';
  import { pickLine } from '#lib/domain/pickLine.ts';
  import { cn } from '#lib/utils.ts';

  // One badge's sticker, as the 2027 mockup's Epidex draws it (#551): earned,
  // in its colours, tilted a little and lifted by a shadow, the way a sticker
  // sits on a page; still to earn, its silhouette, so the talent sees there is
  // something to find without being shown what: black on the light page as
  // the mockup has it, and white on the dark one, where black would vanish.
  // The drawing is the PO's, the frame is `badgeStickerSvg`, and the two
  // states are classes here, as the preview an admin is shown restates them
  // (`badgeStickerPreview.ts`).
  let {
    badgeKey,
    art,
    earned,
    class: className,
  }: {
    badgeKey: string;
    art: string;
    earned: boolean;
    class?: string;
  } = $props();

  // A tilt per badge, held by its key (`pickLine`, the rule every rotation in
  // Jump follows), so a sticker leans the same way on every visit.
  const TILTS = [
    '-rotate-5',
    'rotate-3',
    '-rotate-2',
    'rotate-6',
    '-rotate-4',
    'rotate-2',
    'rotate-4',
  ];
  const tilt = $derived(pickLine(TILTS, badgeKey));
</script>

<span
  aria-hidden="true"
  class={cn(
    'block size-16 shrink-0 [&_svg]:size-full',
    earned
      ? [tilt, 'drop-shadow-[0_2px_3px_rgb(11_13_20/0.28)]']
      : 'opacity-12 brightness-0 dark:invert',
    className,
  )}
>
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- screened at write by screenBadgeArt (server/badgeArtSanitize.ts): stored as written or not at all -->
  {@html badgeStickerSvg(art)}
</span>
