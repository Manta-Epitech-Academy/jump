<script lang="ts">
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
  import Users from '@lucide/svelte/icons/users';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import FileCheck from '@lucide/svelte/icons/file-check';
  import FilePen from '@lucide/svelte/icons/file-pen';
  import X from '@lucide/svelte/icons/x';
  import Settings from '@lucide/svelte/icons/settings';
  import { resolve } from '$app/paths';
  import { fly } from 'svelte/transition';
  import TitleCursor from '$lib/components/layout/TitleCursor.svelte';

  let { data } = $props();
</script>

<svelte:head>
  <title>Espace Parent</title>
</svelte:head>

<div class="mx-auto max-w-5xl px-4 py-8 sm:py-12">
  <header class="mb-8" in:fly={{ y: -20, duration: 400, delay: 100 }}>
    <div class="flex items-center gap-4">
      <div class="flex-1">
        <h1
          class="font-heading text-display-l text-foreground sm:text-display-xl"
        >
          Bonjour, <span class="text-epi-blue"
            >M./Mme {data.parentLastName}</span
          ><TitleCursor />
        </h1>
        <p class="mt-1 text-base font-semibold text-foreground-secondary">
          Espace de suivi parental
        </p>
      </div>
      <a
        href={resolve('/parent/settings')}
        class="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground-secondary"
      >
        <Settings class="h-4 w-4" />
        <span class="sr-only">Paramètres</span>
      </a>
    </div>
  </header>

  {#if data.children.length === 0}
    <div
      class="flex min-h-62.5 flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-background/50 p-6 text-center"
      in:fly={{ y: 20, duration: 400, delay: 200 }}
    >
      <div class="mb-4 rounded-full bg-muted/50 p-4">
        <Users class="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 class="text-lg font-bold text-foreground-secondary uppercase">
        Aucun enfant inscrit
      </h3>
      <p class="mt-2 max-w-sm text-sm text-muted-foreground">
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
            class="dark:hover:shadow-noneark:hover:shadow-none relative h-full overflow-hidden rounded-xl border border-border bg-card p-6 shadow-raised transition-ui hover:shadow-raised"
          >
            <div
              class="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-epi-blue/5 blur-2xl"
            ></div>

            <div class="relative z-10">
              <div class="flex items-start justify-between">
                <div class="space-y-3">
                  <h2 class="font-heading text-display-m text-foreground">
                    {child.prenom}
                    <span class="text-epi-blue">{child.nom}</span>
                  </h2>

                  <div
                    class="flex items-center gap-2 text-sm font-bold text-muted-foreground"
                  >
                    <CalendarDays class="h-4 w-4 text-epi-blue" />
                    <span
                      >{child.eventsCount} événement{child.eventsCount !== 1
                        ? 's'
                        : ''} au programme</span
                    >
                  </div>

                  {#if child.upcomingEvent}
                    <div
                      class="rounded-xl border border-primary/30 bg-primary/50 px-4 py-3"
                    >
                      <p class="epi-overline text-epi-blue">
                        Prochain rendez-vous
                      </p>
                      <p class="mt-0.5 text-sm font-bold text-foreground">
                        {child.upcomingEvent.titre}
                      </p>
                      <p class="text-xs text-muted-foreground">
                        Le {new Date(
                          child.upcomingEvent.date,
                        ).toLocaleDateString('fr-FR', {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long',
                        })}
                      </p>
                    </div>
                  {:else}
                    <p class="text-xs font-bold text-muted-foreground">
                      Pas d'événement prévu pour le moment
                    </p>
                  {/if}
                </div>

                <ChevronRight
                  class="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-epi-blue"
                />
              </div>

              <div class="mt-4 border-t border-border pt-3">
                {#if child.imageRightsStatus === 'accepted'}
                  <Badge
                    variant="secondary"
                    class="gap-1.5 bg-success/10 text-success"
                  >
                    <FileCheck class="h-3 w-3" />
                    Droit à l'image autorisé
                  </Badge>
                {:else if child.imageRightsStatus === 'refused'}
                  <Badge
                    variant="secondary"
                    class="gap-1.5 bg-destructive/10 text-destructive"
                  >
                    <X class="h-3 w-3" />
                    Droit à l'image refusé
                  </Badge>
                {:else}
                  <Badge
                    variant="secondary"
                    class="gap-1.5 bg-warning/10 text-warning"
                  >
                    <FilePen class="h-3 w-3" />
                    Droit à l'image à renseigner
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
