<script lang="ts">
  import { cn } from '$lib/utils';
  import EpitechLogo from './EpitechLogo.svelte';
  import TitleCursor from './TitleCursor.svelte';

  type Props = {
    /** Resolved link target (e.g. resolve('/staff/dev')). */
    href: string;
    /** Small label next to/under the wordmark, role label, "Admin", … */
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

  const textTone = $derived(tone === 'dark' ? 'text-white' : 'text-foreground');
  // The sublabel carries the space accent. The `_` no longer does: it means
  // "terminal", not "which space am I in", so it is always the tech green (see
  // TitleCursor). Neon is unreadable on the light mobile bar, hence the ink
  // fallback there and neon only on a surface that is always dark.
  const accentTone = $derived(
    accent === 'pink'
      ? 'text-epi-tomorrow'
      : tone === 'dark'
        ? 'text-epi-tech'
        : 'text-epi-tech-ink dark:text-epi-tech',
  );
</script>

{#if orientation === 'stacked'}
  <a {href} class={cn('flex flex-col gap-4 px-4 py-4', textTone, className)}>
    <EpitechLogo {tone} class="h-7 w-auto self-start" />
    <div class="flex flex-col gap-1.5">
      <span class="flex items-baseline gap-2">
        <span class="font-heading text-display-s">
          Jump<TitleCursor />
        </span>
        {#if sublabel}
          <span class={cn('truncate epi-overline', accentTone)}>
            {sublabel}
          </span>
        {/if}
      </span>
      {#if tagline}
        <span class="text-xs leading-tight text-chrome-foreground-muted">
          {tagline}
        </span>
      {/if}
      {#if campus}
        <span class="truncate epi-overline text-chrome-foreground-muted">
          Campus {campus}
        </span>
      {/if}
    </div>
  </a>
{:else}
  <a {href} class={cn('flex items-center gap-2.5', textTone, className)}>
    <EpitechLogo {tone} class="h-6 w-auto shrink-0" />
    <span class="font-heading text-display-s">
      Jump<TitleCursor />
    </span>
    {#if sublabel}
      <span class={cn('epi-overline', accentTone)}>
        {sublabel}
      </span>
    {/if}
  </a>
{/if}
