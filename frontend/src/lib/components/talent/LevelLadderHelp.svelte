<script lang="ts">
  import * as Popover from '$lib/components/ui/popover';
  import LevelBadge from '$lib/components/talent/LevelBadge.svelte';
  import { levelLadder } from '$lib/domain/xp';
  import { cn } from '$lib/utils';

  // The « ? » beside Mon parcours's title: the five levels, where each starts
  // and what it says, the reached ones in colour and the others faded, as the
  // 2027 mockup's help does. Read off `levelLadder`, the one table of levels.
  let { xp }: { xp: number } = $props();

  const ladder = levelLadder();
  const fr = (n: number) => n.toLocaleString('fr-FR');
</script>

<Popover.Root>
  <Popover.Trigger>
    {#snippet child({ props })}
      <button
        {...props}
        type="button"
        aria-label="Les niveaux"
        class="flex size-9 cursor-pointer items-center justify-center rounded-full border border-border bg-card font-mono text-sm font-bold text-foreground transition-ui hover:bg-muted data-[state=open]:bg-foreground data-[state=open]:text-background"
      >
        ?
      </button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content align="end" class="w-80 max-w-[calc(100vw-2rem)] p-4">
    <h2 class="epi-overline text-muted-foreground">Les niveaux</h2>
    <ul class="mt-2 divide-y divide-border">
      {#each ladder as step (step.level)}
        {@const reached = xp >= step.min}
        <li class="flex items-center gap-3 py-2">
          <LevelBadge
            level={step.level}
            tone={step.tone}
            decorative
            class={cn('h-7', !reached && 'opacity-30')}
          />
          <span class="flex min-w-0 flex-1 flex-col">
            <strong
              class={cn(
                'text-sm font-bold',
                reached ? 'text-foreground' : 'text-muted-foreground',
              )}>{step.level}</strong
            >
            <span class="text-xs text-muted-foreground">{step.tagline}</span>
          </span>
          <span class="shrink-0 text-xs font-bold text-foreground">
            {fr(step.min)} XP
          </span>
        </li>
      {/each}
    </ul>
  </Popover.Content>
</Popover.Root>
