<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import { Badge } from '$lib/components/ui/badge';
  import * as Collapsible from '$lib/components/ui/collapsible';
  import {
    ArrowLeft,
    CalendarDays,
    Check,
    X,
    ChevronDown,
    FileCheck,
    FilePen,
    ExternalLink,
  } from '@lucide/svelte';
  import { resolve } from '$app/paths';

  let { data } = $props();

  const activityTypeLabels: Record<string, string> = {
    atelier: 'Atelier',
    conference: 'Conférence',
    quiz: 'Quiz',
    special: 'Spécial',
  };
</script>

<div class="space-y-6">
  <!-- Header -->
  <div class="flex items-center gap-4">
    <a
      href={resolve('/parent')}
      class="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 transition-colors hover:bg-slate-100 dark:border-slate-800 dark:hover:bg-slate-900"
    >
      <ArrowLeft class="h-4 w-4 text-slate-500" />
    </a>
    <div>
      <h1 class="text-2xl font-bold text-slate-900 dark:text-white">
        {data.child.prenom}
        {data.child.nom}
      </h1>
    </div>
  </div>

  <!-- Image rights banner -->
  {#if !data.child.imageRightsSigned}
    <Card.Root
      class="rounded-2xl border-amber-200 bg-amber-50 dark:border-amber-900/30 dark:bg-amber-950/20"
    >
      <Card.Content class="flex items-center justify-between p-4">
        <div class="flex items-center gap-3">
          <FilePen class="h-5 w-5 text-amber-600" />
          <div>
            <p class="text-sm font-bold text-amber-800 dark:text-amber-300">
              Droit à l'image non signé
            </p>
            <p class="text-xs text-amber-600 dark:text-amber-400">
              La signature est requise pour continuer
            </p>
          </div>
        </div>
        <a
          href="{resolve('/parent/sign')}?student={data.child.id}"
          class="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-amber-700"
        >
          Signer maintenant
          <ExternalLink class="h-3.5 w-3.5" />
        </a>
      </Card.Content>
    </Card.Root>
  {:else}
    <Badge
      variant="secondary"
      class="gap-1.5 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
    >
      <FileCheck class="h-3 w-3" />
      Droit à l'image signé
    </Badge>
  {/if}

  <!-- Upcoming event -->
  {#if data.upcomingEvent}
    <Card.Root
      class="rounded-2xl border-epi-blue/20 bg-epi-blue/5 dark:border-epi-blue/30"
    >
      <Card.Content class="p-5">
        <p class="text-[10px] font-bold text-epi-blue uppercase">
          Prochain événement
        </p>
        <p class="mt-1 text-lg font-bold text-slate-900 dark:text-white">
          {data.upcomingEvent.titre}
        </p>
        <div class="mt-2 flex items-center gap-2 text-sm text-slate-500">
          <CalendarDays class="h-4 w-4" />
          {new Date(data.upcomingEvent.date).toLocaleDateString('fr-FR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </div>
      </Card.Content>
    </Card.Root>
  {/if}

  <!-- Event history -->
  <div class="space-y-3">
    <h2 class="text-lg font-bold text-slate-900 dark:text-white">
      Historique des événements
    </h2>

    {#if data.participations.length === 0}
      <Card.Root class="rounded-2xl border-slate-200 dark:border-slate-800">
        <Card.Content class="py-8 text-center">
          <p class="text-sm text-slate-500">Aucun événement pour le moment.</p>
        </Card.Content>
      </Card.Root>
    {:else}
      <div class="space-y-2">
        {#each data.participations as participation}
          <Collapsible.Root>
            <Card.Root
              class="rounded-xl border-slate-200 dark:border-slate-800"
            >
              <Collapsible.Trigger class="w-full">
                <Card.Content class="flex items-center justify-between p-4">
                  <div class="flex items-center gap-3 text-left">
                    {#if participation.isPresent}
                      <div
                        class="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/30"
                      >
                        <Check class="h-4 w-4 text-emerald-600" />
                      </div>
                    {:else}
                      <div
                        class="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/30"
                      >
                        <X class="h-4 w-4 text-red-500" />
                      </div>
                    {/if}
                    <div>
                      <p
                        class="text-sm font-bold text-slate-900 dark:text-white"
                      >
                        {participation.eventName}
                      </p>
                      <p class="text-xs text-slate-500">
                        {new Date(participation.eventDate).toLocaleDateString(
                          'fr-FR',
                          {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          },
                        )}
                      </p>
                    </div>
                  </div>

                  <div class="flex items-center gap-2">
                    {#if participation.activities.length > 0}
                      <span class="text-xs text-slate-400">
                        {participation.activities.length} activité{participation
                          .activities.length !== 1
                          ? 's'
                          : ''}
                      </span>
                    {/if}
                    <ChevronDown
                      class="h-4 w-4 text-slate-400 transition-transform [[data-state=open]_&]:rotate-180"
                    />
                  </div>
                </Card.Content>
              </Collapsible.Trigger>

              <Collapsible.Content>
                {#if participation.activities.length > 0}
                  <div
                    class="border-t border-slate-100 px-4 py-3 dark:border-slate-800"
                  >
                    <div class="space-y-2">
                      {#each participation.activities as activity}
                        <div
                          class="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900"
                        >
                          <span
                            class="text-sm text-slate-700 dark:text-slate-300"
                          >
                            {activity.name}
                          </span>
                          <Badge variant="outline" class="text-[10px]">
                            {activityTypeLabels[activity.type] ?? activity.type}
                          </Badge>
                        </div>
                      {/each}
                    </div>
                  </div>
                {:else}
                  <div
                    class="border-t border-slate-100 px-4 py-3 dark:border-slate-800"
                  >
                    <p class="text-xs text-slate-400">
                      Aucune activité enregistrée
                    </p>
                  </div>
                {/if}
              </Collapsible.Content>
            </Card.Root>
          </Collapsible.Root>
        {/each}
      </div>
    {/if}
  </div>
</div>
