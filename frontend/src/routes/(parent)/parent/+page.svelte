<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import { Badge } from '$lib/components/ui/badge';
  import {
    CalendarDays,
    Users,
    ChevronRight,
    FileCheck,
    FilePen,
  } from '@lucide/svelte';
  import { resolve } from '$app/paths';

  let { data } = $props();
</script>

<div class="space-y-8">
  <div>
    <h1 class="text-2xl font-bold text-slate-900 dark:text-white">
      Bonjour{data.parentName ? `, ${data.parentName.split(' ')[0]}` : ''} !
    </h1>
    <p class="mt-1 text-sm text-slate-500">
      Suivez la progression de {data.children.length > 1
        ? 'vos enfants'
        : 'votre enfant'}
    </p>
  </div>

  {#if data.children.length === 0}
    <Card.Root class="rounded-2xl border-slate-200 dark:border-slate-800">
      <Card.Content class="flex flex-col items-center gap-4 py-12">
        <Users class="h-12 w-12 text-slate-300" />
        <p class="text-sm text-slate-500">
          Aucun enfant inscrit pour le moment.
        </p>
      </Card.Content>
    </Card.Root>
  {:else}
    <div class="grid gap-4 sm:grid-cols-2">
      {#each data.children as child}
        <a href={resolve(`/parent/enfant/${child.id}`)} class="group">
          <Card.Root
            class="h-full rounded-2xl border-slate-200 transition-all hover:border-epi-blue/30 hover:shadow-lg hover:shadow-epi-blue/5 dark:border-slate-800 dark:hover:border-epi-blue/30"
          >
            <Card.Content class="p-6">
              <div class="flex items-start justify-between">
                <div class="space-y-3">
                  <h2 class="text-lg font-bold text-slate-900 dark:text-white">
                    {child.prenom}
                    {child.nom}
                  </h2>

                  <div class="flex items-center gap-2 text-sm text-slate-500">
                    <CalendarDays class="h-4 w-4" />
                    <span
                      >{child.eventsCount} événement{child.eventsCount !== 1
                        ? 's'
                        : ''} suivi{child.eventsCount !== 1 ? 's' : ''}</span
                    >
                  </div>

                  {#if child.upcomingEvent}
                    <div class="rounded-lg bg-epi-blue/5 px-3 py-2">
                      <p class="text-[10px] font-bold text-epi-blue uppercase">
                        Prochain événement
                      </p>
                      <p
                        class="text-sm font-medium text-slate-700 dark:text-slate-300"
                      >
                        {child.upcomingEvent.titre}
                      </p>
                      <p class="text-xs text-slate-500">
                        {new Date(child.upcomingEvent.date).toLocaleDateString(
                          'fr-FR',
                          {
                            weekday: 'long',
                            day: 'numeric',
                            month: 'long',
                          },
                        )}
                      </p>
                    </div>
                  {:else}
                    <p class="text-xs text-slate-400">Aucun événement prévu</p>
                  {/if}
                </div>

                <ChevronRight
                  class="h-5 w-5 text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-epi-blue"
                />
              </div>

              <div
                class="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800"
              >
                {#if child.imageRightsSigned}
                  <Badge
                    variant="secondary"
                    class="gap-1.5 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                  >
                    <FileCheck class="h-3 w-3" />
                    Droit à l'image signé
                  </Badge>
                {:else}
                  <Badge
                    variant="secondary"
                    class="gap-1.5 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
                  >
                    <FilePen class="h-3 w-3" />
                    Droit à l'image à signer
                  </Badge>
                {/if}
              </div>
            </Card.Content>
          </Card.Root>
        </a>
      {/each}
    </div>
  {/if}
</div>
