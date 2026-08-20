<script lang="ts">
  import { cn } from '$lib/utils';
  import { talentGround } from './talentAvatar';

  /**
   * A talent's monogram, drawn locally.
   *
   * It used to be an `<img>` from `avatar.vercel.sh`, which meant every table
   * row sent a talent's id and initials to a third party. Our users are minors,
   * so that is not a trade we make for a gradient; it also cost one network
   * request per row on pages that render two hundred of them, and it put
   * vercel's palette next to Epitech's.
   *
   * The grounds and the reason there are seven of them live in `talentAvatar.ts`.
   */
  type Size = 'sm' | 'md' | 'lg';

  let {
    talent,
    size = 'md',
    class: className,
  }: {
    talent: { id: string; nom?: string | null; prenom?: string | null };
    size?: Size;
    class?: string;
  } = $props();

  // Box only. The glyph is sized as a fraction of the box via a container query
  // below, because consumers legitimately override the box for a responsive
  // hero (`sm:h-24 md:h-28`) and a fixed font-size then leaves a 16px monogram
  // floating in a 112px square.
  const SIZE_CLASS: Record<Size, string> = {
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-16 w-16',
  };

  // Firstname-first monogram (Jean Dupont -> "JD"), matching how names read.
  const initials = $derived(
    `${talent.prenom?.[0] ?? ''}${talent.nom?.[0] ?? ''}`.toUpperCase() || '?',
  );
  const label = $derived(`${talent.prenom ?? ''} ${talent.nom ?? ''}`.trim());
</script>

<span
  role="img"
  aria-label={label || 'Talent'}
  class={cn(
    // A fixed-size element that must never be squished: `shrink-0` covers a
    // flex row, and the explicit size classes hold in a width-starved
    // `table-auto` column.
    '@container inline-flex shrink-0 items-center justify-center rounded-full font-bold select-none',
    talentGround(talent.id),
    SIZE_CLASS[size],
    className,
  )}
>
  <!-- `leading-none` as well as the container size: with an inherited 1.5 line
       height the glyph's line box is taller than its caps, so centring the box
       leaves the letters sitting visibly high in the circle. -->
  <span class="text-[42cqw] leading-none">{initials}</span>
</span>
