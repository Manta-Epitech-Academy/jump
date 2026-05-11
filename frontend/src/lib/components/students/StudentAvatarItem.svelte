<script lang="ts">
  import TalentAvatar from './TalentAvatar.svelte';
  import TalentName from './TalentName.svelte';
  import NewTalentBadge from './NewTalentBadge.svelte';

  let {
    student,
    subText = null,
    showBadge = false,
    size = 'md',
  }: {
    student: {
      id: string;
      nom?: string | null;
      prenom?: string | null;
      eventsCount?: number | null;
      events_count?: number | null;
    };
    subText?: string | null;
    showBadge?: boolean;
    size?: 'sm' | 'md';
  } = $props();

  let isNew = $derived(
    (student.eventsCount ?? student.events_count ?? 0) === 0,
  );
</script>

<div class="flex items-center gap-3">
  <TalentAvatar talent={student} {size} />

  <div class="flex min-w-0 flex-col">
    <span
      class="group flex items-center gap-2 truncate text-sm font-bold transition-colors hover:text-epi-blue"
    >
      <span class="truncate">
        <TalentName talent={student} />
      </span>
      {#if showBadge && isNew}
        <NewTalentBadge
          class="transition-colors group-hover:border-epi-blue/30 group-hover:bg-epi-blue/10 group-hover:text-epi-blue"
        />
      {/if}
    </span>
    {#if subText}
      <span class="truncate text-xs text-muted-foreground">{subText}</span>
    {/if}
  </div>
</div>
