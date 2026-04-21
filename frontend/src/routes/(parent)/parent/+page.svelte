<script lang="ts">
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import {
    CalendarDays,
    Users,
    ChevronRight,
    FileCheck,
    FilePen,
    LogOut,
  } from '@lucide/svelte';
  import { resolve } from '$app/paths';
  import { fly } from 'svelte/transition';

  let { data } = $props();
</script>

<div class="mx-auto max-w-5xl px-4 py-8 sm:py-12">
  <header class="mb-8" in:fly={{ y: -20, duration: 400, delay: 100 }}>
    <div class="flex items-center gap-2">
      <div
        class="flex h-16 w-16 items-center justify-center rounded-2xl bg-epi-blue text-white shadow-xl shadow-epi-blue/20"
      >
        <Users class="h-8 w-8" />
      </div>
      <div class="flex-1">
        <h1
          class="font-heading text-4xl tracking-tight text-slate-900 uppercase dark:text-white"
        >
          Bonjour, <span class="text-epi-blue"
            >{data.parentName ? data.parentName.split(' ')[0] : ''}</span
          > !
        </h1>
        <p class="font-bold text-slate-500 uppercase">
          Suivez la progression de vos enfants.
        </p>
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

  {#if data.children.length === 0}
    <div
      class="flex min-h-62.5 flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-6 text-center dark:border-slate-800 dark:bg-slate-900/50"
      in:fly={{ y: 20, duration: 400, delay: 200 }}
    >
      <div class="mb-4 rounded-full bg-slate-200/50 p-4 dark:bg-slate-800">
        <Users class="h-8 w-8 text-slate-400" />
      </div>
      <h3
        class="text-lg font-bold text-slate-700 uppercase dark:text-slate-300"
      >
        Aucun enfant inscrit
      </h3>
      <p class="mt-2 max-w-sm text-sm text-slate-500">
        Aucun enfant n'est rattaché à votre compte pour le moment.
      </p>
    </div>
  {:else}
    <div class="grid gap-6 sm:grid-cols-2">
      {#each data.children as child, i}
        <a
          href={resolve(`/parent/enfant/${child.id}`)}
          class="group"
          in:fly={{ y: 20, duration: 400, delay: 200 + i * 100 }}
        >
          <div
            class="relative h-full overflow-hidden rounded-3xl bg-white p-6 shadow-xl shadow-slate-200/50 transition-all hover:shadow-2xl hover:shadow-epi-blue/10 dark:bg-slate-900 dark:shadow-none dark:hover:shadow-none"
          >
            <div
              class="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-epi-blue/5 blur-2xl"
            ></div>

            <div class="relative z-10">
              <div class="flex items-start justify-between">
                <div class="space-y-3">
                  <h2
                    class="font-heading text-2xl tracking-tight text-slate-900 uppercase dark:text-white"
                  >
                    {child.prenom}
                    <span class="text-epi-blue">{child.nom}</span>
                  </h2>

                  <div
                    class="flex items-center gap-2 text-sm font-bold text-slate-500"
                  >
                    <CalendarDays class="h-4 w-4 text-epi-blue" />
                    <span
                      >{child.eventsCount} événement{child.eventsCount !== 1
                        ? 's'
                        : ''} suivi{child.eventsCount !== 1 ? 's' : ''}</span
                    >
                  </div>

                  {#if child.upcomingEvent}
                    <div
                      class="rounded-xl border border-blue-100 bg-blue-50/50 px-4 py-3 dark:border-blue-900/20 dark:bg-blue-950/20"
                    >
                      <p class="text-[10px] font-bold text-epi-blue uppercase">
                        Prochain événement
                      </p>
                      <p
                        class="mt-0.5 text-sm font-bold text-slate-900 dark:text-white"
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
                    <p class="text-xs font-bold text-slate-400 uppercase">
                      Aucun événement prévu
                    </p>
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
            </div>
          </div>
        </a>
      {/each}
    </div>
  {/if}
</div>
