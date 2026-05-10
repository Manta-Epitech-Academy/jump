<script lang="ts" module>
  export type SetupStepStatus = 'todo' | 'current' | 'done';
</script>

<script lang="ts">
  import Check from '@lucide/svelte/icons/check';
  import { cn } from '$lib/utils';
  import type { Snippet } from 'svelte';

  type Props = {
    index: number;
    status: SetupStepStatus;
    title: string;
    description: string;
    cta?: Snippet;
  };

  let { index, status, title, description, cta }: Props = $props();
</script>

<div
  class={cn(
    'flex items-start gap-4 border-l-4 bg-card p-4 shadow-sm',
    status === 'done'
      ? 'border-l-epi-teal-solid'
      : status === 'current'
        ? 'border-l-epi-blue'
        : 'border-l-muted',
  )}
>
  <div
    class={cn(
      'flex h-9 w-9 shrink-0 items-center justify-center rounded-sm font-mono text-sm font-bold',
      status === 'done'
        ? 'bg-epi-teal-solid text-white'
        : status === 'current'
          ? 'bg-epi-blue text-white'
          : 'border border-dashed border-muted-foreground/40 text-muted-foreground',
    )}
    aria-hidden="true"
  >
    {#if status === 'done'}
      <Check class="h-4 w-4" />
    {:else}
      {String(index).padStart(2, '0')}
    {/if}
  </div>
  <div class="min-w-0 flex-1">
    <p
      class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
    >
      Étape {String(index).padStart(2, '0')}
      {#if status === 'done'}· Terminé{:else if status === 'current'}· En cours{:else}·
        À faire{/if}
    </p>
    <h3 class="mt-0.5 font-heading text-lg tracking-wide uppercase">{title}</h3>
    <p class="mt-1 text-sm text-muted-foreground">{description}</p>
    {#if cta}
      <div class="mt-3">{@render cta()}</div>
    {/if}
  </div>
</div>
