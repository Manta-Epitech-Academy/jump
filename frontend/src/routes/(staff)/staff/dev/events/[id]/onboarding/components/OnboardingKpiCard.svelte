<script lang="ts" module>
  // Per-card identity is carried by the icon chip + the left strip only.
  // Numbers stay neutral foreground (dashboard convention) and bars stay
  // uniform `epi-blue` so the row reads as one metric in four facets,
  // with the chip/strip handling at-a-glance distinction.
  // Tailwind 4 needs literal class strings to JIT-scan, so we keep variants
  // here rather than interpolating at the call site.
  export type KpiTheme = {
    strip: string;
    chip: string;
  };

  export const KPI_THEMES = {
    blue: {
      strip: 'border-l-epi-blue',
      chip: 'bg-epi-blue/10 text-epi-blue',
    },
    orange: {
      strip: 'border-l-epi-orange',
      chip: 'bg-epi-orange/10 text-epi-orange',
    },
    pink: {
      strip: 'border-l-epi-pink',
      chip: 'bg-epi-pink/10 text-epi-pink',
    },
    teal: {
      strip: 'border-l-epi-teal-solid',
      chip: 'bg-epi-teal-solid/10 text-epi-teal-solid',
    },
  } as const satisfies Record<string, KpiTheme>;

  export type KpiThemeKey = keyof typeof KPI_THEMES;
</script>

<script lang="ts">
  import type { Component } from 'svelte';
  import { cn } from '$lib/utils';

  let {
    label,
    Icon,
    ok,
    total,
    theme,
    active = false,
    onToggle,
  }: {
    label: string;
    Icon: Component<{ class?: string }>;
    ok: number;
    total: number;
    theme: KpiTheme;
    active?: boolean;
    onToggle: () => void;
  } = $props();

  let pct = $derived(total === 0 ? 0 : Math.round((ok / total) * 100));
  let missing = $derived(Math.max(0, total - ok));
  let complete = $derived(total > 0 && ok === total);
</script>

<button
  type="button"
  onclick={onToggle}
  aria-pressed={active}
  class={cn(
    'group flex cursor-pointer flex-col gap-3 rounded-sm border border-l-4 p-4 text-left shadow-sm transition-colors dark:shadow-none',
    theme.strip,
    active
      ? 'border-epi-blue bg-epi-blue text-white ring-1 ring-epi-blue/40 hover:bg-[#0026b8]'
      : 'border-border bg-card hover:border-epi-blue/60',
  )}
>
  <div class="flex items-start justify-between gap-3">
    <div class="min-w-0 flex-1">
      <p
        class={cn(
          'text-[10px] font-bold tracking-widest uppercase',
          active ? 'text-white/70' : 'text-muted-foreground',
        )}
      >
        {label}
      </p>
      <div
        class={cn(
          'mt-1 text-3xl leading-none font-black',
          active ? 'text-white' : 'text-foreground',
        )}
      >
        {ok}<span
          class={cn(
            'font-mono text-base font-bold',
            active ? 'text-white/60' : 'text-muted-foreground',
          )}>/{total}</span
        >
      </div>
    </div>
    <div
      class={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-sm',
        active ? 'bg-white/15 text-white' : theme.chip,
      )}
    >
      <Icon class="h-5 w-5" />
    </div>
  </div>

  <div
    class={cn(
      'h-1 w-full overflow-hidden rounded-full',
      active ? 'bg-white/20' : 'bg-muted dark:bg-muted/40',
    )}
  >
    <div
      class={cn(
        'h-full transition-all',
        active ? 'bg-white' : complete ? 'bg-epi-teal-solid' : 'bg-epi-blue',
      )}
      style:width={`${pct}%`}
    ></div>
  </div>

  <p
    class={cn(
      'text-[11px] font-medium',
      active ? 'text-white/80' : 'text-muted-foreground',
    )}
  >
    {#if complete}
      Tous validés
    {:else}
      <span
        class={cn(
          'font-mono font-bold',
          active ? 'text-white' : 'text-foreground',
        )}>{missing}</span
      >
      à finaliser
    {/if}
  </p>
</button>
