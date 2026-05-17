<script lang="ts">
  import type { Snippet } from 'svelte';
  import Info from '@lucide/svelte/icons/info';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { cn } from '$lib/utils';

  let {
    text,
    content,
    label = "Plus d'informations",
    iconClass,
  }: {
    text?: string;
    content?: Snippet;
    label?: string;
    iconClass?: string;
  } = $props();
</script>

<Tooltip.Provider delayDuration={150}>
  <Tooltip.Root>
    <Tooltip.Trigger>
      {#snippet child({ props })}
        <span
          {...props}
          role="button"
          tabindex={0}
          aria-label={label}
          onclick={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
          onkeydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
          }}
          class="inline-flex cursor-help items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
        >
          <Info class={cn('h-3 w-3', iconClass)} />
        </span>
      {/snippet}
    </Tooltip.Trigger>
    <Tooltip.Content class="max-w-xs text-xs leading-relaxed">
      {#if content}
        {@render content()}
      {:else}
        {text}
      {/if}
    </Tooltip.Content>
  </Tooltip.Root>
</Tooltip.Provider>
