<script lang="ts">
  import { untrack } from 'svelte';
  import { superForm } from 'sveltekit-superforms';
  import {
    Calendar as CalendarIcon,
    ArrowLeft,
    Tag,
    Users,
    CalendarDays,
    StickyNote,
    Laptop,
    FileText,
    ScrollText,
    Camera,
    MessageSquare,
    Bell,
    UserCog,
    Pencil,
  } from '@lucide/svelte';
  import { goto } from '$app/navigation';
  import { toast } from 'svelte-sonner';

  import type { PageData } from './$types';
  import { Button, buttonVariants } from '$lib/components/ui/button';
  import { resolve } from '$app/paths';
  import * as Card from '$lib/components/ui/card';
  import * as Avatar from '$lib/components/ui/avatar';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import Gated from '$lib/components/auth/Gated.svelte';
  import ConfirmDeleteDialog from '$lib/components/ConfirmDeleteDialog.svelte';
  import { onErrorToast } from '$lib/utils/formErrors';
  import { renderMarkdown } from '$lib/markdown';
  import { cn } from '$lib/utils';
  import { EVENT_TYPES } from '$lib/domain/event';
  import type { FlagKey } from '$lib/domain/featureFlags';

  import EditEventSettingsModal from './components/EditEventSettingsModal.svelte';

  let { data }: { data: PageData } = $props();

  let featureFlags = $derived(
    new Set<FlagKey>((data.featureFlags ?? []) as FlagKey[]),
  );

  let isStageDeSeconde = $derived(
    data.event.eventType === EVENT_TYPES.STAGE_SECONDE &&
      featureFlags.has('stage_seconde'),
  );

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
          toast.success(result.data?.form.message);
        } else if (result.type === 'failure') {
          toast.error(result.data?.form?.message ?? 'Action impossible.');
        }
      },
      onError: onErrorToast(),
    },
  );

  let openEditEvent = $state(false);
  let deleteEventDialogOpen = $state(false);

  let notesHtml = $derived(
    data.event.notes ? renderMarkdown(data.event.notes) : '',
  );

  function ratioClass(n: number, t: number) {
    if (t === 0) return 'border-border bg-muted/20 text-muted-foreground';
    if (n === t)
      return 'border-green-200 bg-green-50 text-green-700 dark:border-green-900/50 dark:bg-green-900/20 dark:text-green-400';
    if (n === 0)
      return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-400';
    return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-900/20 dark:text-blue-400';
  }

  function getInitials(name: string | null | undefined) {
    if (!name) return '??';
    const parts = name.trim().split(' ').filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  }
</script>

