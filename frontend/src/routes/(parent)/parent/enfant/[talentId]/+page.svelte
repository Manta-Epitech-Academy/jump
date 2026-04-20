<script lang="ts">
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
    History,
    Rocket,
    LogOut,
  } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import { resolve } from '$app/paths';
  import { fly } from 'svelte/transition';

  let { data } = $props();

  const activityTypeLabels: Record<string, string> = {
    atelier: 'Atelier',
    conference: 'Conférence',
    quiz: 'Quiz',
    special: 'Spécial',
  };
</script>

<div class="mx-auto max-w-5xl px-4 py-8 sm:py-12">
  <!-- Header -->
  <header class="mb-8" in:fly={{ y: -20, duration: 400, delay: 100 }}>
    <div class="flex items-center gap-2">
      <a
        href={resolve('/parent')}
        class="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-lg shadow-slate-200/50 transition-colors hover:bg-slate-50 dark:bg-slate-900 dark:shadow-none dark:hover:bg-slate-800"
      >
        <ArrowLeft class="h-5 w-5 text-epi-blue" />
      </a>
      <div class="flex-1">
        <h1
          class="font-heading text-4xl tracking-tight text-slate-900 uppercase dark:text-white"
        >
          {data.child.prenom}
          <span class="text-epi-blue">{data.child.nom}</span>
        </h1>
        <p class="font-bold text-slate-500 uppercase">Suivi de progression</p>
      </div>
      <form action="{resolve('/logout')}?type=parent" method="POST">
        <Button
          type="submit"
          variant="ghost"
          size="icon"
          class="h-8 w-8 text-slate-400 hover:text-destructive"
        >
          <LogOut class="h-4 w-4" />
          <span class="sr-only">Déconnexion</span>
        </Button>
      </form>
    </div>
  </header>

  <div class="space-y-6">
    <!-- Image rights banner -->
    {#if !data.child.imageRightsSigned}
      <div
        class="overflow-hidden rounded-3xl border border-amber-200 bg-amber-50 shadow-lg shadow-amber-100/50 dark:border-amber-900/30 dark:bg-amber-950/20 dark:shadow-none"
        in:fly={{ y: 20, duration: 400, delay: 200 }}
      >
        <div class="flex items-center justify-between p-6">
          <div class="flex items-center gap-4">
            <div
              class="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-900/30"
            >
              <FilePen class="h-6 w-6 text-amber-600" />
            </div>
            <div>
              <p class="font-bold text-amber-800 dark:text-amber-300">
                Droit à l'image non signé
              </p>
              <p class="text-sm text-amber-600 dark:text-amber-400">
                La signature est requise pour continuer
              </p>
            </div>
          </div>
          <a
            href="{resolve('/parent/sign')}?student={data.child.id}"
            class="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-5 py-3 text-sm font-bold text-white shadow-md shadow-amber-600/20 transition-all hover:bg-amber-700 active:scale-[0.98]"
          >
            Signer maintenant
            <ExternalLink class="h-4 w-4" />
          </a>
        </div>
      </div>
    {:else}
      <div in:fly={{ y: 20, duration: 400, delay: 200 }}>
        <Badge
          variant="secondary"
          class="gap-1.5 bg-emerald-50 px-3 py-1.5 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
        >
          <FileCheck class="h-3.5 w-3.5" />
          Droit à l'image signé
        </Badge>
      </div>
    {/if}

    <!-- Upcoming event -->
    {#if data.upcomingEvent}
      <div
        class="overflow-hidden rounded-3xl border border-blue-100 bg-white shadow-xl shadow-blue-900/5 dark:border-blue-900/30 dark:bg-slate-900 dark:shadow-none"
        in:fly={{ y: 20, duration: 400, delay: 300 }}
      >
        <div
          class="border-b border-blue-50 bg-blue-50/50 px-6 py-3 dark:border-blue-900/20 dark:bg-blue-950/20"
        >
          <div
            class="flex items-center gap-2 text-xs font-bold text-epi-blue uppercase"
          >
            <Rocket class="h-4 w-4" />
            <span>Prochain événement</span>
          </div>
        </div>
        <div class="p-6">
          <p class="text-xl font-bold text-slate-900 dark:text-white">
            {data.upcomingEvent.titre}
          </p>
          <div
            class="mt-2 flex items-center gap-2 text-sm font-bold text-slate-500"
          >
            <CalendarDays class="h-4 w-4 text-epi-blue" />
            {new Date(data.upcomingEvent.date).toLocaleDateString('fr-FR', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </div>
        </div>
      </div>
    {/if}

    <!-- Event history -->
    <div in:fly={{ y: 20, duration: 400, delay: 400 }}>
      <h2
        class="mb-4 flex items-center gap-2 font-heading text-xl text-slate-800 uppercase dark:text-slate-200"
      >
        <History class="h-5 w-5 text-epi-blue" />
        Historique<span class="text-epi-teal">_</span>
      </h2>

      {#if data.participations.length === 0}
        <div
          class="flex min-h-40 flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-6 text-center dark:border-slate-800 dark:bg-slate-900/50"
        >
          <p class="text-sm font-bold text-slate-400 uppercase">
            Aucun événement pour le moment
          </p>
        </div>
      {:else}
        <div class="space-y-3">
          {#each data.participations as participation}
            <Collapsible.Root>
              <div
                class="overflow-hidden rounded-2xl bg-white shadow-md shadow-slate-200/50 dark:bg-slate-900 dark:shadow-none"
              >
                <Collapsible.Trigger class="w-full">
                  <div class="flex items-center justify-between p-4">
                    <div class="flex items-center gap-3 text-left">
                      {#if participation.isPresent}
                        <div
                          class="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/30"
                        >
                          <Check class="h-5 w-5 text-emerald-600" />
                        </div>
                      {:else}
                        <div
                          class="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 dark:bg-red-950/30"
                        >
                          <X class="h-5 w-5 text-red-500" />
                        </div>
                      {/if}
                      <div>
                        <p class="font-bold text-slate-900 dark:text-white">
                          {participation.eventName}
                        </p>
                        <p class="text-xs font-bold text-slate-400">
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
                        <Badge variant="outline" class="text-[10px] font-bold">
                          {participation.activities.length} activité{participation
                            .activities.length !== 1
                            ? 's'
                            : ''}
                        </Badge>
                      {/if}
                      <ChevronDown
                        class="h-4 w-4 text-slate-400 transition-transform [[data-state=open]_&]:rotate-180"
                      />
                    </div>
                  </div>
                </Collapsible.Trigger>

                <Collapsible.Content>
                  {#if participation.activities.length > 0}
                    <div
                      class="border-t border-slate-100 px-4 py-3 dark:border-slate-800"
                    >
                      <div class="space-y-2">
                        {#each participation.activities as activity}
                          <div
                            class="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5 dark:bg-slate-800/50"
                          >
                            <span
                              class="text-sm font-semibold text-slate-700 dark:text-slate-300"
                            >
                              {activity.name}
                            </span>
                            <Badge
                              variant="outline"
                              class="text-[10px] font-bold"
                            >
                              {activityTypeLabels[activity.type] ??
                                activity.type}
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
              </div>
            </Collapsible.Root>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>
