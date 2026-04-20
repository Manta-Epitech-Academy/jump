<script lang="ts">
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import {
    Phone,
    CheckCircle2,
    XCircle,
    CalendarClock,
    GripVertical,
    Plus,
  } from '@lucide/svelte';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { enhance } from '$app/forms';
  import InterviewGridModal from './components/InterviewGridModal.svelte';
  import ScheduleInterviewPopover from '$lib/components/interviews/ScheduleInterviewPopover.svelte';
  import { resolve } from '$app/paths';
  import * as Avatar from '$lib/components/ui/avatar';

  let { data } = $props();

  let planned = $derived(data.interviews.filter((i) => i.status === 'planned'));
  let completed = $derived(
    data.interviews.filter((i) => i.status === 'completed'),
  );

  let activeInterview = $state<any>(null);
  let gridOpen = $state(false);

  function openGrid(interview: any) {
    activeInterview = interview;
    gridOpen = true;
  }
</script>

<div class="flex h-full flex-col space-y-6 pb-10">
  <PageHeader
    title="Entretiens"
    subtitle="Pipeline des rendez-vous d'orientation et d'admission."
  />

  <!-- KANBAN BOARD -->
  <div class="grid flex-1 grid-cols-1 items-start gap-6 lg:grid-cols-3">
    <div
      class="flex h-[70vh] flex-col rounded-xl border bg-slate-50 p-4 dark:bg-slate-900/50"
    >
      <div
        class="mb-4 flex items-center justify-between border-b border-border/50 pb-3"
      >
        <h3
          class="flex items-center gap-2 font-heading tracking-wider text-muted-foreground uppercase"
        >
          <Phone class="h-4 w-4" />
          Talents à contacter
        </h3>
        <Badge variant="secondary" class="font-mono"
          >{data.talentsToCall.length}</Badge
        >
      </div>

      <div class="flex-1 space-y-3 overflow-y-auto pr-2 pb-10">
        {#each data.talentsToCall as talent}
          <div
            class="flex flex-col gap-2 rounded-lg border bg-card p-3 shadow-sm transition-all hover:border-epi-blue hover:shadow-md dark:shadow-none dark:ring-1 dark:ring-border/50 dark:hover:shadow-none"
          >
            <div class="flex items-start gap-3">
              <Avatar.Root class="h-8 w-8">
                <Avatar.Fallback
                  class="bg-primary/10 text-xs font-bold text-primary uppercase"
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
                <div class="mt-0.5 flex items-center gap-2">
                  <span
                    class="rounded-sm bg-epi-orange/10 px-1.5 py-0.5 text-[10px] font-bold text-epi-orange"
                    >{talent.xp} XP</span
                  >
                  <span class="truncate text-xs text-muted-foreground"
                    >{talent.phone || talent.parentPhone || 'Aucun n°'}</span
                  >
                </div>
              </div>
            </div>

            <div class="mt-2 border-t border-border/50 pt-2">
              <ScheduleInterviewPopover
                action="?/schedule"
                talentId={talent.id}
                timezone={data.timezone}
              >
                {#snippet trigger({ props })}
                  <Button
                    size="sm"
                    variant="ghost"
                    class="h-7 w-full text-xs text-epi-blue hover:bg-epi-blue hover:text-white"
                    {...props}
                    ><Plus class="mr-1 h-3 w-3" /> Planifier rapide</Button
                  >
                {/snippet}
              </ScheduleInterviewPopover>
            </div>
          </div>
        {:else}
          <p class="text-center text-xs text-muted-foreground italic py-12">
            La liste de talents est vide.
          </p>
        {/each}
      </div>
    </div>

    <div
      class="flex h-[70vh] flex-col rounded-xl border bg-blue-50/50 p-4 dark:bg-blue-950/20"
    >
      <div
        class="mb-4 flex items-center justify-between border-b border-blue-200/50 pb-3"
      >
        <h3
          class="flex items-center gap-2 font-heading tracking-wider text-epi-blue uppercase"
        >
          <CalendarClock class="h-4 w-4" />
          Planifiés
        </h3>
        <Badge variant="outline" class="bg-blue-100 font-mono text-blue-700"
          >{planned.length}</Badge
        >
      </div>

      <div class="flex-1 space-y-3 overflow-y-auto pr-2 pb-10">
        {#each planned as interview}
          <div
            class="group flex flex-col gap-3 rounded-lg border border-blue-100 bg-card p-3 shadow-sm transition-all hover:border-epi-blue dark:border-blue-900/50 dark:shadow-none"
          >
            <button
              type="button"
              class="flex w-full cursor-pointer gap-2 text-left"
              onclick={() => openGrid(interview)}
            >
              <GripVertical class="mt-1 h-4 w-4 text-muted-foreground/30" />
              <div>
                <div class="text-sm font-bold uppercase">
                  {interview.talent.nom}
                  <span class="capitalize">{interview.talent.prenom}</span>
                </div>
                <div
                  class="mt-1 inline-block rounded-sm bg-blue-50 px-2 py-0.5 text-xs font-bold text-epi-blue dark:bg-blue-900/30"
                >
                  {new Date(interview.date).toLocaleDateString('fr-FR', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </div>
            </button>
            <div
              class="mt-2 flex items-center justify-between gap-2 border-t border-blue-100 pt-2 dark:border-blue-900/50"
              role="group"
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
                  class="h-8 w-full bg-epi-teal text-xs text-black shadow-sm hover:bg-epi-teal/80 dark:shadow-none"
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
                          class="h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          ><XCircle class="h-4 w-4" /></Button
                        >
                      {/snippet}
                    </Tooltip.Trigger>
                    <Tooltip.Content><p>Annuler l'entretien</p></Tooltip.Content
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
      class="flex h-[70vh] flex-col rounded-xl border bg-green-50/50 p-4 dark:bg-green-950/20"
    >
      <div
        class="mb-4 flex items-center justify-between border-b border-green-200/50 pb-3"
      >
        <h3
          class="flex items-center gap-2 font-heading tracking-wider text-green-700 uppercase dark:text-green-500"
        >
          <CheckCircle2 class="h-4 w-4" />
          Terminés
        </h3>
        <Badge variant="outline" class="bg-green-100 font-mono text-green-700"
          >{completed.length}</Badge
        >
      </div>

      <div class="flex-1 space-y-3 overflow-y-auto pr-2 pb-10">
        {#each completed as interview}
          <button
            type="button"
            class="w-full cursor-pointer rounded-lg border border-green-100 bg-card p-3 text-left opacity-80 shadow-sm transition-all hover:opacity-100 dark:border-green-900/50 dark:shadow-none"
            onclick={() => openGrid(interview)}
          >
            <div class="mb-2 flex items-start justify-between">
              <div class="text-sm font-bold uppercase">
                {interview.talent.nom}
                <span class="capitalize">{interview.talent.prenom}</span>
              </div>
              <Badge
                variant="secondary"
                class="bg-green-50 text-[9px] text-green-700 dark:bg-green-900/30 dark:text-green-400"
                >Noté</Badge
              >
            </div>
            <div
              class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
            >
              Avec {interview.staff?.user?.name || 'Inconnu'}
            </div>
            {#if interview.globalNote}
              <p class="mt-2 line-clamp-2 text-xs text-muted-foreground italic">
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
