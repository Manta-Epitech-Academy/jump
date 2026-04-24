<script lang="ts">
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import {
    Phone,
    CheckCircle2,
    XCircle,
    CalendarClock,
    GripVertical,
    Plus,
    Sparkles,
    ArrowLeft,
  } from '@lucide/svelte';
  import { Badge } from '$lib/components/ui/badge';
  import { Button, buttonVariants } from '$lib/components/ui/button';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { enhance } from '$app/forms';
  import InterviewGridModal from '$lib/components/interviews/InterviewGridModal.svelte';
  import ScheduleInterviewPopover from '$lib/components/interviews/ScheduleInterviewPopover.svelte';
  import AutoScheduleDialog from '$lib/components/interviews/AutoScheduleDialog.svelte';
  import { resolve } from '$app/paths';
  import * as Avatar from '$lib/components/ui/avatar';

  let { data } = $props();

  let planned = $derived(data.interviews.filter((i) => i.status === 'planned'));
  let completed = $derived(
    data.interviews.filter((i) => i.status === 'completed'),
  );

  let activeInterview = $state<any>(null);
  let gridOpen = $state(false);
  let autoOpen = $state(false);

  function openGrid(interview: any) {
    activeInterview = interview;
    gridOpen = true;
  }
</script>

<div class="flex h-full flex-col space-y-6 pb-10">
  <div class="flex items-start justify-between gap-4">
    <div class="flex items-center gap-3">
      <a
        href={resolve(`/staff/dev/events/${data.event.id}/manage`)}
        class={buttonVariants({ variant: 'ghost', size: 'icon' })}
      >
        <ArrowLeft class="h-4 w-4" />
      </a>
      <PageHeader
        title="Entretiens"
        subtitle={`Entretiens de mi-parcours — ${data.event.titre}.`}
      />
    </div>
    {#if data.participationsToCall.length > 0 && data.devs.length > 0}
      <Button
        onclick={() => (autoOpen = true)}
        class="gap-2 rounded-sm shadow-sm"
      >
        <Sparkles class="h-4 w-4" />
        Planifier tous les entretiens
      </Button>
    {/if}
  </div>

  <div class="grid flex-1 grid-cols-1 items-start gap-4 lg:grid-cols-3">
    <div
      class="flex h-[70vh] flex-col rounded-sm border bg-muted/10 p-4 shadow-sm"
    >
      <div
        class="mb-4 flex items-center justify-between border-b border-border/50 pb-3"
      >
        <h3
          class="flex items-center gap-2 font-sans text-sm font-bold tracking-wide text-foreground uppercase"
        >
          <Phone class="h-4 w-4" />
          À contacter
        </h3>
        <Badge
          variant="secondary"
          class="rounded-sm px-1.5 py-0 font-mono text-[10px]"
          >{data.participationsToCall.length}</Badge
        >
      </div>

      <div class="flex-1 space-y-3 overflow-y-auto pr-2 pb-10">
        {#each data.participationsToCall as participation}
          {@const talent = participation.talent}
          <div
            class="flex flex-col gap-2 rounded-sm border bg-card p-3 shadow-sm transition-all hover:border-epi-blue/50 hover:shadow-md"
          >
            <div class="flex items-start gap-3">
              <Avatar.Root class="h-8 w-8 rounded-sm">
                <Avatar.Fallback
                  class="bg-primary/10 text-[10px] font-bold text-primary uppercase"
                  >{talent.nom[0]}{talent.prenom[0]}</Avatar.Fallback
                >
              </Avatar.Root>
              <div class="min-w-0 flex-1">
                <a
                  href={resolve(`/staff/dev/students/${talent.id}`)}
                  class="block truncate text-sm font-bold uppercase transition-colors hover:text-epi-blue"
                  >{talent.nom}
                  <span class="capitalize">{talent.prenom}</span></a
                >
                <div class="mt-1 flex items-center gap-2">
                  <span
                    class="rounded-sm bg-epi-orange/10 px-1.5 py-0.5 text-[9px] font-bold tracking-widest text-epi-orange uppercase"
                    >{talent.xp} XP</span
                  >
                  <span
                    class="truncate text-[10px] font-medium text-muted-foreground"
                    >{talent.phone || talent.parentPhone || 'Aucun n°'}</span
                  >
                </div>
              </div>
            </div>

            <div class="mt-2 border-t border-border/50 pt-2">
              <ScheduleInterviewPopover
                action="?/schedule"
                participationId={participation.id}
                timezone={data.timezone}
              >
                {#snippet trigger({ props })}
                  <Button
                    size="sm"
                    variant="ghost"
                    class="h-7 w-full rounded-sm text-xs font-bold text-epi-blue transition-colors hover:bg-epi-blue hover:text-white"
                    {...props}><Plus class="mr-1 h-3 w-3" /> Planifier</Button
                  >
                {/snippet}
              </ScheduleInterviewPopover>
            </div>
          </div>
        {:else}
          <p
            class="text-center text-xs font-medium text-muted-foreground py-12"
          >
            Tous les stagiaires ont un entretien planifié.
          </p>
        {/each}
      </div>
    </div>

    <div
      class="flex h-[70vh] flex-col rounded-sm border bg-blue-50/30 p-4 shadow-sm dark:bg-blue-950/10"
    >
      <div
        class="mb-4 flex items-center justify-between border-b border-blue-200/50 pb-3"
      >
        <h3
          class="flex items-center gap-2 font-sans text-sm font-bold tracking-wide text-epi-blue uppercase"
        >
          <CalendarClock class="h-4 w-4" />
          Planifiés
        </h3>
        <Badge
          variant="outline"
          class="rounded-sm border-blue-200 bg-blue-100 px-1.5 py-0 font-mono text-[10px] text-blue-700"
          >{planned.length}</Badge
        >
      </div>

      <div class="flex-1 space-y-3 overflow-y-auto pr-2 pb-10">
        {#each planned as interview}
          <div
            class="group flex flex-col gap-3 rounded-sm border border-blue-100 bg-card p-3 shadow-sm transition-all hover:border-epi-blue/50 hover:shadow-md dark:border-blue-900/50"
          >
            <button
              type="button"
              class="flex w-full cursor-pointer gap-3 text-left"
              onclick={() => openGrid(interview)}
            >
              <GripVertical
                class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/30"
              />
              <div class="min-w-0">
                <div class="truncate text-sm font-bold uppercase">
                  {interview.talent.nom}
                  <span class="capitalize">{interview.talent.prenom}</span>
                </div>
                <div
                  class="mt-1 inline-block rounded-sm bg-blue-50 px-2 py-0.5 text-[10px] font-bold tracking-widest text-epi-blue uppercase dark:bg-blue-900/30"
                >
                  {new Date(interview.date).toLocaleDateString('fr-FR', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
                <div
                  class="mt-1.5 truncate text-[9px] font-bold tracking-widest text-muted-foreground uppercase"
                >
                  Avec {interview.staff?.user?.name || 'Inconnu'}
                </div>
              </div>
            </button>
            <div
              class="mt-2 flex items-center justify-between gap-2 border-t border-blue-100 pt-2 dark:border-blue-900/50"
            >
              <form
                action="?/updateStatus"
                method="POST"
                use:enhance
                class="flex-1"
              >
                <input type="hidden" name="id" value={interview.id} />
                <input type="hidden" name="status" value="completed" />
                <Button
                  variant="default"
                  size="sm"
                  class="h-8 w-full rounded-sm bg-epi-teal-solid text-xs font-bold text-white shadow-sm hover:bg-epi-teal-solid/80"
                  ><CheckCircle2 class="mr-1.5 h-3.5 w-3.5" /> Fait</Button
                >
              </form>
              <form
                action="?/updateStatus"
                method="POST"
                use:enhance
                class="shrink-0"
              >
                <input type="hidden" name="id" value={interview.id} />
                <input type="hidden" name="status" value="cancelled" />
                <Tooltip.Provider delayDuration={300}>
                  <Tooltip.Root>
                    <Tooltip.Trigger>
                      {#snippet child({ props })}
                        <Button
                          {...props}
                          variant="ghost"
                          size="sm"
                          class="h-8 w-8 rounded-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          ><XCircle class="h-4 w-4" /></Button
                        >
                      {/snippet}
                    </Tooltip.Trigger>
                    <Tooltip.Content class="rounded-sm"
                      ><p>Annuler l'entretien</p></Tooltip.Content
                    >
                  </Tooltip.Root>
                </Tooltip.Provider>
              </form>
            </div>
          </div>
        {/each}
      </div>
    </div>

    <div
      class="flex h-[70vh] flex-col rounded-sm border bg-green-50/30 p-4 shadow-sm dark:bg-green-950/10"
    >
      <div
        class="mb-4 flex items-center justify-between border-b border-green-200/50 pb-3"
      >
        <h3
          class="flex items-center gap-2 font-sans text-sm font-bold tracking-wide text-green-700 uppercase dark:text-green-500"
        >
          <CheckCircle2 class="h-4 w-4" />
          Terminés
        </h3>
        <Badge
          variant="outline"
          class="rounded-sm border-green-200 bg-green-100 px-1.5 py-0 font-mono text-[10px] text-green-700"
          >{completed.length}</Badge
        >
      </div>

      <div class="flex-1 space-y-3 overflow-y-auto pr-2 pb-10">
        {#each completed as interview}
          <button
            type="button"
            class="w-full cursor-pointer rounded-sm border border-green-100 bg-card p-3 text-left shadow-sm transition-all hover:border-green-300 hover:shadow-md dark:border-green-900/50"
            onclick={() => openGrid(interview)}
          >
            <div class="mb-2 flex items-start justify-between">
              <div class="truncate pr-2 text-sm font-bold uppercase">
                {interview.talent.nom}
                <span class="capitalize">{interview.talent.prenom}</span>
              </div>
              <Badge
                variant="secondary"
                class="shrink-0 rounded-sm bg-green-50 text-[9px] tracking-widest text-green-700 uppercase dark:bg-green-900/30 dark:text-green-400"
                >Noté</Badge
              >
            </div>
            <div
              class="truncate text-[9px] font-bold tracking-widest text-muted-foreground uppercase"
            >
              Avec {interview.staff?.user?.name || 'Inconnu'}
            </div>
            {#if interview.globalNote}
              <p
                class="mt-2 line-clamp-2 border-l-2 border-green-200 pl-2 text-xs font-medium text-muted-foreground"
              >
                "{interview.globalNote}"
              </p>
            {/if}
          </button>
        {/each}
      </div>
    </div>
  </div>
</div>

<InterviewGridModal bind:open={gridOpen} interview={activeInterview} />
<AutoScheduleDialog
  bind:open={autoOpen}
  devs={data.devs}
  candidates={data.participationsToCall}
  timezone={data.timezone}
/>
