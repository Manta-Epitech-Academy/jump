<script lang="ts">
  import { Users } from '@lucide/svelte';
  import * as Card from '$lib/components/ui/card';
  import { Separator } from '$lib/components/ui/separator';
  import { ScrollArea } from '$lib/components/ui/scroll-area';
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

<Card.Root
  class="flex h-125 flex-col rounded-sm md:col-span-8 md:h-full md:max-h-full"
>
  <Card.Header class="pb-3">
    <Card.Title class="flex items-center gap-2 uppercase">
      <Users class="h-5 w-5 text-epi-blue" /> Participants ({participations.length})
    </Card.Title>
  </Card.Header>
  <Separator />

  <ScrollArea class="min-h-0 flex-1">
    <div class="space-y-2 p-6">
      {#each participations as p (p.id)}
        <StudentParticipationRow participation={p} {onDelete} />
      {:else}
        <div
          class="flex flex-col items-center justify-center py-20 text-center"
        >
          <Users class="mb-4 h-12 w-12 text-muted" />
          <h3 class="text-lg font-bold uppercase">Aucun participant</h3>
          <p class="text-sm font-bold text-muted-foreground uppercase">
            Ajoutez des Talents via le panneau latéral.
          </p>
        </div>
      {/each}
    </div>
  </ScrollArea>
</Card.Root>
