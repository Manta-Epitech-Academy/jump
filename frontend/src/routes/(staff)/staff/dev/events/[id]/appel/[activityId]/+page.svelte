<script lang="ts">
  import type { PageData } from './$types';
  import {
    User,
    Laptop,
    MonitorX,
    Award,
    Sprout,
    Clock,
    LifeBuoy,
  } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { untrack } from 'svelte';
  import ParticipationCard from '../components/ParticipationCard.svelte';
  import { toast } from 'svelte-sonner';
  import { cn } from '$lib/utils';
  import { enhance } from '$app/forms';
  import NoteInput from '../components/NoteInput.svelte';
  import { triggerConfetti } from '$lib/actions/confetti';
  import { resolve } from '$app/paths';
  import { Badge } from '$lib/components/ui/badge';

  import AppelLogisticsHeader from '../components/AppelLogisticsHeader.svelte';
  import AppelFilterBar from '../components/AppelFilterBar.svelte';

  import type { ParticipationWithDetails } from '$lib/types';

  let { data }: { data: PageData } = $props();

  let participations = $state<ParticipationWithDetails[]>(
    untrack(() => data.participations),
  );
  let progressRecords = $state<any[]>(untrack(() => data.progressData));

  let studentProgressMap = $derived.by(() => {
    const map = new Map<string, any[]>();
    progressRecords.forEach((p) => {
      const key = p.talentId;
      if (!map.has(key)) map.set(key, []);
      map.get(key)?.push(p);
    });
    return map;
  });

  let searchQuery = $state('');
  let filterStatus = $state<'all' | 'present' | 'late' | 'help'>('all');
  let viewMode = $state<'grid' | 'list'>('grid');
  let filterNiveau = $state<string>('all');

  $effect(() => {
    participations = data.participations as ParticipationWithDetails[];
    progressRecords = data.progressData;
  });

  // TODO: implement SSE or polling for live attendance and step progress updates

  const optimisticToggle = (id: string, field: 'isPresent' | 'bringPc') => {
    return () => {
      const index = participations.findIndex((p) => p.id === id);
      if (index !== -1) {
        const p = participations[index];
        if (field === 'isPresent') {
          p.isPresent = !p.isPresent;
          if (!p.isPresent) p.delay = 0;
        }
        if (field === 'bringPc') p.bringPc = !p.bringPc;
      }
      return async ({
        result,
        update,
      }: {
        result: any;
        update: () => Promise<void>;
      }) => {
        if (result.type === 'failure' || result.type === 'error') {
          const i = participations.findIndex((p) => p.id === id);
          if (i !== -1) {
            const p = participations[i];
            if (field === 'isPresent') {
              p.isPresent = !p.isPresent;
            }
            if (field === 'bringPc') p.bringPc = !p.bringPc;
          }
        }
        await update();
      };
    };
  };

  let uniqueNiveaux = $derived.by(() => {
    const niveaux = new Set<string>();
    const typedParticipations =
      data.participations as ParticipationWithDetails[];
    typedParticipations.forEach((p) => {
      if (p.talent?.niveau) niveaux.add(p.talent.niveau);
    });
    const order = [
      '6eme',
      '5eme',
      '4eme',
      '3eme',
      '2nde',
      '1ere',
      'Terminale',
      'Sup',
    ];
    return Array.from(niveaux).sort((a, b) => {
      const indexA = order.indexOf(a);
      const indexB = order.indexOf(b);
      if (indexA !== -1 && indexB !== -1) return indexA - indexB;
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      return a.localeCompare(b);
    });
  });

  let filteredParticipations = $derived(
    participations.filter((p) => {
      const matchesSearch =
        p.talent?.nom?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.talent?.prenom?.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;

      let matchesStatus = filterStatus === 'all';
      if (filterStatus === 'present') matchesStatus = p.isPresent === true;
      if (filterStatus === 'late') matchesStatus = (p.delay || 0) > 0;
      if (filterStatus === 'help') {
        const prgs = studentProgressMap.get(p.talentId) || [];
        matchesStatus = prgs.some((prog) => prog.status === 'needs_help');
      }

      const matchesNiveau =
        filterNiveau === 'all' || p.talent?.niveau === filterNiveau;

      return matchesStatus && matchesNiveau;
    }),
  );

  let presentCount = $derived(participations.filter((p) => p.isPresent).length);
  let lateCount = $derived(
    participations.filter((p) => (p.delay || 0) > 0).length,
  );
  let helpCount = $derived(
    progressRecords.filter((p) => p.status === 'needs_help').length,
  );
  let totalStudents = $derived(participations.length);
  let pcsNeeded = $derived(participations.filter((p) => !p.bringPc).length);

  async function handleDiplomaDownload(
    participation: ParticipationWithDetails,
  ) {
    const toastId = toast.loading('Génération du diplôme...');
    try {
      const res = await fetch(
        `${resolve('/api/diploma')}?participationId=${participation.id}`,
      );
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Erreur lors de la génération');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      const disposition = res.headers.get('Content-Disposition');
      let filename = 'Diplome.pdf';
      if (disposition && disposition.indexOf('filename=') !== -1) {
        filename = disposition.split('filename=')[1].replace(/"/g, '');
      }

      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success('Diplôme téléchargé !', { id: toastId });
      triggerConfetti();
    } catch (e: any) {
      console.error(e);
      toast.error(`Erreur : ${e.message}`, { id: toastId });
    }
  }
</script>

<div class="flex min-h-screen flex-col bg-background pb-20">
  <AppelLogisticsHeader
    event={data.event}
    {presentCount}
    {lateCount}
    {helpCount}
    {totalStudents}
    {pcsNeeded}
  />

  <AppelFilterBar
    bind:searchQuery
    bind:filterNiveau
    bind:filterStatus
    bind:viewMode
    {uniqueNiveaux}
    {helpCount}
  />

  <div class="container mx-auto mt-6 max-w-2xl px-4 pb-20">
    {#if viewMode === 'grid'}
      <div class="space-y-3">
        {#each filteredParticipations as p, i (p.id)}
          <ParticipationCard
            participation={p}
            event={data.event}
            progress={studentProgressMap.get(p.talentId) || []}
            {optimisticToggle}
            onDownload={() => handleDiplomaDownload(p)}
            index={i}
          />
        {/each}
      </div>
    {:else}
      <div class="rounded-sm border bg-card">
        {#each filteredParticipations as p (p.id)}
          {@const count = p.talent?.eventsCount || 0}
          {@const isPresent = p.isPresent ? 1 : 0}
          {@const isNew = count - isPresent === 0}
          {@const pProgress = studentProgressMap.get(p.talentId) || []}
          {@const needsHelp = pProgress.some(
            (prog) => prog.status === 'needs_help',
          )}

          <div
            class={cn(
              'flex items-center justify-between border-b p-3 last:border-0 hover:bg-muted/20',
              needsHelp && 'bg-orange-50/50 dark:bg-orange-950/20',
            )}
          >
            <div class="flex items-center gap-3">
              <form
                method="POST"
                action="?/togglePresent"
                use:enhance={optimisticToggle(p.id, 'isPresent')}
              >
                <input type="hidden" name="id" value={p.id} />
                <input
                  type="hidden"
                  name="state"
                  value={p.isPresent.toString()}
                />
                <button
                  type="submit"
                  class={cn(
                    'flex h-8 w-8 items-center justify-center rounded-sm border transition-all',
                    p.isPresent
                      ? (p.delay || 0) > 0
                        ? 'border-orange-300 bg-orange-100 text-orange-800 hover:bg-orange-200'
                        : 'border-epi-teal bg-epi-teal text-black'
                      : 'border-border text-muted-foreground hover:border-epi-teal',
                  )}
                >
                  {#if (p.delay || 0) > 0}<Clock class="h-4 w-4" />{:else}<User
                      class="h-4 w-4"
                    />{/if}
                </button>
              </form>

              <div class="flex flex-col">
                <span class="flex items-center gap-2 text-sm font-bold">
                  {#if p.talent?.id}
                    <a
                      href={resolve(`/staff/dev/students/${p.talent.id}`)}
                      class="transition-colors hover:text-epi-blue"
                      ><span class="uppercase">{p.talent.nom}</span>
                      {p.talent.prenom}</a
                    >
                  {:else}
                    <span>Étudiant inconnu</span>
                  {/if}
                  {#if isNew}<Badge
                      variant="outline"
                      class="gap-1 border-green-200 bg-green-50 px-1 py-0 text-[9px] text-green-700 dark:border-green-900 dark:bg-green-900/30 dark:text-green-400"
                      ><Sprout class="h-2.5 w-2.5" /> Nouveau</Badge
                    >{/if}
                </span>
                <div
                  class="flex items-center gap-2 text-[10px] text-muted-foreground uppercase"
                >
                  <span>{p.talent?.niveau}</span>
                  {#if (p.delay || 0) > 0}<span
                      class="flex items-center gap-1 font-bold text-orange-500"
                      ><Clock class="h-2.5 w-2.5" />{p.delay}m</span
                    >{/if}
                  {#if needsHelp}<span
                      class="flex items-center gap-1 font-bold text-epi-orange"
                      ><LifeBuoy class="h-3 w-3" /> Aide Demandée</span
                    >{/if}
                </div>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <form
                method="POST"
                action="?/toggleBringPc"
                use:enhance={optimisticToggle(p.id, 'bringPc')}
                class="inline"
              >
                <input type="hidden" name="id" value={p.id} />
                <input
                  type="hidden"
                  name="state"
                  value={p.bringPc.toString()}
                />
                <Tooltip.Provider delayDuration={300}>
                  <Tooltip.Root>
                    <Tooltip.Trigger>
                      {#snippet child({ props })}
                        <button
                          {...props}
                          type="submit"
                          class="cursor-pointer rounded p-1 transition-colors hover:bg-muted"
                        >
                          {#if p.bringPc}
                            <Laptop class="h-4 w-4 text-purple-400" />
                          {:else}
                            <MonitorX class="h-4 w-4 text-orange-400" />
                          {/if}
                        </button>
                      {/snippet}
                    </Tooltip.Trigger>
                    <Tooltip.Content>
                      <p>
                        {p.bringPc
                          ? 'Avec PC — cliquer pour changer'
                          : 'Besoin PC — cliquer pour changer'}
                      </p>
                    </Tooltip.Content>
                  </Tooltip.Root>
                </Tooltip.Provider>
              </form>
              {#if p.isPresent}
                <div class="w-40 sm:w-48">
                  <NoteInput
                    id={p.id}
                    value={p.note ?? undefined}
                    placeholder="..."
                    class="h-8 text-xs"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-8 w-8"
                  onclick={() => handleDiplomaDownload(p)}
                  ><Award class="h-4 w-4" /></Button
                >
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}

    {#if filteredParticipations.length === 0}
      <div class="py-20 text-center">
        <p class="font-bold text-muted-foreground uppercase">
          Aucun élève à afficher.
        </p>
      </div>
    {/if}
  </div>
</div>
