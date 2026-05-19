<script lang="ts" module>
  export type KpiTone = 'blue' | 'teal' | 'orange' | 'pink' | 'neutral';
</script>

<script lang="ts">
  import type { Component, Snippet } from 'svelte';
  import type { Icon as IconType } from '@lucide/svelte';
  import * as Card from '$lib/components/ui/card';
  import { InfoTooltip } from '$lib/components/ui/info-tooltip';
  import { cn } from '$lib/utils';

  type Props = {
    label: string;
    /** Short explainer rendered behind a ⓘ icon next to the label. */
    helpText?: string;
    /**
     * Big primary value. Pass a string (already formatted) or a number.
     * Use the `valueSnippet` prop for richer markup (e.g. "42 / 124").
     */
    value?: string | number;
    /** Optional denominator. Renders as `value/total`. */
    total?: number;
    /** Optional companion line under the value. */
    sub?: string;
    /** Lucide icon component for the right-side badge. Optional. */
    icon?: typeof IconType | Component;
    /** Progress bar value (0-100). Omit to hide the bar. */
    progress?: number;
    tone?: KpiTone;
    /** Anchor wrap; tile becomes a clickable link. */
    href?: string;
    /**
     * Filter mode: tile becomes a `<button>` with `aria-pressed`.
     * Mutually exclusive with `href`. Pair with `pressed` to mark active.
     */
    onclick?: () => void;
    /** Filter is currently active (only meaningful with `onclick`). */
    pressed?: boolean;
    /** Custom value renderer when a string/number isn't enough. */
    valueSnippet?: Snippet;
    /**
     * Body alignment. `left` (default) = label/value left, icon right.
     * `center` = stacked centred layout, value enlarged. Use in narrow
     * columns where the number is the headline.
     */
    align?: 'left' | 'center';
  };

  let {
    label,
    helpText,
    value,
    total,
    sub,
    icon,
    progress,
    tone = 'blue',
    href,
    onclick,
    pressed = false,
    valueSnippet,
    align = 'left',
  }: Props = $props();

  const isInteractive = $derived(Boolean(onclick) || Boolean(href));

  const toneAccent = $derived(
    tone === 'teal'
      ? 'border-l-epi-teal-solid'
      : tone === 'orange'
        ? 'border-l-epi-orange'
        : tone === 'pink'
          ? 'border-l-epi-pink'
          : tone === 'neutral'
            ? 'border-l-muted-foreground/40'
            : 'border-l-epi-blue',
  );

  const toneText = $derived(
    tone === 'teal'
      ? 'text-epi-teal-solid'
      : tone === 'orange'
        ? 'text-epi-orange'
        : tone === 'pink'
          ? 'text-epi-pink'
          : tone === 'neutral'
            ? 'text-muted-foreground'
            : 'text-epi-blue',
  );

  const toneBg = $derived(
    tone === 'teal'
      ? 'bg-epi-teal-solid/10'
      : tone === 'orange'
        ? 'bg-orange-50 dark:bg-orange-900/20'
        : tone === 'pink'
          ? 'bg-epi-pink/10'
          : tone === 'neutral'
            ? 'bg-muted/40'
            : 'bg-blue-50 dark:bg-blue-900/20',
  );

  const toneFill = $derived(
    tone === 'teal'
      ? 'bg-epi-teal-solid'
      : tone === 'orange'
        ? 'bg-epi-orange'
        : tone === 'pink'
          ? 'bg-epi-pink'
          : tone === 'neutral'
            ? 'bg-muted-foreground'
            : 'bg-epi-blue',
  );

  const Icon = $derived(icon);
</script>

