<script lang="ts">
  import { cn } from '$lib/utils';

  type Props = {
    /** Resolved link target (e.g. resolve('/staff/dev')). */
    href: string;
    /** Small label next to/under the wordmark — role label, "Admin", … */
    sublabel?: string;
    /** Campus name, shown as a mono caption (stacked orientation only). */
    campus?: string | null;
    /** One-line reminder of the tool's purpose (stacked orientation only). */
    tagline?: string;
    /** Accent for the underscore + sublabel. */
    accent?: 'teal' | 'pink';
    /**
     * Chrome tone:
     * - `dark`: always-dark surfaces (sidebar, admin header) → white logo.
     * - `auto`: theme-following surfaces (mobile top bars) → blue logo, white in dark.
     */
    tone?: 'dark' | 'auto';
    orientation?: 'stacked' | 'inline';
    class?: string;
  };

  let {
    href,
    sublabel,
    campus = null,
    tagline,
    accent = 'teal',
    tone = 'dark',
    orientation = 'stacked',
    class: className,
  }: Props = $props();

  // The brand asset is solid Epitech blue; recolor with filters per chrome tone.
  const logoTone = $derived(
    tone === 'dark' ? 'brightness-0 invert' : 'dark:brightness-0 dark:invert',
  );
  const textTone = $derived(tone === 'dark' ? 'text-white' : 'text-foreground');
  // Neon green is unreadable on the light mobile bar — fall back to the solid
  // teal there and only go neon on dark.
  const accentTone = $derived(
    accent === 'pink'
      ? 'text-epi-pink'
      : tone === 'dark'
        ? 'text-epi-teal'
        : 'text-epi-teal-solid dark:text-epi-teal',
  );
</script>

{#if orientation === 'stacked'}
  <a {href} class={cn('flex flex-col gap-4 px-4 py-4', textTone, className)}>
    <img
      src="/EPITECH-LOGO-BLEU-2025.svg"
      alt="Epitech"
      class={cn('h-7 w-auto self-start', logoTone)}
    />
    <div class="flex flex-col gap-1.5">
      <span class="flex items-baseline gap-2">
        <span class="font-heading text-sm leading-none">
          Jump<span class={accentTone}>_</span>
        </span>
        {#if sublabel}
          <span
            class={cn(
              'truncate text-[11px] font-bold tracking-wider uppercase',
              accentTone,
            )}
          >
            {sublabel}
          </span>
        {/if}
      </span>
      {#if tagline}
        <span class="text-[11px] leading-tight text-sidebar-foreground-muted">
          {tagline}
        </span>
      {/if}
      {#if campus}
        <span
          class="truncate font-mono text-[10px] tracking-widest text-sidebar-foreground-muted uppercase"
        >
          Campus {campus}
        </span>
      {/if}
    </div>
  </a>
{:else}
  <a {href} class={cn('flex items-center gap-2.5', textTone, className)}>
    <img
      src="/EPITECH-LOGO-BLEU-2025.svg"
      alt="Epitech"
      class={cn('h-6 w-auto shrink-0', logoTone)}
    />
    <span class="font-heading text-base leading-none">
      Jump<span class={accentTone}>_</span>
    </span>
    {#if sublabel}
      <span
        class={cn('text-[10px] font-bold tracking-wider uppercase', accentTone)}
      >
        {sublabel}
      </span>
    {/if}
  </a>
{/if}
