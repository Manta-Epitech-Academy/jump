<script lang="ts">
  import { ArrowRight } from '@lucide/svelte';
  import type { Component } from 'svelte';
  import { cn } from '$lib/utils';

  let {
    icon,
    title,
    description,
    count,
    href,
    severity = 'info',
  }: {
    icon: Component;
    title: string;
    description?: string;
    count?: number;
    href: string;
    severity?: 'info' | 'warning' | 'danger';
  } = $props();

  const accentColor = $derived(
    severity === 'danger'
      ? 'border-l-red-500'
      : severity === 'warning'
        ? 'border-l-yellow-500'
        : 'border-l-epi-blue',
  );

  const iconColor = $derived(
    severity === 'danger'
      ? 'text-red-500'
      : severity === 'warning'
        ? 'text-yellow-500'
        : 'text-epi-blue',
  );

  const Icon = $derived(icon);
</script>

<a
  {href}
  class={cn(
    'group flex items-center gap-4 rounded-sm border-y border-r border-l-4 border-y-border border-r-border bg-card p-5 shadow-sm transition-all hover:bg-muted/20 hover:shadow-md',
    accentColor,
  )}
>
  <div class="shrink-0 rounded-full bg-muted/50 p-2.5">
    <Icon class={cn('h-5 w-5', iconColor)} />
  </div>
  <div class="min-w-0 flex-1">
    <div class="flex items-center gap-2">
      <div class="truncate text-sm font-bold text-foreground">{title}</div>
      {#if count !== undefined}
        <span
          class={cn(
            'rounded-sm bg-muted px-2 py-0.5 text-xs font-black',
            iconColor,
          )}
        >
          {count}
        </span>
      {/if}
    </div>
    {#if description}
      <p class="mt-0.5 truncate text-xs font-medium text-muted-foreground">
        {description}
      </p>
    {/if}
  </div>
  <ArrowRight
    class="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-all group-hover:translate-x-1 group-hover:opacity-100"
  />
</a>
