<script lang="ts">
  import { Search, Plus, CircleCheck } from '@lucide/svelte';
  import { resolve } from '$app/paths';
  import type { Readable } from 'svelte/store';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import * as Card from '$lib/components/ui/card';
  import { Skeleton } from '$lib/components/ui/skeleton';
  import StudentAvatarItem from '$lib/components/students/StudentAvatarItem.svelte';
  import type { SuperForm } from 'sveltekit-superforms/client';
  import type { AddParticipantForm } from '$lib/validation/events';

  import type { ParticipationWithDetails } from '$lib/types';

  let {
    participations,
    addEnhance,
    addDelayed,
  }: {
    participations: ParticipationWithDetails[];
    addEnhance: SuperForm<AddParticipantForm>['enhance'];
    addDelayed: Readable<boolean>;
  } = $props();

  let searchQuery = $state('');
  let searchResults: any[] = $state([]);
  let topStudents: any[] = $state([]);
  let searching = $state(false);

  $effect(() => {
    fetch(`${resolve('/api/students')}?top=1`)
      .then((res) => (res.ok ? res.json() : []))
      .then((items) => {
        topStudents = items;
      });
  });

  $effect(() => {
    const query = searchQuery.trim();
    if (query.length < 2) {
      searchResults = [];
      return;
    }
    searching = true;
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(
          `${resolve('/api/students')}?q=${encodeURIComponent(query)}`,
        );
        if (res.ok) searchResults = await res.json();
      } finally {
        searching = false;
      }
    }, 300);
    return () => clearTimeout(timeout);
  });

  let displayedStudents = $derived(
    searchQuery.trim().length >= 2 ? searchResults : topStudents,
  );

  function isAlreadyInEvent(studentId: string) {
    return participations.some((p) => p.talent?.id === studentId);
  }
</script>

<div class="flex flex-col gap-4 md:sticky md:top-0 md:col-span-4 md:self-start">
  <Card.Root
    class="flex flex-col rounded-sm shadow-sm md:max-h-[calc(100vh-8rem)]"
  >
    <Card.Header class="space-y-4 pb-4">
      <Card.Title
        class="text-xs font-bold tracking-widest text-muted-foreground uppercase"
        >Rechercher</Card.Title
      >
      <div class="relative">
        <Search class="absolute top-2.5 left-2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Nom ou prénom..."
          class="rounded-sm bg-muted/30 pl-8"
          bind:value={searchQuery}
        />
      </div>
    </Card.Header>
    <div
      class="min-h-0 flex-1 overflow-y-auto border-t border-border/50 bg-muted/10 p-3"
    >
      <div class="space-y-1.5">
        {#if searching}
          <!-- SKELETON LOADERS -->
          <div class="space-y-2 p-1">
            {#each Array(4) as _}
              <div
                class="flex items-center justify-between rounded-sm border bg-background p-2 shadow-sm"
              >
                <div class="flex items-center gap-3">
                  <Skeleton class="h-8 w-8 rounded-sm" />
                  <div class="flex flex-col gap-1.5">
                    <Skeleton class="h-3 w-24 rounded-sm" />
                    <Skeleton class="h-2 w-16 rounded-sm" />
                  </div>
                </div>
                <Skeleton class="h-8 w-8 rounded-sm" />
              </div>
            {/each}
          </div>
        {:else if searchQuery.trim().length >= 2 && displayedStudents.length === 0}
          <p class="py-8 text-center text-xs font-medium text-muted-foreground">
            Aucun résultat.
          </p>
        {:else}
          {#each displayedStudents as student (student.id)}
            {@const isAdded = isAlreadyInEvent(student.id)}
            {@const count = student.eventsCount || 0}
            <form
              method="POST"
              action="?/addExisting"
              use:addEnhance
              class="flex items-center justify-between rounded-sm border border-border/50 bg-card p-2 shadow-sm transition-all hover:border-epi-blue/50"
            >
              <input type="hidden" name="studentId" value={student.id} />
              <div class="flex flex-col overflow-hidden">
                <a
                  href={resolve(`/staff/dev/students/${student.id}`)}
                  target="_blank"
                  class="group"
                >
                  <StudentAvatarItem
                    {student}
                    subText={count > 0 && !isAdded
                      ? `${student.niveau} • ${count} participation${count > 1 ? 's' : ''}`
                      : student.niveau}
                    showBadge={true}
                    size="sm"
                  />
                </a>
              </div>
              <Button
                variant={isAdded ? 'secondary' : 'outline'}
                size="sm"
                type="submit"
                disabled={isAdded || $addDelayed}
                class="h-8 w-8 shrink-0 rounded-sm p-0"
              >
                {#if isAdded}<CircleCheck
                    class="h-4 w-4 text-green-600"
                  />{:else}<Plus class="h-4 w-4" />{/if}
              </Button>
            </form>
          {/each}
        {/if}
      </div>
    </div>
  </Card.Root>
</div>
