<script lang="ts">
  import type { PageData } from './$types';
  import { Badge } from '$lib/components/ui/badge';
  import { cn } from '$lib/utils';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import WelcomePageEditor from './WelcomePageEditor.svelte';
  import { STAGE_STATUS_META, formatStageRange } from './stageDisplay';
  import MapPin from '@lucide/svelte/icons/map-pin';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import CircleDashed from '@lucide/svelte/icons/circle-dashed';

  let { data }: { data: PageData } = $props();

  function selectHref(eventId: string) {
    return `?event=${eventId}`;
  }
</script>

<div class="mb-6">
  <PageHeader title="Pages" accent="d'accueil" />
  <p class="mt-1 max-w-3xl text-sm text-muted-foreground">
    Le message de bienvenue affiché aux talents dans le fil « Actualités » de
    leur tableau de bord, pendant toute la durée du stage. Vous éditez ici la
    page de <strong>n'importe quel campus</strong> et de
    <strong>n'importe quel stage</strong>, au-delà du seul stage en cours
    accessible à l'équipe dev. Insérez des <strong>variables</strong> (prénom, campus,
    email de contact…) ; elles sont remplacées par les valeurs réelles de chaque talent.
  </p>
</div>

<div class="grid grid-cols-1 gap-6 lg:grid-cols-[20rem_1fr]">
  <!-- Campus / stage picker -->
  <aside class="space-y-5 lg:max-h-[calc(100vh-12rem)] lg:overflow-y-auto">
    {#each data.campuses as campus (campus.id)}
      <div class="rounded-sm border border-border bg-card">
        <div
          class="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5"
        >
          <div class="flex min-w-0 items-center gap-2">
            <MapPin class="h-4 w-4 shrink-0 text-muted-foreground" />
            <span class="truncate text-sm font-bold">{campus.name}</span>
          </div>
        </div>

        {#if campus.events.length === 0}
          <p class="px-3 py-3 text-xs text-muted-foreground">
            Aucun stage de seconde. Créez d'abord un événement pour ce campus.
          </p>
        {:else}
          <ul class="divide-y divide-border">
            {#each campus.events as ev (ev.id)}
              {@const active = ev.id === data.selectedEventId}
              <li>
                <a
                  href={selectHref(ev.id)}
                  data-sveltekit-noscroll
                  class={cn(
                    'flex flex-col gap-1 px-3 py-2.5 text-sm transition-colors hover:bg-accent',
                    active &&
                      'bg-epi-tomorrow/10 ring-1 ring-epi-tomorrow/30 ring-inset',
                  )}
                >
                  <div class="flex items-center justify-between gap-2">
                    <span class="truncate font-medium">{ev.titre}</span>
                    <Badge
                      variant="outline"
                      class={cn(
                        'shrink-0 text-xs',
                        STAGE_STATUS_META[ev.status].class,
                      )}
                    >
                      {STAGE_STATUS_META[ev.status].label}
                    </Badge>
                  </div>
                  <div
                    class="flex items-center justify-between gap-2 text-xs text-muted-foreground"
                  >
                    <span>{formatStageRange(ev.date, ev.endDate)}</span>
                    {#if ev.hasContent}
                      <span class="flex items-center gap-1 text-epi-tech-ink">
                        <CircleCheck class="h-3 w-3" /> Contenu
                      </span>
                    {:else}
                      <span class="flex items-center gap-1">
                        <CircleDashed class="h-3 w-3" /> Vide
                      </span>
                    {/if}
                  </div>
                </a>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/each}
  </aside>

  <!-- Editor / preview -->
  <section class="min-w-0">
    {#if !data.selected}
      <div
        class="rounded-sm border border-dashed border-border bg-card p-10 text-center"
      >
        <p class="text-sm text-muted-foreground">
          Aucun stage de seconde n'existe encore. Créez un événement pour
          commencer à rédiger une page d'accueil.
        </p>
      </div>
    {:else}
      <!--
        Keyed on the stage id: navigating the picker re-runs `load`, the id
        changes, and the editor remounts with the new stage's content, so the
        Tiptap instance reloads correctly instead of keeping the old text.
      -->
      {#key data.selected.id}
        <WelcomePageEditor
          event={data.selected}
          initialContent={data.selectedContent}
        />
      {/key}
    {/if}
  </section>
</div>
