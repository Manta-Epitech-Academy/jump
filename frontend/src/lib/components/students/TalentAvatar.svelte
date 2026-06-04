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
  class={cn('rounded-full object-cover', SIZE_CLASS[size], className)}
  loading="lazy"
  decoding="async"
/>
