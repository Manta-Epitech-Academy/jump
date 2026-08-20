<script lang="ts" module>
  /**
   * Five on-brand grounds, every one of them at least 5.4:1 against white, so
   * the monogram is legible whichever one a talent lands on. Enough spread to
   * tell rows apart at a glance; not a rainbow.
   */
  const GROUNDS = [
    'bg-epi-blue',
    'bg-epi-tech-ink',
    'bg-epi-together-ink',
    'bg-epi-tomorrow-ink',
    'bg-epi-dark',
  ] as const;

  /**
   * Stable ground for a talent. Seeded on the id and not on the name, so the
   * avatar keeps its identity when a name is corrected, and so two talents who
   * share initials do not share a colour.
   */
  export function talentGround(id: string): string {
    let hash = 0;
    for (let i = 0; i < id.length; i++)
      hash = (hash * 31 + id.charCodeAt(i)) | 0;
    return GROUNDS[Math.abs(hash) % GROUNDS.length];
  }
</script>

<script lang="ts">
  import { cn } from '$lib/utils';

  /**
   * A talent's monogram, drawn locally.
   *
   * It used to be an `<img>` from `avatar.vercel.sh`, which meant every table
   * row sent a talent's id and initials to a third party. Our users are minors,
   * so that is not a trade we can make for a gradient; it also cost one network
   * request per row on pages that render two hundred of them, and it put
   * vercel's palette next to Epitech's.
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

  const SIZE_CLASS: Record<Size, string> = {
    sm: 'h-8 w-8 text-[0.625rem]',
    md: 'h-10 w-10 text-xs',
    lg: 'h-16 w-16 text-base',
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
    'inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white select-none',
    talentGround(talent.id),
    SIZE_CLASS[size],
    className,
  )}
>
  {initials}
</span>
