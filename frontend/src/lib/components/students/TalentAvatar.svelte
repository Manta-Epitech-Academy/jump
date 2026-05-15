<script lang="ts" module>
  export function talentGradientUrl(t: {
    id: string;
    nom?: string | null;
    prenom?: string | null;
  }): string {
    const initials = `${t.nom?.[0] ?? ''}${t.prenom?.[0] ?? ''}`.toUpperCase();
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

  let alt = $derived(`${talent.nom ?? ''} ${talent.prenom ?? ''}`.trim());
</script>

<img
  src={talentGradientUrl(talent)}
  {alt}
  class={cn('rounded-full object-cover', SIZE_CLASS[size], className)}
  loading="lazy"
  decoding="async"
/>
