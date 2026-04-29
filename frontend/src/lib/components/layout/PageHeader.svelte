<script lang="ts">
  import { cn } from '$lib/utils';
  let {
    title,
    subtitle,
    class: className,
    titleViewTransitionName,
    children,
  }: {
    title: string;
    subtitle?: string;
    class?: string;
    titleViewTransitionName?: string;
    children?: any;
  } = $props();
</script>

<div
  class={cn(
    'flex flex-col gap-4 border-b pb-4 md:flex-row md:items-center md:justify-between md:border-b-0 md:pb-0',
    className,
  )}
>
  <div>
    <h1
      class="text-3xl font-bold text-epi-blue uppercase"
      style:view-transition-name={titleViewTransitionName}
    >
      {title}<span class="text-epi-teal">_</span>
    </h1>
    {#if subtitle}
      <p
        class="text-sm font-bold tracking-wider text-muted-foreground uppercase"
      >
        {subtitle}
      </p>
    {/if}
  </div>
  {#if children}
    <div class="flex items-center gap-2">
      {@render children()}
    </div>
  {/if}
</div>
