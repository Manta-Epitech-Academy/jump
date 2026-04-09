<script lang="ts">
  import { enhance } from '$app/forms';
  import { toast } from 'svelte-sonner';
  import { Users, TriangleAlert, Sparkles, Library } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import * as Card from '$lib/components/ui/card';
  import { Separator } from '$lib/components/ui/separator';
  import { ScrollArea } from '$lib/components/ui/scroll-area';
  import StudentParticipationRow from './StudentParticipationRow.svelte';
  import type { ParticipationWithDetails } from '$lib/types';

  let {
    unassignedParticipations,
    assignedParticipations,
    onDelete,
    onManageSubjects,
    onBulkAssign,
  }: {
    unassignedParticipations: ParticipationWithDetails[];
    assignedParticipations: ParticipationWithDetails[];
    onDelete: (id: string) => void;
    onManageSubjects: (
      participationId: string,
      currentSubjectIds: string[],
    ) => void;
    onBulkAssign: () => void;
  } = $props();

  let isAutoAssigning = $state(false);
</script>

<Card.Root
  class="flex h-125 flex-col rounded-sm md:col-span-8 md:h-full md:max-h-full"
>
  <Card.Header class="flex justify-between pb-3">
    <div>
      <Card.Title class="flex items-center gap-2 uppercase">
        <Users class="h-5 w-5 text-epi-blue" /> Participants
      </Card.Title>
      <Card.Description class="font-bold uppercase"
        >Assignation des sujets & encadrement</Card.Description
      >
    </div>
    <Button
      variant="outline"
      size="sm"
      onclick={onBulkAssign}
      class="h-8 gap-2 border-dashed border-epi-blue/50 text-epi-blue hover:bg-epi-blue/10"
    >
      <Library class="h-3.5 w-3.5" /> Assigner à tous
    </Button>
  </Card.Header>
  <Separator />

  <ScrollArea class="min-h-0 flex-1">
    <div class="space-y-8 p-6">
      {#if unassignedParticipations.length > 0}
        <div
          class="rounded-sm border-2 border-dashed border-epi-orange/30 bg-epi-orange/5 p-4"
        >
          <div class="mb-3 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <TriangleAlert class="h-4 w-4 text-epi-orange" />
              <h3
                class="font-heading text-lg tracking-tight text-epi-orange uppercase"
              >
                Élèves à assigner
              </h3>
            </div>
            <div class="flex gap-2">
              <form
                action="?/autoAssignAll"
                method="POST"
                use:enhance={() => {
                  isAutoAssigning = true;
                  return async ({ result, update }) => {
                    isAutoAssigning = false;
                    if (result.type === 'success') {
                      const data = result.data as
                        | { message?: string }
                        | undefined;
                      toast.success(data?.message || 'Assignation terminée');
                      await update();
                    } else {
                      toast.error("Erreur lors de l'auto-assignation");
                    }
                  };
                }}
              >
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  disabled={isAutoAssigning}
                  class="h-7 border-epi-orange text-epi-orange hover:bg-epi-orange hover:text-white"
                >
                  {#if isAutoAssigning}
                    <span class="mr-2 flex gap-1">
                      <span
                        class="h-1 w-1 animate-bounce rounded-full bg-current delay-0"
                      ></span>
                      <span
                        class="h-1 w-1 animate-bounce rounded-full bg-current delay-150"
                      ></span>
                      <span
                        class="h-1 w-1 animate-bounce rounded-full bg-current delay-300"
                      ></span>
                    </span> Calcul...
                  {:else}
                    <Sparkles class="mr-2 h-3 w-3" /> Auto-assigner ({unassignedParticipations.length})
                  {/if}
                </Button>
              </form>
            </div>
          </div>
          <div class="grid gap-2">
            {#each unassignedParticipations as p (p.id)}
              <StudentParticipationRow
                participation={p}
                {onDelete}
                {onManageSubjects}
              />
            {/each}
          </div>
        </div>
      {/if}

      <div>
        <h3 class="mb-3 font-heading text-lg tracking-tight uppercase">
          Assignés ({assignedParticipations.length})
        </h3>
        <div class="grid gap-2">
          {#each assignedParticipations as p (p.id)}
            <StudentParticipationRow
              participation={p}
              {onDelete}
              {onManageSubjects}
            />
          {:else}
            {#if unassignedParticipations.length === 0}
              <div
                class="flex flex-col items-center justify-center py-20 text-center"
              >
                <Users class="mb-4 h-12 w-12 text-muted" />
                <h3 class="text-lg font-bold uppercase">Aucun participant</h3>
                <p class="text-sm font-bold text-muted-foreground uppercase">
                  Ajoutez des élèves via le panneau latéral.
                </p>
              </div>
            {/if}
          {/each}
        </div>
      </div>
    </div>
  </ScrollArea>
</Card.Root>