<div class="flex flex-col space-y-6 pb-12">
  <div class="flex items-center justify-between border-b pb-4">
    <div class="flex items-center gap-4">
      <a
        href={resolve('/staff/dev')}
        class={buttonVariants({ variant: 'ghost', size: 'icon' })}
      >
        <ArrowLeft class="h-4 w-4" />
      </a>
      <div>
        <h1 class="text-3xl font-bold text-epi-blue uppercase">
          {data.event.titre}<span class="text-epi-teal">_</span>
        </h1>
        <div
          class="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-bold text-muted-foreground"
        >
          <div class="flex items-center gap-2">
            <CalendarIcon class="h-3.5 w-3.5" />
            <span>
              {new Date(data.event.date).toLocaleDateString('fr-FR', {
                day: 'numeric',
                month: 'short',
                timeZone: data.timezone,
              })}
              {#if data.event.endDate}
                – {new Date(data.event.endDate).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'short',
                  timeZone: data.timezone,
                })}
              {/if}
            </span>
          </div>
          {#if data.event.theme}
            <div class="flex items-center gap-1.5 uppercase">
              <Tag class="h-3.5 w-3.5 text-epi-teal-solid" />
              <span class="text-epi-teal-solid">{data.event.theme?.nom}</span>
            </div>
          {/if}
        </div>
      </div>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <a
        href={resolve(`/staff/dev/events/${data.event.id}/inscrits`)}
        class={buttonVariants({
          variant: 'outline',
          class: 'gap-2 rounded-sm',
        })}
      >
        <Users class="h-4 w-4" />
        Inscrits ({data.stats.total})
      </a>
      <a
        href={resolve(`/staff/dev/events/${data.event.id}/planning`)}
        class={buttonVariants({
          variant: 'outline',
          class: 'gap-2 rounded-sm',
        })}
      >
        <CalendarDays class="h-4 w-4" />
        Planning
      </a>
      <EditEventSettingsModal
        bind:open={openEditEvent}
        bind:deleteEventDialogOpen
        {editForm}
        {editErrors}
        {editEnhance}
        {editDelayed}
        themes={data.themes}
        staff={data.staff}
      />
    </div>
  </div>

  <div class="grid gap-4 md:grid-cols-12">
    <Card.Root class="rounded-sm shadow-sm md:col-span-8">
      <Card.Header class="flex flex-row items-center justify-between pb-3">
        <Card.Title
          class="flex items-center gap-2 text-xs font-bold tracking-widest text-muted-foreground uppercase"
        >
          <StickyNote class="h-4 w-4 text-epi-blue" /> Notes de l'événement
        </Card.Title>
        <Gated group="devLead" mode="hide">
          <Tooltip.Provider delayDuration={300}>
            <Tooltip.Root>
              <Tooltip.Trigger>
                {#snippet child({ props: tooltipProps })}
                  <Button
                    {...tooltipProps}
                    variant="ghost"
                    size="icon"
                    class="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onclick={() => (openEditEvent = true)}
                  >
                    <Pencil class="h-3.5 w-3.5" />
                  </Button>
                {/snippet}
              </Tooltip.Trigger>
              <Tooltip.Content class="rounded-sm">
                <p>Modifier les notes</p>
              </Tooltip.Content>
            </Tooltip.Root>
          </Tooltip.Provider>
        </Gated>
      </Card.Header>
      <Card.Content>
        {#if notesHtml}
          <div
            class="prose max-w-none text-sm leading-relaxed prose-slate dark:prose-invert"
          >
            {@html notesHtml}
          </div>
        {:else}
          <p class="text-sm text-muted-foreground italic">
            Aucune note. Ajoutez du contexte (objectifs, consignes, infos
            pratiques) via les paramètres de l'événement.
          </p>
        {/if}
      </Card.Content>
    </Card.Root>

    <Card.Root class="rounded-sm shadow-sm md:col-span-4">
      <Card.Header class="flex flex-row items-center justify-between pb-3">
        <Card.Title
          class="flex items-center gap-2 text-xs font-bold tracking-widest text-muted-foreground uppercase"
        >
          <UserCog class="h-4 w-4 text-epi-teal-solid" /> Mantas assignés ({data
            .event.mantas.length})
        </Card.Title>
        <Gated group="devLead" mode="hide">
          <Tooltip.Provider delayDuration={300}>
            <Tooltip.Root>
              <Tooltip.Trigger>
                {#snippet child({ props: tooltipProps })}
                  <Button
                    {...tooltipProps}
                    variant="ghost"
                    size="icon"
                    class="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onclick={() => (openEditEvent = true)}
                  >
                    <Pencil class="h-3.5 w-3.5" />
                  </Button>
                {/snippet}
              </Tooltip.Trigger>
              <Tooltip.Content class="rounded-sm">
                <p>Modifier les mantas assignés</p>
              </Tooltip.Content>
            </Tooltip.Root>
          </Tooltip.Provider>
        </Gated>
      </Card.Header>
      <Card.Content>
        {#if data.event.mantas.length > 0}
          <ul class="space-y-2">
            {#each data.event.mantas as m (m.staffProfileId)}
              <li class="flex items-center gap-3 text-sm">
                <Avatar.Root class="h-8 w-8 rounded-sm">
                  <Avatar.Fallback
                    class="bg-primary/5 text-xs font-bold text-primary"
                  >
                    {getInitials(m.staffProfile?.user?.name)}
                  </Avatar.Fallback>
                </Avatar.Root>
                <span class="font-bold"
                  >{m.staffProfile?.user?.name ?? 'Inconnu'}</span
                >
              </li>
            {/each}
          </ul>
        {:else}
          <p class="text-sm text-muted-foreground italic">
            Aucun manta assigné. Modifiez les paramètres pour en ajouter.
          </p>
        {/if}
      </Card.Content>
    </Card.Root>
  </div>

  <div
    class={cn(
      'grid grid-cols-2 gap-3 sm:grid-cols-3',
      isStageDeSeconde ? 'lg:grid-cols-6' : 'lg:grid-cols-2',
    )}
  >
    <a
      href={resolve(`/staff/dev/events/${data.event.id}/inscrits`)}
      class={cn(
        'rounded-sm border p-4 shadow-sm transition-all hover:shadow-md',
        'border-border bg-card',
      )}
    >
      <div
        class="flex items-center gap-2 text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
      >
        <Users class="h-3.5 w-3.5" />
        Inscrits
      </div>
      <div class="mt-2 font-mono text-2xl font-black">{data.stats.total}</div>
    </a>
    <div
      class={cn(
        'rounded-sm border p-4 shadow-sm',
        ratioClass(data.stats.bringPc, data.stats.total),
      )}
    >
      <div
        class="flex items-center gap-2 text-[10px] font-bold tracking-widest uppercase"
      >
        <Laptop class="h-3.5 w-3.5" />
        PC à apporter
      </div>
      <div class="mt-2 font-mono text-2xl font-black">
        {data.stats.bringPc}<span class="text-base text-muted-foreground"
          >/{data.stats.total}</span
        >
      </div>
    </div>
    {#if isStageDeSeconde}
      <a
        href={resolve(`/staff/dev/events/${data.event.id}/suivi-adm`)}
        class={cn(
          'rounded-sm border p-4 shadow-sm transition-all hover:shadow-md',
          ratioClass(data.stats.chartes, data.stats.total),
        )}
      >
        <div
          class="flex items-center gap-2 text-[10px] font-bold tracking-widest uppercase"
        >
          <FileText class="h-3.5 w-3.5" />
          Chartes
        </div>
        <div class="mt-2 font-mono text-2xl font-black">
          {data.stats.chartes}<span class="text-base text-muted-foreground"
            >/{data.stats.total}</span
          >
        </div>
      </a>
      <a
        href={resolve(`/staff/dev/events/${data.event.id}/suivi-adm`)}
        class={cn(
          'rounded-sm border p-4 shadow-sm transition-all hover:shadow-md',
          ratioClass(data.stats.conventions, data.stats.total),
        )}
      >
        <div
          class="flex items-center gap-2 text-[10px] font-bold tracking-widest uppercase"
        >
          <ScrollText class="h-3.5 w-3.5" />
          Conventions
        </div>
        <div class="mt-2 font-mono text-2xl font-black">
          {data.stats.conventions}<span class="text-base text-muted-foreground"
            >/{data.stats.total}</span
          >
        </div>
      </a>
      <a
        href={resolve(`/staff/dev/events/${data.event.id}/suivi-adm`)}
        class={cn(
          'rounded-sm border p-4 shadow-sm transition-all hover:shadow-md',
          ratioClass(data.stats.droitsImage, data.stats.total),
        )}
      >
        <div
          class="flex items-center gap-2 text-[10px] font-bold tracking-widest uppercase"
        >
          <Camera class="h-3.5 w-3.5" />
          Droit image
        </div>
        <div class="mt-2 font-mono text-2xl font-black">
          {data.stats.droitsImage}<span class="text-base text-muted-foreground"
            >/{data.stats.total}</span
          >
        </div>
      </a>
      <a
        href={resolve(`/staff/dev/events/${data.event.id}/interviews`)}
        class={cn(
          'rounded-sm border p-4 shadow-sm transition-all hover:shadow-md',
          ratioClass(data.stats.interviewsCompleted, data.stats.total),
        )}
      >
        <div
          class="flex items-center gap-2 text-[10px] font-bold tracking-widest uppercase"
        >
          <MessageSquare class="h-3.5 w-3.5" />
          Entretiens
        </div>
        <div class="mt-2 font-mono text-2xl font-black">
          {data.stats.interviewsCompleted}<span
            class="text-base text-muted-foreground">/{data.stats.total}</span
          >
        </div>
      </a>
    {/if}
  </div>

  <Card.Root class="rounded-sm border-dashed shadow-sm">
    <Card.Header class="pb-3">
      <Card.Title
        class="flex items-center gap-2 text-xs font-bold tracking-widest text-muted-foreground uppercase"
      >
        <Bell class="h-4 w-4 text-epi-orange" /> Alertes
      </Card.Title>
    </Card.Header>
    <Card.Content>
      <p class="text-sm text-muted-foreground italic">
        Aucune alerte. À venir : relances en retard, signatures manquantes,
        créneaux d'entretien vides.
      </p>
    </Card.Content>
  </Card.Root>
</div>

<ConfirmDeleteDialog
  bind:open={deleteEventDialogOpen}
  action="?/deleteEvent"
  title="Supprimer définitivement ?"
  description="Cette action est irréversible. Toutes les données associées à cet événement seront perdues."
  buttonText="Confirmer la suppression"
  onSuccess={() => goto(resolve('/staff/dev'))}
/>
