<script lang="ts">
  import { cn } from '$lib/utils';

  type Props = {
    /**
     * Chrome tone — the asset ships solid Epitech blue, recolored per surface:
     * - `dark`: always-dark surfaces (sidebar, admin header) → white logo.
     * - `auto`: theme-following surfaces (login, mobile bars) → blue, white in dark.
     */
    tone?: 'dark' | 'auto';
    /** Sizing / positioning utilities — the consumer owns the box. */
    class?: string;
  };

  let { tone = 'auto', class: className }: Props = $props();

  const toneFilter = $derived(
    tone === 'dark' ? 'brightness-0 invert' : 'dark:brightness-0 dark:invert',
  );
</script>

<img
  src="/EPITECH-LOGO-BLEU-2025.svg"
  alt="Epitech"
  class={cn(toneFilter, className)}
/>
