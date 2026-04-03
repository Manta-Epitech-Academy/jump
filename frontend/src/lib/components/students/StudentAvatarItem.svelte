<script lang="ts">
  import * as Avatar from '$lib/components/ui/avatar';
  import { Badge } from '$lib/components/ui/badge';
  import { Sprout } from '@lucide/svelte';
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

  let isNew = $derived((student.events_count || 0) === 0);

  function formatFirstName(name: string | undefined) {
    if (!name) return '';
    return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  }
</script>

<div class="flex items-center gap-3">
  <Avatar.Root
    class={cn(
      size === 'sm' ? 'h-8 w-8' : 'h-9 w-9',
      'transition-opacity group-hover:opacity-80',
    )}
  >
    <Avatar.Fallback class="bg-muted font-bold">
      {initials}
    </Avatar.Fallback>
  </Avatar.Root>
  <div class="flex flex-col">
    <span
      class="flex items-center gap-2 truncate text-sm font-bold transition-colors group-hover:text-epi-blue"
    >
      <span>
        <span class="uppercase">{student.nom}</span>
        {formatFirstName(student.prenom)}
      </span>
      {#if showBadge && isNew}
        <Badge
          variant="outline"
          class="gap-1 border-green-200 bg-green-50 px-1 py-0 text-[9px] text-green-700 transition-colors group-hover:border-epi-blue/30 group-hover:bg-epi-blue/10 group-hover:text-epi-blue dark:border-green-900 dark:bg-green-900/30 dark:text-green-400"
        >
          <Sprout class="h-2.5 w-2.5" />
          Nouveau
        </Badge>
      {/if}
    </span>
    {#if subText}
      <span class="text-xs text-muted-foreground">{subText}</span>
    {/if}
  </div>
</div>
