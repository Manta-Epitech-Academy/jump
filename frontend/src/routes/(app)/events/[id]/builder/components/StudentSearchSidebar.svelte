<script lang="ts">
  import { Search, Plus, CircleCheck } from '@lucide/svelte';
  import { resolve } from '$app/paths';
  import { untrack } from 'svelte';
  import { superForm } from 'sveltekit-superforms';
  import { toast } from 'svelte-sonner';
  import type { Readable } from 'svelte/store';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import * as Card from '$lib/components/ui/card';
  import { ScrollArea } from '$lib/components/ui/scroll-area';
  import StudentAvatarItem from '$lib/components/students/StudentAvatarItem.svelte';
  import QuickCreateStudentModal from './QuickCreateStudentModal.svelte';
  import type { SuperForm } from 'sveltekit-superforms/client';
  import type { AddParticipantForm } from '$lib/validation/events';

  type ParticipationWithExpand = Record<string, any>;

  let {
    participations,
    addEnhance,
    addDelayed,
    createStudentForm,
  }: {
    participations: ParticipationWithExpand[];
    addEnhance: SuperForm<AddParticipantForm>['enhance'];
    addDelayed: Readable<boolean>;
    createStudentForm: any;
  } = $props();

  let openQuickCreate = $state(false);

  const { form: createForm, enhance: createEnhance } = superForm(
    untrack(() => createStudentForm),
    {
      id: 'quick-create',
      onResult: ({ result }) => {
        if (result.type === 'success') {
          openQuickCreate = false;
          toast.success(result.data?.form.message);
        } else if (result.type === 'failure') {
          toast.error(
            result.data?.form.message || 'Erreur lors de la création',
          );
        }
      },
    },
  );

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
    return participations.some((p) => p.studentProfile?.id === studentId);
  }
</script>

<div class="flex h-auto flex-col gap-4 md:col-span-4 md:h-full">
  <Card.Root
    class="flex h-100 flex-col rounded-sm md:h-full md:max-h-full md:flex-1"
  >
    <Card.Header class="space-y-4 pb-3">
      <div class="flex items-center justify-between">
        <Card.Title class="uppercase">Inscrire des élèves</Card.Title>
        <QuickCreateStudentModal
          bind:open={openQuickCreate}
          {createForm}
          {createEnhance}
        />
      </div>
      <div class="relative">
        <Search class="absolute top-2.5 left-2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher..."
          class="rounded-sm pl-8"
          bind:value={searchQuery}
        />
      </div>
    </Card.Header>
    <ScrollArea class="min-h-0 flex-1 border-t bg-muted/10">
      <div class="space-y-1 p-2">
        {#if searching}
          <p class="py-8 text-center text-xs text-muted-foreground">
            Recherche...
          </p>
        {:else if searchQuery.trim().length >= 2 && displayedStudents.length === 0}
          <p class="py-8 text-center text-xs text-muted-foreground">
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
              class="flex items-center justify-between rounded-sm border bg-background p-2"
            >
              <input type="hidden" name="studentId" value={student.id} />
              <div class="flex flex-col overflow-hidden">
                <a
                  href={resolve(`/students/${student.id}`)}
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
                variant={isAdded ? 'secondary' : 'default'}
                size="sm"
                type="submit"
                disabled={isAdded || $addDelayed}
                class="h-8 px-2"
              >
                {#if isAdded}<CircleCheck class="h-4 w-4" />{:else}<Plus
                    class="h-4 w-4"
                  />{/if}
              </Button>
            </form>
          {/each}
        {/if}
      </div>
    </ScrollArea>
  </Card.Root>
</div>
