<script lang="ts" module>
  export function talentGradientUrl(t: {
    id: string;
    nom?: string | null;
    prenom?: string | null;
  }): string {
    // Firstname-first monogram (Jean Dupont -> "JD"), matching how names read.
    // Only the overlaid glyphs change: the gradient colour is seeded on `id`,
    // so initials order never alters a talent's avatar identity.
    const initials = `${t.prenom?.[0] ?? ''}${t.nom?.[0] ?? ''}`.toUpperCase();
    return `https://avatar.vercel.sh/${encodeURIComponent(t.id)}.svg?text=${encodeURIComponent(initials)}`;
  }
</script>

<script lang="ts">
  import { cn } from '$lib/utils';

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
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-16 w-16',
  };

  let alt = $derived(`${talent.prenom ?? ''} ${talent.nom ?? ''}`.trim());
</script>

<img
  src={talentGradientUrl(talent)}
  {alt}
  class={cn(
    // The avatar is a fixed-size element and must never be squished. Tailwind
    // preflight applies `max-width: 100%` to every img, so inside a width-starved
    // table-auto column (e.g. a sibling column set to `w-full`) it collapses to
    // 0. `max-w-none` drops that cap so the size class holds; `shrink-0` covers
    // the same risk in a flex row.
    'max-w-none shrink-0 rounded-full object-cover',
    SIZE_CLASS[size],
    className,
  )}
  loading="lazy"
  decoding="async"
/>
