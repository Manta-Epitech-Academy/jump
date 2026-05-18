<script lang="ts">
  import { resolve } from '$app/paths';
  import UserPlus from '@lucide/svelte/icons/user-plus';
  import GraduationCap from '@lucide/svelte/icons/graduation-cap';
  import type { PageData } from './$types';
  import { Button } from '$lib/components/ui/button';
  import PageBreadcrumb from '$lib/components/layout/PageBreadcrumb.svelte';
  import Gated from '$lib/components/auth/Gated.svelte';
  import { STAGE_SECONDE_LABEL } from '$lib/domain/event';
  import TeamMemberCard from './components/TeamMemberCard.svelte';
  import AddMemberDialog from './components/AddMemberDialog.svelte';

  let { data }: { data: PageData } = $props();

  let dialogOpen = $state(false);

  let pedaList = $derived(data.assigned.filter((m) => m.staffRole === 'peda'));
  let mantaList = $derived(
    data.assigned.filter((m) => m.staffRole === 'manta'),
  );
  let totalEvents = $derived(
    data.assigned.reduce((sum, m) => sum + m._count.eventMantas, 0),
  );
</script>

<svelte:head>
  <title>{STAGE_SECONDE_LABEL} — Intervenants</title>
</svelte:head>

<div class="flex h-full flex-col space-y-6 pb-10">
  <PageBreadcrumb
    items={[
      {
        label: STAGE_SECONDE_LABEL,
        href: resolve(`/staff/dev/events/${data.event.id}`),
      },
      { label: 'Intervenants' },
    ]}
  />

  <div
    class="relative overflow-hidden rounded-sm border bg-gradient-to-br from-epi-blue/5 via-card to-epi-teal/5 p-6 shadow-sm"
  >
    <div class="flex flex-col items-start gap-4 sm:flex-row">
      <div class="min-w-0 flex-1 space-y-3">
        <h1 class="text-3xl font-bold text-epi-blue uppercase">
          Intervenants<span class="text-epi-teal">_</span>
        </h1>
        {#if data.assigned.length === 0}
          <p class="text-sm text-muted-foreground">
            Aucun membre encore assigné. Constituez votre équipe pour ce stage.
          </p>
        {:else}
          <p class="text-sm text-muted-foreground">
            <span class="font-bold text-foreground">
              {data.assigned.length}
              {data.assigned.length > 1 ? 'personnes' : 'personne'}
            </span>
            qui {data.assigned.length > 1 ? 'accompagneront' : 'accompagnera'} vos
            talents —
            <span class="font-mono font-bold text-epi-teal-solid">
              {pedaList.length}
            </span>
            pédago{pedaList.length > 1 ? 's' : ''} et
            <span class="font-mono font-bold text-epi-blue">
              {mantaList.length}
            </span>
            manta{mantaList.length > 1 ? 's' : ''}, cumulant
            <span class="font-mono font-bold text-epi-orange">
              {totalEvents}
            </span>
            événement{totalEvents > 1 ? 's' : ''} d'expérience.
          </p>
        {/if}
      </div>
      <Gated group="devLead" mode="hide">
        <Button
          onclick={() => (dialogOpen = true)}
          class="shrink-0 cursor-pointer gap-2 rounded-sm shadow-sm"
        >
          <UserPlus class="h-4 w-4" />
          Ajouter un membre
        </Button>
      </Gated>
    </div>
  </div>

  {#if data.assigned.length === 0}
    <div
      class="flex flex-col items-center justify-center rounded-sm border-2 border-dashed border-border bg-muted/10 py-20 text-center"
    >
      <GraduationCap class="mb-4 h-12 w-12 text-muted-foreground/40" />
      <h3 class="text-sm font-bold tracking-widest uppercase">
        Aucun membre dans l'équipe
      </h3>
      <Gated group="devLead" mode="hide">
        <p class="mt-2 max-w-sm text-xs font-medium text-muted-foreground">
          Cliquez sur «&nbsp;Ajouter un membre&nbsp;» en haut à droite pour
          commencer à constituer votre équipe.
        </p>
      </Gated>
    </div>
  {:else}
    <div class="space-y-8">
      {#if pedaList.length > 0}
        <section>
          <h2
            class="mb-3 flex items-center gap-2 text-xs font-bold tracking-widest text-muted-foreground uppercase"
          >
            <span class="inline-block h-2 w-2 rounded-full bg-epi-teal-solid"
            ></span>
            Référents pédago
            <span class="font-mono text-foreground">({pedaList.length})</span>
          </h2>
          <div
            class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
          >
            {#each pedaList as member (member.id)}
              <TeamMemberCard {member} />
            {/each}
          </div>
        </section>
      {/if}
      {#if mantaList.length > 0}
        <section>
          <h2
            class="mb-3 flex items-center gap-2 text-xs font-bold tracking-widest text-muted-foreground uppercase"
          >
            <span class="inline-block h-2 w-2 rounded-full bg-epi-blue"></span>
            Mantas
            <span class="font-mono text-foreground">({mantaList.length})</span>
          </h2>
          <div
            class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
          >
            {#each mantaList as member (member.id)}
              <TeamMemberCard {member} />
            {/each}
          </div>
        </section>
      {/if}
    </div>
  {/if}
</div>

<Gated group="devLead" mode="hide">
  <AddMemberDialog bind:open={dialogOpen} available={data.available} />
</Gated>