{#snippet body()}
  {#if align === 'center'}
    <Card.Content
      class="flex flex-1 flex-col items-center justify-center gap-2 p-5 text-center"
    >
      <div class="flex items-center gap-2">
        {#if Icon}
          <div
            class={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-sm',
              pressed ? 'bg-white/15 text-white' : cn(toneBg, toneText),
            )}
          >
            <Icon class="h-5 w-5" />
          </div>
        {/if}
        <p
          class={cn(
            'text-xs font-bold tracking-widest uppercase',
            pressed ? 'text-white/70' : 'text-muted-foreground',
          )}
        >
          {label}
        </p>
        {#if helpText}
          <InfoTooltip
            text={helpText}
            iconClass={pressed ? 'text-white/70 hover:text-white' : ''}
          />
        {/if}
      </div>
      <div class="flex items-baseline justify-center gap-2">
        {#if valueSnippet}
          {@render valueSnippet()}
        {:else}
          <p
            class={cn(
              'font-heading text-8xl tracking-wide',
              pressed ? 'text-white' : toneText,
            )}
          >
            {value ?? '—'}{#if total != null}<span
                class={cn(
                  'ml-1 font-mono text-base font-bold',
                  pressed ? 'text-white/70' : 'text-muted-foreground',
                )}>/{total}</span
              >{/if}
          </p>
        {/if}
      </div>
      {#if sub}
        <p
          class={cn(
            'text-sm font-medium',
            pressed ? 'text-white/80' : 'text-muted-foreground',
          )}
        >
          {sub}
        </p>
      {/if}
      {#if typeof progress === 'number'}
        <div
          class={cn(
            'mt-1 h-1.5 w-full overflow-hidden rounded-full',
            pressed ? 'bg-white/20' : 'bg-muted dark:bg-muted/30',
          )}
        >
          <div
            class={cn(
              'h-full transition-[width] duration-700 ease-out',
              pressed ? 'bg-white' : toneFill,
            )}
            style="width: {Math.max(0, Math.min(100, progress))}%"
          ></div>
        </div>
      {/if}
    </Card.Content>
  {:else}
    <Card.Content class="flex flex-1 flex-col p-5">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0 flex-1">
          <div class="mb-1 flex items-center gap-1.5">
            <p
              class={cn(
                'text-[10px] font-bold tracking-widest uppercase',
                pressed ? 'text-white/70' : 'text-muted-foreground',
              )}
            >
              {label}
            </p>
            {#if helpText}
              <InfoTooltip
                text={helpText}
                iconClass={pressed ? 'text-white/70 hover:text-white' : ''}
              />
            {/if}
          </div>
          <div class="flex items-baseline gap-2">
            {#if valueSnippet}
              {@render valueSnippet()}
            {:else}
              <p
                class={cn(
                  'font-heading text-5xl tracking-wide',
                  pressed ? 'text-white' : toneText,
                )}
              >
                {value ?? '—'}{#if total != null}<span
                    class={cn(
                      'ml-1 font-mono text-base font-bold',
                      pressed ? 'text-white/70' : 'text-muted-foreground',
                    )}>/{total}</span
                  >{/if}
              </p>
            {/if}
          </div>
          {#if sub}
            <p
              class={cn(
                'mt-1 text-xs font-medium',
                pressed ? 'text-white/80' : 'text-muted-foreground',
              )}
            >
              {sub}
            </p>
          {/if}
        </div>
        {#if Icon}
          <div
            class={cn(
              'flex h-12 w-12 shrink-0 items-center justify-center rounded-sm',
              pressed ? 'bg-white/15 text-white' : cn(toneBg, toneText),
            )}
          >
            <Icon class="h-6 w-6" />
          </div>
        {/if}
      </div>
      <div class="mt-4 flex-1"></div>
      {#if typeof progress === 'number'}
        <div
          class={cn(
            'h-1.5 overflow-hidden rounded-full',
            pressed ? 'bg-white/20' : 'bg-muted dark:bg-muted/30',
          )}
        >
          <div
            class={cn(
              'h-full transition-[width] duration-700 ease-out',
              pressed ? 'bg-white' : toneFill,
            )}
            style="width: {Math.max(0, Math.min(100, progress))}%"
          ></div>
        </div>
      {/if}
    </Card.Content>
  {/if}
{/snippet}

{#snippet shell(extraClass: string)}
  <Card.Root
    class={cn(
      'flex h-full flex-col rounded-sm border-l-4 shadow-sm dark:shadow-none',
      pressed ? 'border-l-white/40 bg-epi-blue text-white' : toneAccent,
      isInteractive && !pressed
        ? 'transition-colors hover:border-epi-blue/60 hover:bg-muted/30'
        : '',
      pressed ? 'transition-colors hover:bg-[#0026b8]' : '',
      extraClass,
    )}
  >
    {@render body()}
  </Card.Root>
{/snippet}

{#if onclick}
  <button
    type="button"
    {onclick}
    aria-pressed={pressed}
    class="block h-full w-full cursor-pointer text-left"
  >
    {@render shell('')}
  </button>
{:else if href}
  <a {href} class="flex h-full transition-shadow hover:shadow-md">
    {@render shell('w-full')}
  </a>
{:else}
  {@render shell('')}
{/if}
