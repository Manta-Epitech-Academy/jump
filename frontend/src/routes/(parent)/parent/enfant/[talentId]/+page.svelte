<script lang="ts">
  import { Badge } from '$lib/components/ui/badge';
  import * as Collapsible from '$lib/components/ui/collapsible';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
  import X from '@lucide/svelte/icons/x';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import FileCheck from '@lucide/svelte/icons/file-check';
  import FilePen from '@lucide/svelte/icons/file-pen';
  import Rocket from '@lucide/svelte/icons/rocket';
  import LogOut from '@lucide/svelte/icons/log-out';
  import Clock from '@lucide/svelte/icons/clock';
  import MapPin from '@lucide/svelte/icons/map-pin';
  import Settings from '@lucide/svelte/icons/settings';
  import { Button } from '$lib/components/ui/button';
  import { resolve } from '$app/paths';
  import { fly } from 'svelte/transition';
  import { renderMarkdown } from '$lib/markdown';
  import droitImageBodyMd from '$lib/content/droit-image-body.md?raw';
  import droitImageRefusalBodyMd from '$lib/content/droit-image-refusal-body.md?raw';
  import ChildSignForm from '../../signature/ChildSignForm.svelte';
  import TitleCursor from '$lib/components/layout/TitleCursor.svelte';

  let { data, form } = $props();

  const droitImageBody = renderMarkdown(droitImageBodyMd);
  const droitImageRefusalBody = renderMarkdown(droitImageRefusalBodyMd);

  const activityTypeLabels: Record<string, string> = {
    atelier: 'Atelier',
    conference: 'Conférence',
    quiz: 'Quiz',
    special: 'Spécial',
  };

  function formatTime(dateString: string | Date | undefined) {
    if (!dateString) return '';
    return new Date(dateString).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
</script>

<svelte:head>
  <title>{data.child.prenom} — Espace Parent</title>
</svelte:head>

<div class="mx-auto max-w-5xl px-4 py-8 sm:py-12">
  <!-- Header -->
  <header class="mb-8" in:fly={{ y: -20, duration: 400, delay: 100 }}>
    <div class="flex items-center gap-4">
      {#if data.hasMultipleChildren}
        <a
          href={resolve('/parent')}
          aria-label="Revenir à la liste de vos enfants"
          class="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-card shadow-raised transition-colors hover:bg-background"
        >
          <ArrowLeft class="h-5 w-5 text-epi-blue" />
        </a>
      {/if}
      <div class="flex-1">
        <h1
          class="font-heading text-display-l text-foreground sm:text-display-xl"
        >
          Bonjour, <span class="text-epi-blue"
            >M./Mme {data.parentLastName}</span
          ><TitleCursor />
        </h1>
        <p class="mt-1 text-base font-semibold text-foreground-secondary">
          Suivi de votre enfant {data.child.prenom}
          {data.child.nom}
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

  <div class="space-y-6">
    <!-- Image rights: status + editable decision (revocable "à tout moment") -->
    <div in:fly={{ y: 20, duration: 400, delay: 200 }}>
      {#if data.child.imageRightsStatus === 'undecided'}
        <div
          class="overflow-hidden rounded-xl border border-warning/30 bg-warning/10 shadow-raised"
        >
          <div class="flex flex-wrap items-center justify-between gap-3 p-6">
            <div class="flex items-center gap-4">
              <div
                class="flex h-12 w-12 items-center justify-center rounded-xl bg-warning/10"
              >
                <FilePen class="h-6 w-6 text-warning" />
              </div>
              <div>
                <p class="font-bold text-warning">
                  Droit à l'image à renseigner
                </p>
                <p class="text-sm text-warning">
                  Indiquez si vous autorisez ou refusez l'utilisation de l'image
                  de votre enfant.
                </p>
              </div>
            </div>
          </div>
          <div class="border-t border-warning/30 p-6">
            <ChildSignForm
              child={data.child}
              {droitImageBody}
              {droitImageRefusalBody}
              error={form?.error}
            />
          </div>
        </div>
      {:else}
        <Collapsible.Root>
          <div class="flex flex-wrap items-center justify-between gap-3">
            {#if data.child.imageRightsStatus === 'accepted'}
              <Badge
                variant="secondary"
                class="gap-1.5 bg-success/10 px-3 py-1.5 text-success"
              >
                <FileCheck class="h-3.5 w-3.5" />
                Droit à l'image autorisé
              </Badge>
            {:else}
              <Badge
                variant="secondary"
                class="gap-1.5 bg-destructive/10 px-3 py-1.5 text-destructive"
              >
                <X class="h-3.5 w-3.5" />
                Droit à l'image refusé
              </Badge>
            {/if}
            <Collapsible.Trigger
              class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-epi-blue transition-colors hover:bg-epi-blue/10"
            >
              Modifier ma décision
              <ChevronDown
                class="h-4 w-4 transition-transform [[data-state=open]_&]:rotate-180"
              />
            </Collapsible.Trigger>
          </div>
          <Collapsible.Content>
            <div class="mt-4 rounded-xl border border-border/60 bg-card p-6">
              <ChildSignForm
                child={data.child}
                {droitImageBody}
                {droitImageRefusalBody}
                error={form?.error}
              />
            </div>
          </Collapsible.Content>
        </Collapsible.Root>
      {/if}
    </div>

    <!-- Today's planning -->
    {#if data.todayPlanning}
      <div
        class="overflow-hidden rounded-xl border border-border bg-card shadow-raised"
        in:fly={{ y: 20, duration: 400, delay: 250 }}
      >
        <div class="border-b border-border bg-background/50 px-6 py-4">
          <p class="text-sm font-semibold text-foreground-secondary">
            Votre enfant participe aujourd'hui à
          </p>
          <div
            class="mt-1 flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase"
          >
            <MapPin class="h-4 w-4 text-epi-blue" />
            <span>{data.todayPlanning.eventName}</span>
            <span class="text-muted-foreground">•</span>
            <Clock class="h-4 w-4" />
            <span>{formatTime(data.todayPlanning.eventDate)}</span>
          </div>
        </div>

        <div class="p-6">
          <h2 class="mb-4 font-heading text-display-s text-foreground">
            Programme du jour pour {data.child.prenom}<TitleCursor />
          </h2>

          {#if data.todayPlanning.timeSlots.length > 0}
            <div class="space-y-4">
              {#each data.todayPlanning.timeSlots as slot (slot.id)}
                <div>
                  <div class="mb-2 flex items-center gap-2">
                    <Clock class="h-3.5 w-3.5 shrink-0 text-epi-blue" />
                    <span class="epi-overline text-muted-foreground">
                      {formatTime(slot.startTime)} — {formatTime(slot.endTime)}
                    </span>
                  </div>

                  <div class="ml-5 space-y-1.5 border-l-2 border-border pl-3">
                    {#each slot.activities as activity (activity.id)}
                      <div
                        class="flex items-center gap-3 rounded-xl px-3 py-2.5"
                      >
                        <Badge variant="outline" class="shrink-0 epi-overline">
                          {activityTypeLabels[activity.type] ?? activity.type}
                        </Badge>
                        <span
                          class="min-w-0 flex-1 truncate text-sm font-semibold text-foreground"
                        >
                          {activity.name}
                        </span>
                      </div>
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <div
              class="flex flex-col items-center justify-center py-8 text-center"
            >
              <p class="text-sm text-muted-foreground">
                Le planning de la journée n'est pas encore disponible.
              </p>
            </div>
          {/if}
        </div>
      </div>
    {/if}

    <!-- Upcoming events -->
    {#if data.upcomingEvents.length > 0}
      <div in:fly={{ y: 20, duration: 400, delay: 300 }}>
        <div class="mb-4 flex items-center gap-3">
          <h2
            class="flex items-center gap-2 font-heading text-display-s text-foreground"
          >
            <Rocket class="h-5 w-5 text-epi-blue" />
            Prochains événements d'{data.child.prenom}<TitleCursor />
          </h2>
          <Badge variant="outline" class="text-xs font-bold">
            {data.upcomingEvents.length} à venir
          </Badge>
        </div>

        <div class="space-y-3">
          {#each data.upcomingEvents as event (event.id)}
            <Collapsible.Root>
              <div
                class="overflow-hidden rounded-xl border border-primary/30 bg-card shadow-raised"
              >
                <Collapsible.Trigger class="w-full">
                  <div class="flex items-center justify-between p-4">
                    <div class="flex items-center gap-3 text-left">
                      <div
                        class="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10"
                      >
                        <CalendarDays class="h-5 w-5 text-epi-blue" />
                      </div>
                      <div>
                        <p class="font-bold text-foreground">
                          {event.name}
                        </p>
                        <p class="text-xs font-bold text-muted-foreground">
                          Le {new Date(event.date).toLocaleDateString('fr-FR', {
                            weekday: 'long',
                            day: 'numeric',
                            month: 'long',
                          })}
                        </p>
                      </div>
                    </div>

                    <div class="flex items-center gap-2">
                      {#if event.timeSlots.length > 0}
                        <Badge variant="outline" class="text-xs font-bold">
                          {event.timeSlots.reduce(
                            (sum, s) => sum + s.activities.length,
                            0,
                          )} activité{event.timeSlots.reduce(
                            (sum, s) => sum + s.activities.length,
                            0,
                          ) !== 1
                            ? 's'
                            : ''}
                        </Badge>
                      {/if}
                      <ChevronDown
                        class="h-4 w-4 text-muted-foreground transition-transform [[data-state=open]_&]:rotate-180"
                      />
                    </div>
                  </div>
                </Collapsible.Trigger>

                <Collapsible.Content>
                  {#if event.timeSlots.length > 0}
                    <div class="border-t border-border px-4 py-4">
                      <p
                        class="mb-3 text-sm font-semibold text-foreground-secondary"
                      >
                        Votre enfant participera aux activités suivantes :
                      </p>
                      <div class="space-y-4">
                        {#each event.timeSlots as slot (slot.id)}
                          <div>
                            <div class="mb-2 flex items-center gap-2">
                              <Clock
                                class="h-3.5 w-3.5 shrink-0 text-epi-blue"
                              />
                              <span class="epi-overline text-muted-foreground">
                                {formatTime(slot.startTime)} — {formatTime(
                                  slot.endTime,
                                )}
                              </span>
                            </div>

                            <div
                              class="ml-5 space-y-1.5 border-l-2 border-border pl-3"
                            >
                              {#each slot.activities as activity (activity.id)}
                                <div
                                  class="flex items-center gap-3 rounded-xl px-3 py-2.5"
                                >
                                  <Badge
                                    variant="outline"
                                    class="shrink-0 epi-overline"
                                  >
                                    {activityTypeLabels[activity.type] ??
                                      activity.type}
                                  </Badge>
                                  <span
                                    class="min-w-0 flex-1 truncate text-sm font-semibold text-foreground"
                                  >
                                    {activity.name}
                                  </span>
                                </div>
                              {/each}
                            </div>
                          </div>
                        {/each}
                      </div>
                    </div>
                  {:else}
                    <div class="border-t border-border px-4 py-3">
                      <p class="text-xs text-muted-foreground">
                        Le planning n'est pas encore disponible.
                      </p>
                    </div>
                  {/if}
                </Collapsible.Content>
              </div>
            </Collapsible.Root>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</div>
