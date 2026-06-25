<script lang="ts">
  import { untrack } from 'svelte';
  import { superForm } from 'sveltekit-superforms';
  import { toast } from 'svelte-sonner';
  import { page } from '$app/state';

  import type { PageData } from './$types';
  import { onErrorToast } from '$lib/utils/formErrors';
  import { can } from '$lib/domain/permissions';
  import { eventTypeLabel } from '$lib/domain/event';
  import {
    EVENT_MODULE_KEYS,
    EVENT_MODULE_DEFS,
  } from '$lib/domain/eventModules';
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
  import StickyNote from '@lucide/svelte/icons/sticky-note';
  import Clock from '@lucide/svelte/icons/clock';

  import EditEventDialog from './components/EditEventDialog.svelte';
  import StartTimeInline from './components/StartTimeInline.svelte';
  import EventSalesforceButton from '$lib/components/events/EventSalesforceButton.svelte';

  let { data }: { data: PageData } = $props();

  const isLead = $derived(can('devLead', page.data.staffProfile?.staffRole));

  const {
    form: editForm,
    errors: editErrors,
    enhance: editEnhance,
    delayed: editDelayed,
  } = superForm(
    untrack(() => data.editForm),
    {
      id: 'edit-event',
      resetForm: false,
      onResult: ({ result }) => {
        if (result.type === 'success') {
          openEditEvent = false;
          toast.success(result.data?.form?.message ?? 'Enregistré.');
        } else if (result.type === 'failure') {
          toast.error(result.data?.form?.message ?? 'Action impossible.');
        }
      },
      onError: onErrorToast(),
    },
  );

  const {
    form: modulesForm,
    enhance: modulesEnhance,
    delayed: modulesDelayed,
  } = superForm(
    untrack(() => data.modulesForm),
    {
      id: 'event-modules',
      resetForm: false,
      onResult: ({ result }) => {
        if (result.type === 'success') {
          toast.success(result.data?.form?.message ?? 'Modules enregistrés.');
        } else if (result.type === 'failure') {
          toast.error(result.data?.form?.message ?? 'Action impossible.');
        }
      },
      onError: onErrorToast(),
    },
  );

  let openEditEvent = $state(false);

  const dateFmt = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const dateLabel = $derived(
    (() => {
      const start = dateFmt.format(new Date(data.event.date));
      if (!data.event.endDate) return start;
      return `${start} au ${dateFmt.format(new Date(data.event.endDate))}`;
    })(),
  );

  function applyPreset() {
    $modulesForm.modules = [...data.presetModules];
  }
</script>

<svelte:head>
  <title>{data.event.titre} - Paramètres</title>
</svelte:head>

<div class="mx-auto flex max-w-3xl flex-col gap-6">
  <header class="flex flex-wrap items-start justify-between gap-3">
    <div class="min-w-0">
      <p
        class="font-mono text-xs font-bold tracking-wide text-muted-foreground uppercase"
      >
        {eventTypeLabel(data.event.eventType)}
      </p>
      <h1 class="truncate text-2xl font-bold">{data.event.titre}</h1>
      <p class="text-sm text-muted-foreground">{dateLabel}</p>
    </div>
    <EventSalesforceButton externalId={data.event.externalId} />
  </header>

  <!-- Modules: which dev-workspace surfaces this event exposes. Per-event, so two
       events on one campus can differ. Lead-only; members see it read-only. -->
  <Card.Root class="rounded-sm">
    <Card.Header>
      <Card.Title class="flex items-center gap-2 text-base">
        <SlidersHorizontal class="h-4 w-4" /> Modules de l'événement
      </Card.Title>
      <Card.Description>
        Choisissez les pages activées pour cet événement. Les autres événements
        du campus gardent leur propre configuration.
      </Card.Description>
    </Card.Header>
    <form method="POST" action="?/setEventModules" use:modulesEnhance>
      <Card.Content class="space-y-2">
        {#each EVENT_MODULE_KEYS as key (key)}
          {@const def = EVENT_MODULE_DEFS[key]}
          <label
            class="flex cursor-pointer items-start gap-3 rounded-sm border border-border p-3 transition-colors hover:bg-muted/50 has-[:checked]:border-epi-blue has-[:checked]:bg-epi-blue/5"
          >
            <input
              type="checkbox"
              name="modules"
              value={key}
              bind:group={$modulesForm.modules}
              disabled={!isLead}
              class="mt-0.5 h-4 w-4 shrink-0 accent-epi-blue"
            />
            <span class="min-w-0">
              <span class="block text-sm font-bold">{def.label}</span>
              <span class="block text-xs text-muted-foreground"
                >{def.description}</span
              >
            </span>
          </label>
        {/each}
      </Card.Content>
      {#if isLead}
        <Card.Footer class="justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onclick={applyPreset}
            title="Réinitialiser sur le préréglage du type d'événement"
          >
            Préréglage {eventTypeLabel(data.event.eventType)}
          </Button>
          <Button type="submit" size="sm" disabled={$modulesDelayed}>
            {#if $modulesDelayed}
              <LoaderCircle class="mr-2 h-4 w-4 animate-spin" /> Enregistrement...
            {:else}
              Enregistrer les modules
            {/if}
          </Button>
        </Card.Footer>
      {/if}
    </form>
  </Card.Root>

  <!-- Arrival time + staff notes. -->
  <Card.Root class="rounded-sm">
    <Card.Content
      class="flex flex-wrap items-center justify-between gap-4 pt-6"
    >
      <div class="flex items-center gap-2 text-sm">
        <Clock class="h-4 w-4 text-muted-foreground" />
        <span class="text-muted-foreground">Heure d'arrivée des jeunes :</span>
        <StartTimeInline
          eventType={data.event.eventType}
          startMinutes={data.event.startMinutes}
        />
      </div>
      <Button
        variant="outline"
        size="sm"
        onclick={() => (openEditEvent = true)}
        disabled={!isLead}
      >
        <StickyNote class="mr-2 h-4 w-4" /> Notes
      </Button>
    </Card.Content>
  </Card.Root>
</div>

<EditEventDialog
  bind:open={openEditEvent}
  {editForm}
  {editErrors}
  {editEnhance}
  {editDelayed}
  themes={data.themes}
  canHaveTheme={data.canHaveTheme}
/>
