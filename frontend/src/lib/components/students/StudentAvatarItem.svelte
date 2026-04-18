<script lang="ts">
  import * as Avatar from '$lib/components/ui/avatar';
  import { Badge } from '$lib/components/ui/badge';
  import { Sprout, Flame, Snowflake } from '@lucide/svelte';
  import { cn } from '$lib/utils';

  let {
    student,
    subText = null,
    showBadge = false,
    size = 'md',
  }: {
    student: any;
    subText?: string | null;
    showBadge?: boolean;
    size?: 'sm' | 'md';
  } = $props();

  let initials = $derived(
    ((student.nom?.[0] ?? '') + (student.prenom?.[0] ?? '')).toUpperCase(),
  );

  let isNew = $derived(
    (student.eventsCount || student.events_count || 0) === 0,
  );

  // --- Talent warmth (temperature) ---
  let now = new Date().getTime();
  let lastActive = $derived(
    student.lastActiveAt ? new Date(student.lastActiveAt).getTime() : 0,
  );
  let daysSinceActive = $derived(
    lastActive ? (now - lastActive) / (1000 * 3600 * 24) : Infinity,
  );

  // Hot = high XP and active recently (last 30 days)
  let isHot = $derived(student.xp >= 100 && daysSinceActive <= 30);
  // Cold = high XP but dormant (more than 180 days)
  let isCold = $derived(student.xp >= 100 && daysSinceActive >= 180);

  function formatFirstName(name: string | undefined) {
    if (!name) return '';
    return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  }
</script>

<div class="flex items-center gap-3">
  <div class="relative">
    <Avatar.Root
      class={cn(
        size === 'sm' ? 'h-8 w-8' : 'h-9 w-9',
        'transition-all duration-300 group-hover:opacity-80',
        isHot
          ? 'shadow-[0_0_12px_rgba(255,95,58,0.5)] ring-2 ring-epi-orange'
          : '',
        isCold ? 'opacity-70 ring-2 ring-blue-300 grayscale-[0.3]' : '',
      )}
    >
      <Avatar.Fallback class="bg-muted font-bold text-foreground">
        {initials}
      </Avatar.Fallback>
    </Avatar.Root>

    {#if isHot}
      <div
        class="absolute -right-1 -bottom-1 flex h-4 w-4 items-center justify-center rounded-full bg-background shadow-sm"
      >
        <Flame class="h-3 w-3 animate-pulse text-epi-orange" />
      </div>
    {:else if isCold}
      <div
        class="absolute -right-1 -bottom-1 flex h-4 w-4 items-center justify-center rounded-full bg-background shadow-sm"
      >
        <Snowflake class="h-3 w-3 text-blue-400" />
      </div>
    {/if}
  </div>

  <div class="flex min-w-0 flex-col">
    <span
      class="group flex items-center gap-2 truncate text-sm font-bold transition-colors hover:text-epi-blue"
    >
      <span class="truncate">
        <span class="uppercase">{student.nom}</span>
        {formatFirstName(student.prenom)}
      </span>
      {#if showBadge && isNew}
        <Badge
          variant="outline"
          class="shrink-0 gap-1 border-green-200 bg-green-50 px-1 py-0 text-[9px] text-green-700 transition-colors group-hover:border-epi-blue/30 group-hover:bg-epi-blue/10 group-hover:text-epi-blue dark:border-green-900 dark:bg-green-900/30 dark:text-green-400"
        >
          <Sprout class="h-2.5 w-2.5" />
          Nouveau
        </Badge>
      {/if}
    </span>
    {#if subText}
      <span class="truncate text-xs text-muted-foreground">{subText}</span>
    {/if}
  </div>
</div>
