<script lang="ts">
  import { untrack } from 'svelte';
  import FileText from '@lucide/svelte/icons/file-text';
  import ScrollText from '@lucide/svelte/icons/scroll-text';
  import Camera from '@lucide/svelte/icons/camera';
  import Send from '@lucide/svelte/icons/send';
  import { resolve } from '$app/paths';
  import { superForm } from 'sveltekit-superforms';
  import type { PageData } from './$types';
  import { Button } from '$lib/components/ui/button';
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import PageBreadcrumb from '$lib/components/layout/PageBreadcrumb.svelte';
  import Gated from '$lib/components/auth/Gated.svelte';
  import { cn } from '$lib/utils';
  import { toast } from 'svelte-sonner';
  import SuiviAdmTable from './components/SuiviAdmTable.svelte';
  import { track } from '$lib/analytics';

  let { data }: { data: PageData } = $props();

  let participations = $state(untrack(() => data.participations));
  $effect(() => {
    participations = data.participations;
  });

  let total = $derived(participations.length);

  let charteCount = $derived(
    participations.filter((p) => p.stageCompliance?.charteSigned).length,
  );
  let conventionCount = $derived(
    participations.filter((p) => p.stageCompliance?.conventionSigned).length,
  );
  let imageCount = $derived(
    participations.filter((p) => p.stageCompliance?.imageRightsSigned).length,
  );

  function ratioClass(n: number, t: number) {
    if (t === 0) return 'border-border bg-muted/20 text-muted-foreground';
    if (n === t)
      return 'border-green-200 bg-green-50 text-green-700 dark:border-green-900/50 dark:bg-green-900/20 dark:text-green-400';
    if (n === 0)
      return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-400';
    return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-900/20 dark:text-blue-400';
  }

  const optimisticAdminToggle = (id: string, docType: string) => {
    return () => {
      const index = participations.findIndex((p) => p.id === id);
      if (index !== -1) {
        const compliance = (participations[index].stageCompliance ??= {
          charteSigned: false,
          conventionSigned: false,
          imageRightsSigned: false,
          participationId: id,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        if (docType === 'charte')
          compliance.charteSigned = !compliance.charteSigned;
        if (docType === 'convention')
          compliance.conventionSigned = !compliance.conventionSigned;
        if (docType === 'image')
          compliance.imageRightsSigned = !compliance.imageRightsSigned;
      }
      return async ({ update }: { update: () => Promise<void> }) => {
        await update();
      };
    };
  };

  const optimisticPcToggle = (id: string) => {
    return () => {
      const index = participations.findIndex((p) => p.id === id);
      if (index !== -1)
        participations[index].bringPc = !participations[index].bringPc;
      return async ({ update }: { update: () => Promise<void> }) => {
        await update();
      };
    };
  };

  // Reminders
  let selectedTalentIds = $state<Set<string>>(new Set());
  let sendType = $state<'student' | 'parent'>('student');
  let showConfirm = $state(false);

  const { enhance: reminderEnhance } = superForm(
    untrack(() => data.reminderForm),
    {
      resetForm: false,
      onResult: ({ result }) => {
        if (result.type === 'success') {
          track('adm_reminders_sent', {
            type: sendType,
            count: selectedTalentIds.size,
          });
          toast.success(result.data?.form?.message || 'Relances envoyées');
          selectedTalentIds = new Set();
        } else if (result.type === 'failure' && result.data?.form?.message) {
          track('adm_reminders_failed');
          toast.error(result.data.form.message);
        }
      },
    },
  );

  function toggleAllTalents() {
    if (selectedTalentIds.size === participations.length) {
      selectedTalentIds = new Set();
    } else {
      selectedTalentIds = new Set(participations.map((p) => p.talent.id));
    }
  }

  function toggleTalent(talentId: string) {
    const next = new Set(selectedTalentIds);
    if (next.has(talentId)) next.delete(talentId);
    else next.add(talentId);
    selectedTalentIds = next;
  }

  function prepareSend(type: 'student' | 'parent') {
    sendType = type;
    showConfirm = true;
  }
</script>

<svelte:head>
  <title>{data.event.titre} — Suivi ADM</title>
</svelte:head>

<div class="flex h-full flex-col space-y-6 pb-10">
  <PageBreadcrumb
    items={[
      { label: 'Dashboard', href: resolve('/staff/dev') },
      {
        label: data.event.titre,
        href: resolve(`/staff/dev/events/${data.event.id}/manage`),
      },
      { label: 'Suivi ADM' },
    ]}
  />
  <PageHeader title="Suivi ADM" subtitle={data.event.titre} />

  <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    <div
      class={cn(
        'rounded-sm border p-4 shadow-sm',
        ratioClass(charteCount, total),
      )}
    >
      <div
        class="flex items-center gap-2 text-[10px] font-bold tracking-widest uppercase"
      >
        <FileText class="h-3.5 w-3.5" />
        Charte informatique
      </div>
      <div class="mt-2 font-mono text-2xl font-black">
        {charteCount}<span class="text-base text-muted-foreground"
          >/{total}</span
        >
      </div>
    </div>
    <div
      class={cn(
        'rounded-sm border p-4 shadow-sm',
        ratioClass(conventionCount, total),
      )}
    >
      <div
        class="flex items-center gap-2 text-[10px] font-bold tracking-widest uppercase"
      >
        <ScrollText class="h-3.5 w-3.5" />
        Convention de stage
      </div>
      <div class="mt-2 font-mono text-2xl font-black">
        {conventionCount}<span class="text-base text-muted-foreground"
          >/{total}</span
        >
      </div>
    </div>
    <div
      class={cn(
        'rounded-sm border p-4 shadow-sm',
        ratioClass(imageCount, total),
      )}
    >
      <div
        class="flex items-center gap-2 text-[10px] font-bold tracking-widest uppercase"
      >
        <Camera class="h-3.5 w-3.5" />
        Droit à l'image
      </div>
      <div class="mt-2 font-mono text-2xl font-black">
        {imageCount}<span class="text-base text-muted-foreground">/{total}</span
        >
      </div>
    </div>
  </div>

  <!-- Reminder bulk actions -->
  <Gated group="devLead" mode="hide">
    <div
      class="flex items-center gap-3 rounded-sm border border-dashed border-border bg-muted/30 px-4 py-3"
    >
      <Send class="h-4 w-4 text-muted-foreground" />
      <span class="text-sm text-muted-foreground">
        {selectedTalentIds.size} sélectionné{selectedTalentIds.size > 1
          ? 's'
          : ''}
      </span>
      <Button
        size="sm"
        variant="outline"
        disabled={selectedTalentIds.size === 0}
        onclick={() => prepareSend('student')}
      >
        <Send class="mr-2 h-3.5 w-3.5" />
        Relancer étudiants
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={selectedTalentIds.size === 0}
        onclick={() => prepareSend('parent')}
      >
        <Send class="mr-2 h-3.5 w-3.5" />
        Relancer parents
      </Button>
    </div>
  </Gated>

  <SuiviAdmTable
    {participations}
    {optimisticAdminToggle}
    {optimisticPcToggle}
    {selectedTalentIds}
    onToggleTalent={toggleTalent}
    onToggleAll={toggleAllTalents}
  />
</div>

<!-- Confirm dialog -->
<AlertDialog.Root bind:open={showConfirm}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Confirmer l'envoi</AlertDialog.Title>
      <AlertDialog.Description>
        Envoyer une relance {sendType === 'student' ? 'étudiant' : 'parent'} à
        <strong>{selectedTalentIds.size}</strong>
        destinataire{selectedTalentIds.size > 1 ? 's' : ''} ? Les relances envoyées
        il y a moins de 3 jours seront ignorées.
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Annuler</AlertDialog.Cancel>
      <form method="POST" action="?/sendReminders" use:reminderEnhance>
        {#each [...selectedTalentIds] as id}
          <input type="hidden" name="talentIds" value={id} />
        {/each}
        <input type="hidden" name="type" value={sendType} />
        <Button type="submit" onclick={() => (showConfirm = false)}>
          Envoyer
        </Button>
      </form>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
