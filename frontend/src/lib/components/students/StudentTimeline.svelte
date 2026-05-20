<script lang="ts">
  import Calendar from '@lucide/svelte/icons/calendar';
  import TalentTimelineItem from './_TalentTimelineItem.svelte';

  let {
    participations,
    timezone,
  }: { participations: any[]; timezone: string } = $props();
</script>

<div
  class="relative space-y-4 before:absolute before:inset-0 before:ml-5 before:h-full before:w-0.5 before:-translate-x-px before:bg-linear-to-b before:from-transparent before:via-slate-300 before:to-transparent md:before:mx-auto md:before:translate-x-0"
>
  {#each participations as p (p.id)}
    <TalentTimelineItem {p} {timezone} layout="alternating" />
  {:else}
    <div class="py-12 text-center">
      <div
        class="inline-flex items-center justify-center mb-4 h-16 w-16 rounded-full bg-muted"
      >
        <Calendar class="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 class="text-lg font-bold text-muted-foreground uppercase">
        Aucun historique
      </h3>
      <p class="text-sm text-muted-foreground">
        Ce Talent n'a pas encore participé à un événement.
      </p>
    </div>
  {/each}
</div>
