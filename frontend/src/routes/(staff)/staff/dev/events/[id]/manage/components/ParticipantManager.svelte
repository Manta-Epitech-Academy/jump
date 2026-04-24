<script lang="ts">
  import { Users } from '@lucide/svelte';
  import * as Card from '$lib/components/ui/card';
  import { Separator } from '$lib/components/ui/separator';
  import StudentParticipationRow from './StudentParticipationRow.svelte';
  import type { ParticipationWithDetails } from '$lib/types';

  let {
    participations,
    onDelete,
  }: {
    participations: ParticipationWithDetails[];
    onDelete: (id: string) => void;
  } = $props();
</script>

<Card.Root class="flex flex-col rounded-sm shadow-sm md:col-span-8">
  <Card.Header class="pb-4">
    <Card.Title
      class="flex items-center gap-2 text-xs font-bold tracking-widest text-muted-foreground uppercase"
    >
      <Users class="h-4 w-4 text-epi-blue" /> Participants ({participations.length})
    </Card.Title>
  </Card.Header>
  <Separator />

  <div class="p-5">
    <div class="space-y-2">
      {#each participations as p (p.id)}
        <StudentParticipationRow participation={p} {onDelete} />
      {:else}
        <div
          class="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-border rounded-sm bg-muted/10"
        >
          <Users class="mb-3 h-8 w-8 text-muted-foreground opacity-30" />
          <h3 class="text-sm font-bold uppercase tracking-widest">
            Aucun participant
          </h3>
          <p class="text-xs font-medium text-muted-foreground mt-1">
            Ajoutez des Talents via le panneau de recherche.
          </p>
        </div>
      {/each}
    </div>
  </div>
</Card.Root>
