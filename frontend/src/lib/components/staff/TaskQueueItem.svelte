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

  const toneClass = $derived(
    severity === 'danger'
      ? 'border-red-200 bg-red-50/50 hover:bg-red-50 dark:border-red-900/30 dark:bg-red-950/20 dark:hover:bg-red-950/40'
      : severity === 'warning'
        ? 'border-yellow-200 bg-yellow-50/50 hover:bg-yellow-50 dark:border-yellow-900/30 dark:bg-yellow-950/20 dark:hover:bg-yellow-950/40'
        : 'border-blue-200 bg-blue-50/50 hover:bg-blue-50 dark:border-blue-900/30 dark:bg-blue-950/20 dark:hover:bg-blue-950/40',
  );

  const iconClass = $derived(
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
    'group flex items-center gap-4 rounded-lg border p-4 transition-colors',
    toneClass,
  )}
>
  <div class="shrink-0">
    <Icon class={cn('h-6 w-6', iconClass)} />
  </div>
  <div class="min-w-0 flex-1">
    <div class="flex items-baseline gap-2">
      <p class="truncate text-sm font-bold">{title}</p>
      {#if count !== undefined}
        <span class={cn('font-mono text-lg font-black', iconClass)}>
          {count}
        </span>
      {/if}
    </div>
    {#if description}
      <p class="mt-0.5 truncate text-xs text-muted-foreground">
        {description}
      </p>
    {/if}
  </div>
  <ArrowRight
    class="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
  />
</a>
